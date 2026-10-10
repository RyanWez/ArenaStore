import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { and, eq, or, sql } from "drizzle-orm";
import { getDb, topUpRequests, users } from "@arena/db";
import { MMPayWebhookPayloadSchema } from "@arena/shared";
import { mmpayService } from "../services/mmpay.service";
import { reviewDeposit } from "../services/deposit-review.service";
import { config } from "../config";

const CreateMmpayPaymentBodySchema = z.object({
  telegramId: z.string().min(1),
  amountMmk: z.number().int().min(100),
  intendedProduct: z.string().optional(),
});

const CancelMmpayPaymentBodySchema = z.object({
  telegramId: z.string().min(1),
  reference: z.string().min(1),
});

export const mmpayRoutes: FastifyPluginAsync = async (server) => {
  /**
   * Shared webhook handler function to process incoming callbacks from MyanMyanPay.
   */
  const handleMmpayWebhook = async (request: FastifyRequest, reply: FastifyReply) => {
    const signature =
      (request.headers["x-mmpay-signature"] as string) ||
      (request.headers["x_mmpay_signature"] as string) ||
      "";
    const nonce =
      (request.headers["x-mmpay-nonce"] as string) ||
      (request.headers["x_mmpay_nonce"] as string) ||
      "";

    // Stringify the parsed body to get raw payload representation
    const payloadString = typeof request.body === "string" ? request.body : JSON.stringify(request.body);

    // Verify HMAC-SHA256 signature
    const isValidSignature = mmpayService.verifyWebhookSignature(
      payloadString,
      nonce,
      signature
    );

    if (!isValidSignature && config.NODE_ENV === "production") {
      request.log.warn({ signature, nonce }, "[MMPay Webhook] Signature verification failed");
      return reply.status(401).send({ ok: false, error: "Invalid MMPay webhook signature" });
    }

    // Parse and validate webhook payload structure
    const parseResult = MMPayWebhookPayloadSchema.safeParse(request.body);
    if (!parseResult.success) {
      request.log.warn({ errors: parseResult.error.issues }, "[MMPay Webhook] Invalid payload format");
      return reply.status(400).send({ ok: false, error: "Invalid webhook payload structure" });
    }

    const payload = parseResult.data;
    const db = getDb();

    // Find matching top-up request by reference or MMPay orderId
    const [topUp] = await db
      .select()
      .from(topUpRequests)
      .where(
        or(
          eq(topUpRequests.reference, payload.orderId),
          eq(topUpRequests.mmpayOrderId, payload.orderId)
        )
      )
      .limit(1);

    if (!topUp) {
      request.log.warn({ orderId: payload.orderId }, "[MMPay Webhook] Top-up request not found");
      return reply.status(404).send({ ok: false, error: "Order not found" });
    }

    request.log.info(
      { topUpId: topUp.id, reference: topUp.reference, status: payload.status, amount: payload.amount },
      "[MMPay Webhook] Processing event"
    );

    // Handle SUCCESS event
    if (payload.status === "SUCCESS") {
      if (topUp.status === "APPROVED") {
        return reply.send({ ok: true, status: "ALREADY_APPROVED" });
      }

      // Store transaction references
      await db
        .update(topUpRequests)
        .set({
          transactionRef: payload.transactionRefId || payload.vendorQrRefId || topUp.transactionRef,
          mmpayVendorQrRef: payload.vendorQrRefId || topUp.mmpayVendorQrRef,
        })
        .where(eq(topUpRequests.id, topUp.id));

      // Use atomic deposit approval service to credit wallet, log audit, and notify user
      const outcome = await reviewDeposit({
        depositId: topUp.id,
        action: "APPROVE",
        actor: {
          kind: "ADMIN",
          adminUserId: null,
        },
      });

      if (!outcome.ok) {
        request.log.warn({ outcome }, "[MMPay Webhook] Deposit review outcome not ok");
      }

      return reply.send({ ok: true, status: "APPROVED" });
    }

    // Handle terminal failure statuses (FAILED, EXPIRED, CANCELLED)
    if (["FAILED", "EXPIRED", "CANCELLED"].includes(payload.status)) {
      if (topUp.status === "SUBMITTED" || topUp.status === "PENDING") {
        await db
          .update(topUpRequests)
          .set({
            status: payload.status,
            rejectReason: `Payment ${payload.status.toLowerCase()} on MyanMyanPay gateway`,
          })
          .where(eq(topUpRequests.id, topUp.id));
      }
      return reply.send({ ok: true, status: payload.status });
    }

    return reply.send({ ok: true, received: true });
  };

  /**
   * Webhook endpoint routes. Supports multiple path aliases to guarantee delivery
   * regardless of whether developer specified full path or base URL in developer portal.
   */
  server.post("/api/webhooks/mmpay", handleMmpayWebhook);
  server.post("/webhooks/mmpay", handleMmpayWebhook);
  server.post("/webhook", handleMmpayWebhook);
  server.post("/", handleMmpayWebhook);

  // Health / verification pings from portal
  server.get("/api/webhooks/mmpay", async (_req, reply) => reply.send({ ok: true, message: "MMPay Webhook endpoint active" }));
  server.get("/webhooks/mmpay", async (_req, reply) => reply.send({ ok: true, message: "MMPay Webhook endpoint active" }));

  /**
   * Creates or returns an active MyanMyanPay MMQR instance for a customer top-up.
   * Strictly enforces MyanMyanPay Rule: Single Active Order per customer until paid or cancelled.
   */
  server.post(
    "/api/payments/mmpay/create",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = CreateMmpayPaymentBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ ok: false, error: "Invalid request parameters" });
      }

      const { telegramId, amountMmk, intendedProduct } = parsed.data;
      const db = getDb();

      // Ensure user exists
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, telegramId))
        .limit(1);

      if (!user) {
        return reply.status(404).send({ ok: false, error: "User not found" });
      }

      // 1. MyanMyanPay Compliance Rule 8 (Single Active Order & Anti-Spam):
      // Check if user already has an active, unexpired PENDING MMPay order
      const [existingActive] = await db
        .select()
        .from(topUpRequests)
        .where(
          and(
            eq(topUpRequests.userId, user.id),
            eq(topUpRequests.paymentMethod, "MMPAY"),
            eq(topUpRequests.status, "PENDING"),
            sql`${topUpRequests.expiresAt} > NOW()`
          )
        )
        .limit(1);

      if (existingActive && existingActive.mmpayQrString) {
        return reply.send({
          ok: true,
          isExisting: true,
          topUpId: existingActive.id,
          reference: existingActive.reference,
          amountMmk: existingActive.amountMmk,
          qr: existingActive.mmpayQrString,
          expiresAt: existingActive.expiresAt?.toISOString(),
        });
      }

      // Auto-expire any previous stale pending MMPay requests
      await db
        .update(topUpRequests)
        .set({ status: "EXPIRED" })
        .where(
          and(
            eq(topUpRequests.userId, user.id),
            eq(topUpRequests.paymentMethod, "MMPAY"),
            eq(topUpRequests.status, "PENDING"),
            sql`${topUpRequests.expiresAt} <= NOW()`
          )
        );

      // Generate unique reference (e.g. MMQR-2026-94829)
      const reference = `MMQR-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes per MMPay compliance

      // 2. Create topup request in DB
      const [newTopUp] = await db
        .insert(topUpRequests)
        .values({
          reference,
          userId: user.id,
          amountMmk,
          paymentMethod: "MMPAY",
          status: "PENDING",
          intendedProduct,
          expiresAt,
        })
        .returning();

      try {
        // 3. Call MyanMyanPay Gateway
        const publicBaseUrl = process.env.PUBLIC_API_URL;
        const callbackUrl = publicBaseUrl ? `${publicBaseUrl.replace(/\/+$/, "")}/api/webhooks/mmpay` : undefined;

        const mmpayRes = await mmpayService.createPayment({
          orderId: reference,
          amountMmk,
          callbackUrl: callbackUrl?.startsWith("http") ? callbackUrl : undefined,
          customMessage: `Arena Store Top-Up ${reference}`,
        });

        // 4. Update topup record with MMQR data
        await db
          .update(topUpRequests)
          .set({
            mmpayOrderId: mmpayRes.orderId,
            mmpayQrString: mmpayRes.qr,
            mmpayVendorQrRef: mmpayRes.vendorQrRefId,
          })
          .where(eq(topUpRequests.id, newTopUp.id));

        return reply.send({
          ok: true,
          isExisting: false,
          topUpId: newTopUp.id,
          reference: newTopUp.reference,
          amountMmk,
          qr: mmpayRes.qr,
          expiresAt: expiresAt.toISOString(),
        });
      } catch (err: any) {
        request.log.error(err, "[MMPay] Payment initiation failed");
        // Mark topup as failed if gateway rejected
        await db
          .update(topUpRequests)
          .set({
            status: "FAILED",
            rejectReason: err.message || "Gateway payment creation failed",
          })
          .where(eq(topUpRequests.id, newTopUp.id));

        return reply.status(502).send({
          ok: false,
          error: `MyanMyanPay gateway error: ${err.message || "Unknown error"}`,
        });
      }
    }
  );

  /**
   * Cancels an active pending MyanMyanPay payment upon customer request,
   * unlocking the single active order restriction.
   */
  server.post(
    "/api/payments/mmpay/cancel",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = CancelMmpayPaymentBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ ok: false, error: "Invalid cancel request parameters" });
      }

      const { telegramId, reference } = parsed.data;
      const db = getDb();

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, telegramId))
        .limit(1);

      if (!user) {
        return reply.status(404).send({ ok: false, error: "User not found" });
      }

      const [topUp] = await db
        .select()
        .from(topUpRequests)
        .where(
          and(
            eq(topUpRequests.userId, user.id),
            or(
              eq(topUpRequests.reference, reference),
              eq(topUpRequests.mmpayOrderId, reference)
            ),
            eq(topUpRequests.status, "PENDING")
          )
        )
        .limit(1);

      if (!topUp) {
        return reply.status(404).send({ ok: false, error: "Active pending order not found" });
      }

      await db
        .update(topUpRequests)
        .set({
          status: "CANCELLED",
          rejectReason: "Cancelled by customer in Telegram bot",
        })
        .where(eq(topUpRequests.id, topUp.id));

      return reply.send({
        ok: true,
        reference: topUp.reference,
        status: "CANCELLED",
      });
    }
  );

  /**
   * Retrieves the current payment status of an MMPay order.
   */
  server.get(
    "/api/payments/mmpay/status/:reference",
    async (request: FastifyRequest<{ Params: { reference: string } }>, reply: FastifyReply) => {
      const { reference } = request.params;
      const db = getDb();

      const [topUp] = await db
        .select()
        .from(topUpRequests)
        .where(
          or(
            eq(topUpRequests.reference, reference),
            eq(topUpRequests.mmpayOrderId, reference)
          )
        )
        .limit(1);

      if (!topUp) {
        return reply.status(404).send({ ok: false, error: "Top-up request not found" });
      }

      // Check if expired
      const isExpired =
        topUp.status === "PENDING" &&
        topUp.expiresAt &&
        new Date(topUp.expiresAt).getTime() < Date.now();

      if (isExpired) {
        await db
          .update(topUpRequests)
          .set({ status: "EXPIRED" })
          .where(eq(topUpRequests.id, topUp.id));
        topUp.status = "EXPIRED";
      }

      return reply.send({
        ok: true,
        topUpId: topUp.id,
        reference: topUp.reference,
        amountMmk: topUp.amountMmk,
        status: topUp.status,
        expiresAt: topUp.expiresAt?.toISOString(),
      });
    }
  );
};

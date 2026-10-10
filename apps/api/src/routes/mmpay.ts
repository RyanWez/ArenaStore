import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import crypto from "node:crypto";
import { z } from "zod";
import { and, eq, or, sql } from "drizzle-orm";
import { getDb, topUpRequests, users } from "@arena/db";
import { MMPayWebhookPayloadSchema } from "@arena/shared";
import { mmpayService } from "../services/mmpay.service";
import { reviewDeposit } from "../services/deposit-review.service";
import { registerRawJsonBodyParser } from "../plugins/raw-body";
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
  // Capture the exact raw request body (scoped to this plugin) so webhook HMAC
  // signatures are verified over the bytes MyanMyanPay actually signed, not a
  // re-serialized copy that JSON.stringify may format differently.
  registerRawJsonBodyParser(server);

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

    // Use the exact raw bytes captured by the raw-body parser; fall back to a
    // re-serialized body only if the raw copy is somehow unavailable.
    const payloadString =
      (request as unknown as { rawBody?: string }).rawBody ??
      (typeof request.body === "string" ? request.body : JSON.stringify(request.body));

    // Verify HMAC-SHA256 signature
    const isValidSignature = mmpayService.verifyWebhookSignature(
      payloadString,
      nonce,
      signature
    );

    // Signature is enforced whenever a secret key is configured — in every
    // environment, not only production. A deployment with real MMPay
    // credentials (staging or prod) therefore always rejects unsigned/forged
    // callbacks. Only a local/dev/test instance with no secret configured
    // skips the check (there is nothing to verify against).
    const signatureRequired = Boolean(config.MMPAY_SECRET_KEY);
    if (!isValidSignature && signatureRequired) {
      request.log.warn({ nonce }, "[MMPay Webhook] Signature verification failed");
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
      // Already-credited guard. Approved MMPay deposits are flipped to
      // "COMPLETED" by reviewDeposit, so that is the status a duplicate SUCCESS
      // callback will see ("APPROVED" kept for backward compatibility).
      if (topUp.status === "COMPLETED" || topUp.status === "APPROVED") {
        return reply.send({ ok: true, status: "ALREADY_APPROVED" });
      }

      // Defense-in-depth: a dynamic MMQR is a fixed-amount, MMK request, so the
      // callback must report the exact amount and currency we created it with.
      // A mismatch means tampering or a gateway anomaly — never auto-credit;
      // leave the request PENDING for manual handling and surface it loudly.
      if (payload.currency && payload.currency !== "MMK") {
        request.log.error(
          { topUpId: topUp.id, reference: topUp.reference, currency: payload.currency },
          "[MMPay Webhook] Rejecting SUCCESS with unexpected currency"
        );
        return reply.status(400).send({ ok: false, error: "Unexpected payment currency" });
      }
      if (payload.amount !== topUp.amountMmk) {
        request.log.error(
          { topUpId: topUp.id, reference: topUp.reference, expected: topUp.amountMmk, received: payload.amount },
          "[MMPay Webhook] Rejecting SUCCESS with amount mismatch"
        );
        return reply.status(400).send({ ok: false, error: "Payment amount mismatch" });
      }

      // Store transaction references
      await db
        .update(topUpRequests)
        .set({
          transactionRef: payload.transactionRefId || payload.vendorQrRefId || topUp.transactionRef,
          mmpayVendorQrRef: payload.vendorQrRefId || topUp.mmpayVendorQrRef,
        })
        .where(eq(topUpRequests.id, topUp.id));

      // Use atomic deposit approval service to credit wallet, log audit, and
      // notify user. `viaGatewayWebhook` lets reviewDeposit credit a PENDING
      // MMPay request — the gateway callback is the only legitimate approver of
      // an MMPay top-up (manual panel/group approval of PENDING MMPay is
      // blocked precisely because the customer may not have paid yet).
      const outcome = await reviewDeposit({
        depositId: topUp.id,
        action: "APPROVE",
        viaGatewayWebhook: true,
        actor: {
          kind: "ADMIN",
          adminUserId: null,
        },
      });

      if (!outcome.ok) {
        request.log.warn({ outcome }, "[MMPay Webhook] Deposit review outcome not ok");
        if (outcome.code === "ALREADY_REVIEWED") {
          return reply.send({ ok: true, status: "ALREADY_APPROVED" });
        }
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
   * Webhook endpoint routes. The developer portal is configured with the full
   * `/api/webhooks/mmpay` path; `/webhooks/mmpay` is kept as a tolerant alias.
   * No root (`/`) or bare `/webhook` catch-all is registered — those shadow
   * unrelated routes and widen the forgeable surface.
   */
  server.post("/api/webhooks/mmpay", handleMmpayWebhook);
  server.post("/webhooks/mmpay", handleMmpayWebhook);

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

      // Collision-resistant reference: base36 timestamp + 32 bits of CSPRNG
      // entropy (same scheme as the bot's TOP-/ARN- generators). The old
      // `Date.now().slice(-6)` + 4 random digits form wrapped every ~16 min and
      // collided on the UNIQUE `reference` column under concurrency.
      const reference = `MMQR-${Date.now().toString(36).toUpperCase()}${crypto
        .randomBytes(4)
        .toString("hex")
        .toUpperCase()}`;
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes per MMPay compliance

      // 2. Create topup request in DB. The partial unique index
      // (uq_topups_user_active_mmpay) guarantees at most one PENDING MMPay row
      // per user, so a concurrent create loses the race here with a unique
      // violation instead of producing a duplicate active order.
      let newTopUp!: typeof topUpRequests.$inferSelect;
      try {
        const [row] = await db
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
        newTopUp = row;
      } catch (insertErr: any) {
        if (insertErr?.code === "23505") {
          // Another concurrent request already holds the single active slot.
          const [concurrent] = await db
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

          if (concurrent?.mmpayQrString) {
            return reply.send({
              ok: true,
              isExisting: true,
              topUpId: concurrent.id,
              reference: concurrent.reference,
              amountMmk: concurrent.amountMmk,
              qr: concurrent.mmpayQrString,
              expiresAt: concurrent.expiresAt?.toISOString(),
            });
          }

          return reply.status(409).send({
            ok: false,
            error: "A payment request is already being prepared. Please try again in a moment.",
          });
        }
        throw insertErr;
      }

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

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import crypto from "node:crypto";
import { z } from "zod";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb, topUpRequests, users } from "@arena/db";
import { MMPayWebhookPayloadSchema } from "@arena/shared";
import { mmpayService } from "../services/mmpay.service";
import { settleMmpaySuccess } from "../services/mmpay-settlement.service";
import { notifyMmpayTopUpFailed } from "../services/telegram-notifier";
import { registerRawJsonBodyParser } from "../plugins/raw-body";
import { enforceInternalToken } from "../lib/internal-auth";
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

    // Handle SUCCESS event — credit via the shared settlement path (identical
    // to the reconciliation sweep), then map its result to the HTTP status the
    // gateway expects (200 settles/dedupes, 4xx rejects, 500 asks for retry).
    if (payload.status === "SUCCESS") {
      const result = await settleMmpaySuccess({
        topUp,
        amount: payload.amount,
        currency: payload.currency,
        transactionRefId: payload.transactionRefId,
        vendorQrRefId: payload.vendorQrRefId,
        source: "webhook",
        log: request.log,
      });

      switch (result.code) {
        case "CREDITED":
          return reply.send({ ok: true, status: "APPROVED" });
        case "ALREADY_CREDITED":
          return reply.send({ ok: true, status: "ALREADY_APPROVED" });
        case "EXPIRED_BEYOND_GRACE":
          return reply.status(409).send({ ok: false, error: "Order expired beyond grace window" });
        case "CURRENCY_MISMATCH":
          return reply.status(400).send({ ok: false, error: "Unexpected payment currency" });
        case "AMOUNT_MISMATCH":
          return reply.status(400).send({ ok: false, error: "Payment amount mismatch" });
        case "CREDIT_FAILED":
        default:
          // Credit did not happen — report so MyanMyanPay retries rather than
          // silently dropping a paid order.
          return reply.status(500).send({ ok: false, error: "Deposit credit failed" });
      }
    }

    // Handle terminal failure statuses (FAILED, EXPIRED, CANCELLED)
    if (["FAILED", "EXPIRED", "CANCELLED"].includes(payload.status)) {
      // Only transition a still-live request. The guarded, returning UPDATE
      // doubles as a dedup claim: a duplicate terminal callback matches no row
      // and does nothing.
      const transitioned =
        topUp.status === "SUBMITTED" || topUp.status === "PENDING"
          ? await db
              .update(topUpRequests)
              .set({
                status: payload.status,
                rejectReason: `Payment ${payload.status.toLowerCase()} on MyanMyanPay gateway`,
              })
              .where(
                and(
                  eq(topUpRequests.id, topUp.id),
                  inArray(topUpRequests.status, ["SUBMITTED", "PENDING"])
                )
              )
              .returning({ id: topUpRequests.id })
          : [];

      // FAILED / CANCELLED get a customer-facing card (EXPIRED UX is owned by
      // the bot's invoice scheduler). Fire-and-forget with the same one-time
      // claim the success path uses, so the gateway ack isn't delayed and the
      // bot's manual Refresh never posts a duplicate. Release the claim if the
      // push is dropped so Refresh can retry.
      if (transitioned.length > 0 && (payload.status === "FAILED" || payload.status === "CANCELLED")) {
        const qrMessageId = topUp.mmpayQrMessageId;
        const failKind = payload.status;
        const userId = topUp.userId;
        void (async () => {
          const claimed = await db
            .update(topUpRequests)
            .set({ mmpaySuccessNotifiedAt: new Date() })
            .where(and(eq(topUpRequests.id, topUp.id), isNull(topUpRequests.mmpaySuccessNotifiedAt)))
            .returning({ id: topUpRequests.id });
          if (claimed.length === 0) return;

          const [customer] = await db
            .select({ telegramId: users.telegramId })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

          const delivered = await notifyMmpayTopUpFailed({
            telegramId: customer?.telegramId ?? "",
            qrMessageId,
            reference: topUp.reference,
            kind: failKind,
          });

          if (!delivered) {
            await db
              .update(topUpRequests)
              .set({ mmpaySuccessNotifiedAt: null })
              .where(eq(topUpRequests.id, topUp.id));
            request.log.warn(
              { reference: topUp.reference },
              "[MMPay Webhook] terminal card not delivered — released for customer Refresh retry"
            );
          }
        })().catch((err: any) =>
          request.log.warn({ err: err?.message }, "[MMPay Webhook] MMQR terminal notification failed")
        );
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
      // Internal, bot-only route: guarded by the shared internal-service token
      // (the Telegram bot sends `x-internal-token`). Without this, anyone able
      // to reach the public API could spawn MMQR orders for any telegramId.
      if (!enforceInternalToken(request, reply)) return;

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

      // 1. Reclaim unusable slots BEFORE the single-active-order check. Expire
      // two kinds of PENDING MMPay rows that must not hold the slot:
      //   a) time-expired rows (past their 15-min window), and
      //   b) *orphaned* rows left without a QR string by a process crash
      //      mid-create — the insert (below) committed but the gateway update
      //      that writes mmpayQrString never ran. Such a row has no QR to show,
      //      so without this it would hold the single-active-order slot for the
      //      full 15 minutes, blocking the user from both creating a new order
      //      and reusing the broken one. A short grace window (2 min) spares a
      //      genuinely in-flight concurrent create whose gateway call is still
      //      running.
      await db
        .update(topUpRequests)
        .set({ status: "EXPIRED" })
        .where(
          and(
            eq(topUpRequests.userId, user.id),
            eq(topUpRequests.paymentMethod, "MMPAY"),
            eq(topUpRequests.status, "PENDING"),
            or(
              sql`${topUpRequests.expiresAt} <= NOW()`,
              sql`(${topUpRequests.mmpayQrString} IS NULL AND ${topUpRequests.createdAt} <= NOW() - INTERVAL '2 minutes')`
            )
          )
        );

      // 2. MyanMyanPay Compliance Rule 8 (Single Active Order & Anti-Spam):
      // reuse a still-active order that already has a QR instead of creating a
      // duplicate. A no-QR row surviving the reclaim above is an in-flight
      // concurrent create; it falls through to the insert, which loses the
      // unique-index race and returns 409 "being prepared" (transient).
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
        const publicBaseUrl = config.PUBLIC_API_URL;
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
      // Internal, bot-only route — see create handler. Prevents a stranger from
      // cancelling another customer's pending order by guessing its reference.
      if (!enforceInternalToken(request, reply)) return;

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

      // Status-guarded cancel: a SUCCESS webhook may credit this order in the
      // window between the SELECT above and this UPDATE. Guarding on
      // status='PENDING' (with returning) means a just-credited order is NOT
      // overwritten to CANCELLED — the wallet credit and the row status can
      // never disagree. If we lose the race, report the real settled status so
      // the bot tells the customer the truth instead of "cancelled".
      const cancelled = await db
        .update(topUpRequests)
        .set({
          status: "CANCELLED",
          rejectReason: "Cancelled by customer in Telegram bot",
        })
        .where(and(eq(topUpRequests.id, topUp.id), eq(topUpRequests.status, "PENDING")))
        .returning({ id: topUpRequests.id });

      if (cancelled.length === 0) {
        const [fresh] = await db
          .select({ status: topUpRequests.status })
          .from(topUpRequests)
          .where(eq(topUpRequests.id, topUp.id))
          .limit(1);
        return reply.send({
          ok: true,
          reference: topUp.reference,
          amountMmk: topUp.amountMmk,
          status: fresh?.status ?? topUp.status,
          cancelled: false,
        });
      }

      return reply.send({
        ok: true,
        reference: topUp.reference,
        amountMmk: topUp.amountMmk,
        status: "CANCELLED",
        cancelled: true,
      });
    }
  );

  /**
   * Retrieves the current payment status of an MMPay order.
   */
  server.get(
    "/api/payments/mmpay/status/:reference",
    async (request: FastifyRequest<{ Params: { reference: string } }>, reply: FastifyReply) => {
      // Internal, bot-only route — see create handler. Prevents enumeration of
      // top-up references/amounts by an unauthenticated caller.
      if (!enforceInternalToken(request, reply)) return;

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

      // Refresh self-recovery: if the order is still PENDING and the gateway is
      // configured, pull its real status now so a webhook that was never
      // delivered is reconciled the moment the customer presses "Refresh". The
      // periodic sweep is the no-user-action safety net; this makes recovery
      // instant on demand. Best-effort — a gateway error just falls through to
      // the local status.
      if (topUp.status === "PENDING" && mmpayService.ready) {
        try {
          const gw = await mmpayService.getPaymentStatus(topUp.mmpayOrderId ?? topUp.reference);
          if (gw.status === "SUCCESS") {
            await settleMmpaySuccess({
              topUp,
              amount: gw.amount ?? topUp.amountMmk,
              currency: gw.currency,
              transactionRefId: gw.transactionRefId,
              vendorQrRefId: gw.vendorQrRefId,
              source: "reconcile",
              log: request.log,
            });
            const [fresh] = await db
              .select({ status: topUpRequests.status })
              .from(topUpRequests)
              .where(eq(topUpRequests.id, topUp.id))
              .limit(1);
            if (fresh) topUp.status = fresh.status;
          }
        } catch (err: any) {
          request.log.warn(
            { err: err?.message, reference: topUp.reference },
            "[MMPay] on-demand status reconcile failed"
          );
        }
      }

      // Check if expired (only if the on-demand reconcile above didn't settle it)
      const isExpired =
        topUp.status === "PENDING" &&
        topUp.expiresAt &&
        new Date(topUp.expiresAt).getTime() < Date.now();

      if (isExpired) {
        // Status-guarded expiry: never overwrite a row a webhook just credited
        // in this same window. If the guarded UPDATE matches no row, the order
        // settled concurrently — re-read and report the real status.
        const expired = await db
          .update(topUpRequests)
          .set({ status: "EXPIRED" })
          .where(and(eq(topUpRequests.id, topUp.id), eq(topUpRequests.status, "PENDING")))
          .returning({ id: topUpRequests.id });
        if (expired.length > 0) {
          topUp.status = "EXPIRED";
        } else {
          const [fresh] = await db
            .select({ status: topUpRequests.status })
            .from(topUpRequests)
            .where(eq(topUpRequests.id, topUp.id))
            .limit(1);
          if (fresh) topUp.status = fresh.status;
        }
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

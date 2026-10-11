import { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config";
import { reviewDeposit } from "../services/deposit-review.service";
import { broadcastAdminEvent } from "../services/admin-event.service";
import { internalTokenMatches } from "../lib/internal-auth";

const BotDepositReviewSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  actorTelegramId: z.string().min(1).max(64),
  actorUsername: z.string().max(64).optional(),
});

/**
 * Internal endpoints called by the bot process only (x-internal-token shared
 * secret). These sit outside the /api/admin/ session hook in server.ts — the
 * bot is a service, not an admin browser session.
 */
export async function botRoutes(server: FastifyInstance) {
  if (!config.INTERNAL_API_TOKEN) {
    server.log.warn(
      "[Bot] INTERNAL_API_TOKEN is not set — internal bot endpoints reject every request."
    );
  }

  // POST /api/bot/deposits/:id/review — the Telegram admin group's
  // ✅/❌ inline buttons land here. Same review implementation as the panel,
  // so wallet credit, ledger, notifications and the audit trail stay identical
  // no matter which surface an admin uses. Returns the reviewed deposit's
  // details so the bot can edit the group message with the outcome.
  server.post<{ Params: { id: string } }>("/api/bot/deposits/:id/review", async (request, reply) => {
    if (!internalTokenMatches(request.headers["x-internal-token"] as string | undefined)) {
      return reply.status(401).send({ ok: false, error: "Unauthorized" });
    }

    const depositId = Number.parseInt(request.params.id, 10);
    if (!Number.isInteger(depositId) || depositId <= 0) {
      return reply.status(400).send({ ok: false, error: "Invalid deposit id" });
    }

    const parseRes = BotDepositReviewSchema.safeParse(request.body);
    if (!parseRes.success) {
      return reply.status(400).send({
        ok: false,
        error: "Validation failed",
        issues: parseRes.error.issues,
      });
    }

    const result = await reviewDeposit({
      depositId,
      action: parseRes.data.action,
      actor: {
        kind: "TELEGRAM",
        telegramId: parseRes.data.actorTelegramId,
        telegramUsername: parseRes.data.actorUsername,
      },
    });

    if (result.ok) {
      broadcastAdminEvent("DEPOSIT_REVIEWED", {
        depositId,
        action: result.action,
      });
      return result;
    }
    if (result.code === "NOT_FOUND") {
      return reply.status(404).send({ ok: false, error: "Deposit request not found" });
    }
    if (result.code === "MMPAY_AUTO_ONLY") {
      return reply.status(409).send({
        ok: false,
        error:
          "This MyanMyanPay deposit is confirmed automatically by the payment gateway and cannot be reviewed manually.",
      });
    }
    // ALREADY_REVIEWED — 409 carries the current state so the bot can render
    // "another admin already reviewed this" on the stale group message.
    return reply.status(409).send(result);
  });

  // POST /api/bot/events — internal event dispatch from bot process to admin SSE stream
  server.post<{
    Body: { type: "ORDER_CREATED" | "DEPOSIT_SUBMITTED"; payload?: Record<string, any> };
  }>("/api/bot/events", async (request, reply) => {
    if (!internalTokenMatches(request.headers["x-internal-token"] as string | undefined)) {
      return reply.status(401).send({ ok: false, error: "Unauthorized" });
    }

    const { type, payload } = request.body || {};
    if (type) {
      broadcastAdminEvent(type, payload);
    }
    return { ok: true };
  });
}

import { and, eq, isNull } from "drizzle-orm";
import { getDb, topUpRequests, users } from "@arena/db";
import { TopUpStatus } from "@arena/shared";
import { reviewDeposit } from "./deposit-review.service";
import { notifyMmpayTopUpSuccess, notifyMmpayReconcileAlert } from "./telegram-notifier";

/**
 * A SUCCESS may land after our local 15-min timer already flipped the order to
 * EXPIRED. The gateway is authoritative about money received, so we still honor
 * a late SUCCESS within this grace window; beyond it the row is too stale to
 * auto-credit and goes to manual reconciliation.
 */
export const MMPAY_LATE_SUCCESS_GRACE_MS = 30 * 60 * 1000;

export type MmpaySuccessCode =
  | "CREDITED"
  | "ALREADY_CREDITED"
  | "EXPIRED_BEYOND_GRACE"
  | "CURRENCY_MISMATCH"
  | "AMOUNT_MISMATCH"
  | "CREDIT_FAILED";

export interface SettleLogger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

export interface SettleMmpaySuccessParams {
  /** The already-fetched top-up row to settle. */
  topUp: typeof topUpRequests.$inferSelect;
  /** Amount the gateway reported as paid (MMK). */
  amount: number;
  /** Currency the gateway reported; undefined is treated as MMK. */
  currency?: string | null;
  transactionRefId?: string | null;
  vendorQrRefId?: string | null;
  /** Who triggered settlement — for log attribution only. */
  source: "webhook" | "reconcile";
  log: SettleLogger;
}

/**
 * Credits a paid MMQR top-up — the single source of truth shared by the gateway
 * webhook and the periodic reconciliation sweep, so the two can never diverge
 * (status-vocabulary drift between them was the root cause of earlier bugs).
 *
 * Idempotent: the actual credit happens inside `reviewDeposit`'s guarded,
 * transactional status claim, so a webhook, a Refresh and a reconcile tick all
 * racing on the same order still credit the wallet exactly once. The caller
 * maps the returned code to its own transport (HTTP status for the webhook,
 * a log line for the sweep).
 */
export async function settleMmpaySuccess(
  params: SettleMmpaySuccessParams
): Promise<{ code: MmpaySuccessCode }> {
  const { topUp, amount, currency, transactionRefId, vendorQrRefId, source, log } = params;
  const db = getDb();

  // Already credited — a duplicate webhook, or a sweep tick after the webhook
  // already settled it. reviewDeposit flips approved MMPay deposits to
  // COMPLETED ("APPROVED" kept for backward compatibility).
  if (topUp.status === TopUpStatus.COMPLETED || topUp.status === TopUpStatus.APPROVED) {
    return { code: "ALREADY_CREDITED" };
  }

  // A SUCCESS on a row our timer already EXPIRED is honored within the grace
  // window; beyond it we refuse to auto-credit a stale row and alert instead.
  const isLateExpired = topUp.status === TopUpStatus.EXPIRED;
  if (isLateExpired) {
    const expiredAtMs = topUp.expiresAt ? new Date(topUp.expiresAt).getTime() : 0;
    if (expiredAtMs && Date.now() - expiredAtMs > MMPAY_LATE_SUCCESS_GRACE_MS) {
      log.warn(
        { topUpId: topUp.id, reference: topUp.reference, source },
        "[MMPay Settle] SUCCESS for long-expired order — needs manual reconcile"
      );
      await fireReconcileAlertOnce(topUp, {
        reason: "SUCCESS arrived after the order expired (beyond the grace window).",
        gatewayAmount: amount,
        gatewayCurrency: currency,
      });
      return { code: "EXPIRED_BEYOND_GRACE" };
    }
  }

  // Fixed-amount MMK dynamic QR: a mismatch means tampering or a gateway
  // anomaly. Never auto-credit — leave PENDING for a human and alert loudly.
  if (currency && currency !== "MMK") {
    log.error(
      { topUpId: topUp.id, reference: topUp.reference, currency, source },
      "[MMPay Settle] Rejecting SUCCESS with unexpected currency"
    );
    await fireReconcileAlertOnce(topUp, {
      reason: `Gateway reported a non-MMK currency (${currency}).`,
      gatewayAmount: amount,
      gatewayCurrency: currency,
    });
    return { code: "CURRENCY_MISMATCH" };
  }
  if (amount !== topUp.amountMmk) {
    log.error(
      { topUpId: topUp.id, reference: topUp.reference, expected: topUp.amountMmk, received: amount, source },
      "[MMPay Settle] Rejecting SUCCESS with amount mismatch"
    );
    await fireReconcileAlertOnce(topUp, {
      reason: `Gateway amount does not match the request (expected ${topUp.amountMmk}, got ${amount}).`,
      gatewayAmount: amount,
      gatewayCurrency: currency,
    });
    return { code: "AMOUNT_MISMATCH" };
  }

  // Store transaction references (best-effort, before the credit claim).
  await db
    .update(topUpRequests)
    .set({
      transactionRef: transactionRefId || vendorQrRefId || topUp.transactionRef,
      mmpayVendorQrRef: vendorQrRefId || topUp.mmpayVendorQrRef,
    })
    .where(eq(topUpRequests.id, topUp.id));

  const outcome = await reviewDeposit({
    depositId: topUp.id,
    action: "APPROVE",
    viaGatewayWebhook: true,
    // Always allow an in-grace EXPIRED row to credit, and close the race where
    // our scheduler flips PENDING→EXPIRED while this very settlement runs.
    gatewayGraceExpired: true,
    // The settlement owns the single customer-facing success card below and
    // MMPay auto-payments shouldn't spam the admin group.
    notifyCustomer: false,
    notifyGroup: false,
    actor: { kind: "ADMIN", adminUserId: null },
  });

  if (!outcome.ok) {
    if (outcome.code === "ALREADY_REVIEWED") {
      return { code: "ALREADY_CREDITED" };
    }
    log.warn({ outcome, source }, "[MMPay Settle] Deposit review outcome not ok");
    return { code: "CREDIT_FAILED" };
  }

  // Fire-and-forget the single success card. mmpay_success_notified_at is the
  // one-time claim deduping this against the bot's manual Refresh; a failed
  // send releases the claim so Refresh can retry.
  const newBalanceMmk = outcome.action === "APPROVED" ? outcome.newBalanceMmk : topUp.amountMmk;
  const telegramId = outcome.telegramId ?? "";
  const qrMessageId = topUp.mmpayQrMessageId;
  void (async () => {
    const claimed = await db
      .update(topUpRequests)
      .set({ mmpaySuccessNotifiedAt: new Date() })
      .where(and(eq(topUpRequests.id, topUp.id), isNull(topUpRequests.mmpaySuccessNotifiedAt)))
      .returning({ id: topUpRequests.id });
    if (claimed.length === 0) return;

    const delivered = await notifyMmpayTopUpSuccess({
      telegramId,
      qrMessageId,
      reference: topUp.reference,
      amountMmk: topUp.amountMmk,
      newBalanceMmk,
    });

    if (!delivered) {
      await db
        .update(topUpRequests)
        .set({ mmpaySuccessNotifiedAt: null })
        .where(eq(topUpRequests.id, topUp.id));
      log.warn(
        { reference: topUp.reference, source },
        "[MMPay Settle] success card not delivered — released for customer Refresh retry"
      );
    }
  })().catch((err: any) =>
    log.warn({ err: err?.message, source }, "[MMPay Settle] MMQR success notification failed")
  );

  return { code: "CREDITED" };
}

/**
 * Posts the admin "manual reconcile" alert at most once per order, claimed via
 * a guarded UPDATE on mmpay_reconcile_alerted_at so neither the webhook nor the
 * repeated reconcile sweep can spam it. Fully best-effort — never throws.
 */
async function fireReconcileAlertOnce(
  topUp: typeof topUpRequests.$inferSelect,
  details: { reason: string; gatewayAmount?: number | null; gatewayCurrency?: string | null }
): Promise<void> {
  try {
    const db = getDb();
    const claimed = await db
      .update(topUpRequests)
      .set({ mmpayReconcileAlertedAt: new Date() })
      .where(and(eq(topUpRequests.id, topUp.id), isNull(topUpRequests.mmpayReconcileAlertedAt)))
      .returning({ id: topUpRequests.id });
    if (claimed.length === 0) return;

    let telegramId: string | null = null;
    try {
      const [customer] = await db
        .select({ telegramId: users.telegramId })
        .from(users)
        .where(eq(users.id, topUp.userId))
        .limit(1);
      telegramId = customer?.telegramId ?? null;
    } catch {
      // telegramId is a nice-to-have on the alert
    }

    await notifyMmpayReconcileAlert({
      reference: topUp.reference,
      reason: details.reason,
      expectedAmountMmk: topUp.amountMmk,
      gatewayAmount: details.gatewayAmount ?? null,
      gatewayCurrency: details.gatewayCurrency ?? null,
      telegramId,
    });
  } catch {
    // The alert must never disrupt or fail the payment path.
  }
}

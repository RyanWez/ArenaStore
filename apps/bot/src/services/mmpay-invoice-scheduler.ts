import type { Bot } from "grammy";
import { and, eq, isNotNull } from "drizzle-orm";
import { getDb, topUpRequests, users } from "@arena/db";
import {
  formatMmpayQrInvoiceMessage,
  formatMmpayExpiredMessage,
} from "../formatters/messages";
import { buildMmpayInvoiceKeyboard, buildWalletKeyboard } from "../keyboards/store.keyboards";
import type { BotContext } from "../types";

const TICK_MS = 60 * 1000; // countdown refresh + expiry sweep cadence
const API_TIMEOUT_MS = 10 * 1000; // never let one hung Telegram call wedge a tick
const MAX_TICK_MS = 2 * 60 * 1000; // escape hatch: a tick this old is treated as dead

interface InvoiceRow {
  id: number;
  reference: string;
  amountMmk: number;
  status: string;
  qrMessageId: number | null;
  expiresAt: Date | null;
  telegramId: string | null;
}

/** Rejects after `ms` so a stalled Telegram request can never hang the tick. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("mmpay-scheduler: op timed out")), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

/**
 * Background janitor for MMQR invoice messages. `mmpay_qr_message_id IS NOT NULL`
 * means "a live QR invoice message still needs managing", so every such row is
 * handled here regardless of status:
 *   - PENDING, not expired  → refresh the live countdown caption.
 *   - PENDING, past expiry   → claim-expire (PENDING→EXPIRED), delete the QR,
 *                              post the "expired" notice.
 *   - already EXPIRED        → delete the QR + post the "expired" notice (covers
 *                              rows flipped by /status lazy-expiry or the create
 *                              flow, which do not touch Telegram).
 *   - CANCELLED / FAILED / COMPLETED → just delete the stale QR (the success /
 *                              cancel flows already sent their own message).
 * Every terminal path atomically CAS-nulls mmpay_qr_message_id, so this sweep,
 * the gateway webhook and the manual Refresh never double-act on one invoice.
 *
 * Hardening: every Telegram call is time-bounded, and the overlap guard is an
 * age check (not a boolean), so a stalled call can never freeze the scheduler —
 * the regression that previously stopped countdowns mid-way and skipped expiry.
 */
export function startMmpayInvoiceScheduler(bot: Bot<BotContext>): { stop: () => void } {
  let tickStartedAt = 0;

  async function claimCleanup(id: number): Promise<boolean> {
    const claimed = await getDb()
      .update(topUpRequests)
      .set({ mmpayQrMessageId: null })
      .where(and(eq(topUpRequests.id, id), isNotNull(topUpRequests.mmpayQrMessageId)))
      .returning({ id: topUpRequests.id });
    return claimed.length > 0;
  }

  async function handleRow(row: InvoiceRow): Promise<void> {
    if (!row.telegramId || !row.qrMessageId) return;
    const chatId = row.telegramId;
    const msgId = row.qrMessageId;
    const expired = row.expiresAt ? new Date(row.expiresAt).getTime() <= Date.now() : true;

    // Still live and unpaid → tick the countdown caption.
    if (row.status === "PENDING" && !expired) {
      await withTimeout(
        bot.api.editMessageCaption(chatId, msgId, {
          caption: formatMmpayQrInvoiceMessage({
            amountMmk: row.amountMmk,
            reference: row.reference,
            expiresAt: row.expiresAt ?? new Date(),
          }),
          parse_mode: "HTML",
          reply_markup: buildMmpayInvoiceKeyboard(row.reference),
        }),
        API_TIMEOUT_MS
      ).catch(() => {});
      return;
    }

    // Terminal cleanup. For a still-PENDING-but-expired row, flip it first,
    // guarded on status='PENDING' so a concurrent paying webhook always wins.
    let announceExpiry = row.status === "EXPIRED";
    if (row.status === "PENDING") {
      const flipped = await getDb()
        .update(topUpRequests)
        .set({ status: "EXPIRED", mmpayQrMessageId: null })
        .where(and(eq(topUpRequests.id, row.id), eq(topUpRequests.status, "PENDING")))
        .returning({ id: topUpRequests.id });
      if (flipped.length === 0) return; // got paid / handled elsewhere this instant
      announceExpiry = true;
    } else {
      // Already terminal (EXPIRED/CANCELLED/FAILED/COMPLETED). Claim the QR so we
      // only clean it once and don't duplicate a Refresh/webhook message.
      const owns = await claimCleanup(row.id);
      if (!owns) return;
    }

    await withTimeout(bot.api.deleteMessage(chatId, msgId), API_TIMEOUT_MS).catch(() => {});

    if (announceExpiry) {
      await withTimeout(
        bot.api.sendMessage(chatId, formatMmpayExpiredMessage(), {
          parse_mode: "HTML",
          reply_markup: buildWalletKeyboard(),
        }),
        API_TIMEOUT_MS
      ).catch(() => {});
    }
  }

  async function tick(): Promise<void> {
    const now = Date.now();
    // Overlap guard by age: a tick older than MAX_TICK_MS is assumed dead so a
    // single wedged iteration can never permanently stop the sweep.
    if (tickStartedAt && now - tickStartedAt < MAX_TICK_MS) return;
    tickStartedAt = now;
    try {
      const rows: InvoiceRow[] = await getDb()
        .select({
          id: topUpRequests.id,
          reference: topUpRequests.reference,
          amountMmk: topUpRequests.amountMmk,
          status: topUpRequests.status,
          qrMessageId: topUpRequests.mmpayQrMessageId,
          expiresAt: topUpRequests.expiresAt,
          telegramId: users.telegramId,
        })
        .from(topUpRequests)
        .innerJoin(users, eq(topUpRequests.userId, users.id))
        .where(
          and(
            eq(topUpRequests.paymentMethod, "MMPAY"),
            isNotNull(topUpRequests.mmpayQrMessageId)
          )
        );

      for (const row of rows) {
        await handleRow(row).catch((err: any) =>
          console.warn("[MmpayInvoiceScheduler] row error:", row.reference, err?.message || err)
        );
      }
    } catch (err: any) {
      console.warn("[MmpayInvoiceScheduler] tick error:", err?.message || err);
    } finally {
      tickStartedAt = 0;
    }
  }

  const timer = setInterval(() => void tick(), TICK_MS);
  if (typeof timer.unref === "function") timer.unref();
  // Reconcile shortly after boot so invoices that expired while the process was
  // down (or while a previous sweep was wedged) get cleaned up promptly.
  const kickoff = setTimeout(() => void tick(), 5000);
  if (typeof kickoff.unref === "function") kickoff.unref();

  return {
    stop: () => {
      clearInterval(timer);
      clearTimeout(kickoff);
    },
  };
}

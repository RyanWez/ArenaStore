import type { Bot } from "grammy";
import { and, eq, isNotNull, lte, sql } from "drizzle-orm";
import { getDb, topUpRequests, users } from "@arena/db";
import {
  formatMmpayQrInvoiceMessage,
  formatMmpayExpiredMessage,
} from "../formatters/messages";
import { buildMmpayInvoiceKeyboard, buildWalletKeyboard } from "../keyboards/store.keyboards";
import type { BotContext } from "../types";

const TICK_MS = 60 * 1000; // 1 minute: countdown refresh + expiry sweep cadence

interface ActiveInvoice {
  id: number;
  reference: string;
  amountMmk: number;
  qrMessageId: number | null;
  expiresAt: Date | null;
  telegramId: string | null;
}

/**
 * Background sweep for live MMQR invoices. Every tick it:
 *  1. Refreshes the countdown caption of each unexpired PENDING invoice so the
 *     customer sees the remaining minutes tick down without pressing Refresh.
 *  2. Atomically flips any invoice past its expiry to EXPIRED, deletes the stale
 *     QR photo, and posts the "expired" notice — again, no Refresh needed.
 *
 * The expiry UPDATE is guarded on status='PENDING', so an in-flight SUCCESS
 * webhook (which flips the row to COMPLETED) always wins and is never expired
 * out from under the customer.
 */
export function startMmpayInvoiceScheduler(bot: Bot<BotContext>): { stop: () => void } {
  let running = false;

  async function tick(): Promise<void> {
    if (running) return; // never overlap ticks
    running = true;
    try {
      const db = getDb();
      const now = new Date();

      const rows: ActiveInvoice[] = await db
        .select({
          id: topUpRequests.id,
          reference: topUpRequests.reference,
          amountMmk: topUpRequests.amountMmk,
          qrMessageId: topUpRequests.mmpayQrMessageId,
          expiresAt: topUpRequests.expiresAt,
          telegramId: users.telegramId,
        })
        .from(topUpRequests)
        .innerJoin(users, eq(topUpRequests.userId, users.id))
        .where(
          and(
            eq(topUpRequests.paymentMethod, "MMPAY"),
            eq(topUpRequests.status, "PENDING"),
            isNotNull(topUpRequests.mmpayQrMessageId)
          )
        );

      for (const row of rows) {
        if (!row.telegramId || !row.qrMessageId || !row.expiresAt) continue;
        const expired = new Date(row.expiresAt).getTime() <= now.getTime();

        if (expired) {
          // Atomically claim the expiry so a concurrent SUCCESS webhook (which
          // sets COMPLETED) is never clobbered — only a still-PENDING row flips.
          const claimed = await db
            .update(topUpRequests)
            .set({ status: "EXPIRED", mmpayQrMessageId: null })
            .where(and(eq(topUpRequests.id, row.id), eq(topUpRequests.status, "PENDING")))
            .returning({ id: topUpRequests.id });

          if (claimed.length === 0) continue; // got paid / handled elsewhere

          await bot.api.deleteMessage(row.telegramId, row.qrMessageId).catch(() => {});
          await bot.api
            .sendMessage(row.telegramId, formatMmpayExpiredMessage(), {
              parse_mode: "HTML",
              reply_markup: buildWalletKeyboard(),
            })
            .catch(() => {});
        } else {
          // Refresh the live countdown caption. "message is not modified" (same
          // minute) and transient Telegram errors are expected and ignored.
          await bot.api
            .editMessageCaption(row.telegramId, row.qrMessageId, {
              caption: formatMmpayQrInvoiceMessage({
                amountMmk: row.amountMmk,
                reference: row.reference,
                expiresAt: new Date(row.expiresAt),
              }),
              parse_mode: "HTML",
              reply_markup: buildMmpayInvoiceKeyboard(row.reference),
            })
            .catch(() => {});
        }
      }
    } catch (err: any) {
      console.warn("[MmpayInvoiceScheduler] tick error:", err?.message || err);
    } finally {
      running = false;
    }
  }

  const timer = setInterval(() => void tick(), TICK_MS);
  if (typeof timer.unref === "function") timer.unref();
  // Kick off one sweep shortly after boot so a just-restarted process reconciles
  // invoices that expired while it was down.
  const kickoff = setTimeout(() => void tick(), 5000);
  if (typeof kickoff.unref === "function") kickoff.unref();

  return {
    stop: () => {
      clearInterval(timer);
      clearTimeout(kickoff);
    },
  };
}

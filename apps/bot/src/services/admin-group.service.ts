import type { Api } from "grammy";
import type { InlineKeyboardMarkup, Message } from "grammy/types";
import { eq } from "drizzle-orm";
import { getDb, topUpRequests } from "@arena/db";
import { BOT_EMOJIS, tgEmoji, escapeHtml } from "@arena/shared";
import { botSettingsService } from "./settings.service";

/** Minimal shape of ctx.from used for the customer label in the admin notice. */
export interface SlipNoticeSender {
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface DepositSlipNotice {
  topUpId: string;
  reference: string;
  amountMmk: number;
  fileId: string;
  telegramId: string;
}

/** Actions encoded in the relay message's inline keyboard callback data. */
export type DepositReviewCbAction = "APPROVE" | "REJECT" | "REJECT_CONFIRM" | "CANCEL";

/** Callback data contract shared by the relay keyboard and the handler. */
export const DEPOSIT_REVIEW_CB_REGEX = /^dep:(\d+):(APPROVE|REJECT|REJECT_CONFIRM|CANCEL)$/;

export function depositReviewCallbackData(topUpId: number, action: DepositReviewCbAction): string {
  return `dep:${topUpId}:${action}`;
}

export function buildDepositReviewKeyboard(topUpId: number): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "✅ အတည်ပြု", callback_data: depositReviewCallbackData(topUpId, "APPROVE") },
        { text: "❌ ပယ်ဖျက်", callback_data: depositReviewCallbackData(topUpId, "REJECT") },
      ],
    ],
  };
}

/** Second-step keyboard shown after ❌ — reject notifies the customer, so confirm first. */
export function buildDepositRejectConfirmKeyboard(topUpId: number): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🔴 ပယ်ဖျက်မှာ အတည်ပြု", callback_data: depositReviewCallbackData(topUpId, "REJECT_CONFIRM") },
        { text: "↩️ မပယ်ဖျက်ပါ", callback_data: depositReviewCallbackData(topUpId, "CANCEL") },
      ],
    ],
  };
}

/** Removes the inline keyboard entirely — Telegram keeps the old one otherwise. */
export const EMPTY_KEYBOARD: InlineKeyboardMarkup = { inline_keyboard: [] };

import {
  formatMmt,
  SLIP_TITLE_HTML,
  buildSlipCaptionBody,
  buildReviewOutcomeCaption,
} from "@arena/shared";

export {
  formatMmt,
  SLIP_TITLE_HTML,
  buildSlipCaptionBody,
  buildReviewOutcomeCaption,
};

/**
 * Turns the admin-mentions setting (comma/space/pipe separated Telegram
 * usernames, with or without a leading @) into an HTML mention line like
 * "@ryanwez | @H_M_A_2026". Telegram parses @username entities in bot
 * messages, so group members with those usernames get notified. Invalid
 * tokens are dropped rather than rendered as broken text.
 */
export function formatAdminMentionLine(raw: string): string {
  const names = raw
    .split(/[\s,|]+/)
    .map((token) => token.replace(/^@/, "").trim())
    .filter((token) => /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(token));
  if (names.length === 0) return "";
  return names.map((name) => `@${escapeHtml(name)}`).join(" | ");
}

/**
 * Best-effort relay of a customer deposit slip into the admin Telegram group
 * (optionally into a specific forum topic). Silent by design: missing config
 * or Telegram errors are logged, never thrown — the customer flow must not
 * depend on the admin group being reachable.
 *
 * Slips backed by a real DB row (numeric topUpId) carry ✅/❌ inline buttons;
 * in-memory fallback records get no buttons because there is no deposit id
 * the review endpoint could act on.
 */
export async function notifyAdminGroupDepositSlip(
  api: Api,
  from: SlipNoticeSender | undefined,
  notice: DepositSlipNotice
): Promise<void> {
  let chatId = "";
  let threadId = "";
  try {
    const settings = await botSettingsService.getSettings();
    chatId = settings.telegramGroupChatId;
    if (!chatId) return;
    threadId = settings.telegramDepositTopicId;

    const threadIdNum = parseInt(settings.telegramDepositTopicId, 10);
    const customerName = [from?.first_name, from?.last_name].filter(Boolean).join(" ");
    const customerLabel = from?.username
      ? `@${from.username}`
      : customerName
        ? customerName
        : "Unknown";

    const mentionLine = formatAdminMentionLine(settings.telegramAdminMentions);
    const bell = tgEmoji(BOT_EMOJIS.BELL, "🔔");

    const caption =
      `${SLIP_TITLE_HTML}\n\n` +
      buildSlipCaptionBody({
        reference: notice.reference,
        amountMmk: notice.amountMmk,
        customerLabel,
        telegramId: notice.telegramId,
        postedAt: new Date(),
      }) +
      (mentionLine ? `\n\n${bell} ${mentionLine}` : "");

    const topUpIdNum = parseInt(notice.topUpId, 10);
    const hasButtons = Number.isInteger(topUpIdNum) && topUpIdNum > 0 && /^\d+$/.test(notice.topUpId);

    const payload = {
      caption,
      parse_mode: "HTML" as const,
      ...(Number.isFinite(threadIdNum) && threadIdNum > 0 ? { message_thread_id: threadIdNum } : {}),
      ...(hasButtons ? { reply_markup: buildDepositReviewKeyboard(topUpIdNum) } : {}),
    };

    // Retry transient network drops (ETIMEDOUT etc.) — a silent single-attempt
    // relay once dropped a slip with no trace. grammy already auto-retries
    // 429 flood waits, so this only covers connection-level failures.
    const MAX_ATTEMPTS = 3;
    let sent: Message | undefined;
    for (let attempt = 1; ; attempt++) {
      try {
        sent = await api.sendPhoto(chatId, notice.fileId, payload);
        break;
      } catch (err) {
        if (attempt >= MAX_ATTEMPTS) throw err;
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }

    if (sent?.message_id) {
      try {
        const db = getDb();
        await db
          .update(topUpRequests)
          .set({
            telegramChatId: String(sent.chat.id),
            telegramMessageId: sent.message_id,
          })
          .where(eq(topUpRequests.reference, notice.reference));
      } catch (dbErr: any) {
        console.warn(
          `[AdminGroup] Failed to record telegram message id for ${notice.reference}:`,
          dbErr?.message
        );
      }
    }

    if (!hasButtons && sent) {
      console.warn(
        `[AdminGroup] Deposit ${notice.reference} has no DB-backed id (${notice.topUpId}) — relayed without review buttons.`
      );
    }
  } catch (err: any) {
    // undici hides the real socket/DNS reason under err.cause — log it too.
    const cause = err?.cause?.code || err?.cause?.message;
    console.error(
      `[AdminGroup] Failed to relay deposit slip ${notice.reference} to admin group after retries:`,
      `${err?.message}${cause ? ` (${cause})` : ""}`,
      { chatId, threadId }
    );
  }
}

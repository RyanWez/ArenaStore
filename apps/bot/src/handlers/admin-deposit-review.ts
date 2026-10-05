import { Bot } from "grammy";
import { BotContext } from "../types";
import { botConfig } from "../config";
import { botSettingsService } from "../services/settings.service";
import { reviewDepositViaApi } from "../services/deposit-review.client";
import {
  DEPOSIT_REVIEW_CB_REGEX,
  buildDepositRejectConfirmKeyboard,
  buildDepositReviewKeyboard,
  buildReviewOutcomeCaption,
  EMPTY_KEYBOARD,
  DepositReviewCbAction,
} from "../services/admin-group.service";

/**
 * Checks whether a Telegram user is authorized to approve/reject deposit slips.
 * Security Hardened: Default-Deny.
 * The user must match one of the tokens (numeric Telegram ID or @username)
 * in the configured approver allowlist, or in the admin mentions fallback.
 * If no approver list is configured anywhere, authorization is denied (returns false)
 * to prevent unauthorized group members from approving financial transactions.
 */
export function isUserAuthorizedApprover(
  user: { id: number; username?: string },
  approverIdsRaw?: string,
  adminMentionsFallback?: string
): boolean {
  const rawList = (approverIdsRaw && approverIdsRaw.trim())
    ? approverIdsRaw
    : (adminMentionsFallback && adminMentionsFallback.trim()) || "";

  if (!rawList) return false;

  const allowedTokens = rawList
    .split(/[\s,|]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  if (allowedTokens.length === 0) return false;

  const senderIdStr = String(user.id);
  const senderUsername = (user.username || "").toLowerCase().replace(/^@/, "");

  return allowedTokens.some((t) => {
    const clean = t.replace(/^@/, "");
    return clean === senderIdStr || (Boolean(senderUsername) && clean === senderUsername);
  });
}

/**
 * Admin-group deposit review buttons.
 *
 * Registered BEFORE the private-chat-only guard in bot.ts: the guard swallows
 * every non-private update, so these callbacks must be handled ahead of it.
 * They also deliberately skip session/user-sync/channel-verification — an
 * admin clicking ✅ in the group must not be auto-created as a customer.
 */
export function registerAdminDepositReviewHandlers(bot: Bot<BotContext>) {
  bot.callbackQuery(DEPOSIT_REVIEW_CB_REGEX, async (ctx) => {
    const cb = ctx.callbackQuery;
    const msg = cb.message;
    const answer = (text: string) => ctx.answerCallbackQuery({ text }).catch(() => {});

    if (!msg || !("date" in msg)) {
      await answer("⚠️ Message ကို ပြင်လို့မရတော့ပါ");
      return;
    }

    // Only the configured admin group may drive reviews — Telegram keeps
    // inline keyboards alive on forwarded copies, so a slip message moved
    // elsewhere must never be actionable.
    const settings = await botSettingsService.getSettings();
    const groupChatId = settings.telegramGroupChatId;
    if (!groupChatId || msg.chat.id !== Number(groupChatId)) {
      await answer("⛔ ဒီ chat မှာ လုပ်ဆောင်ခွင့် မရှိပါ");
      return;
    }

    // Approver allowlist: if configured, only members listed in telegramApproverIds
    // or TELEGRAM_ADMIN_MENTIONS may approve/reject. Default-Deny if unconfigured.
    const isAuthorized = isUserAuthorizedApprover(
      cb.from,
      settings.telegramApproverIds,
      botConfig.TELEGRAM_ADMIN_MENTIONS || botConfig.TELEGRAM_APPROVER_IDS
    );
    if (!isAuthorized) {
      await answer("⛔ သင့်မှာ ငွေသွင်းအတည်ပြုခွင့် မရှိပါ");
      return;
    }

    const match = DEPOSIT_REVIEW_CB_REGEX.exec(cb.data ?? "");
    if (!match) {
      await answer("⚠️ မသိတဲ့ တောင်းဆိုမှုပါ");
      return;
    }
    const topUpId = Number(match[1]);
    const action = match[2] as DepositReviewCbAction;

    try {
      if (action === "REJECT") {
        // First ❌ press only arms the keyboard — rejecting notifies the
        // customer, so it takes an explicit second confirmation.
        await ctx.api
          .editMessageReplyMarkup(msg.chat.id, msg.message_id, {
            reply_markup: buildDepositRejectConfirmKeyboard(topUpId),
          })
          .catch(() => {});
        await answer("⚠️ Customer က အသိပေးစာ ရမည် — ပယ်ဖျက်မှာ အတည်ပြုပါ");
        return;
      }

      if (action === "CANCEL") {
        await ctx.api
          .editMessageReplyMarkup(msg.chat.id, msg.message_id, {
            reply_markup: buildDepositReviewKeyboard(topUpId),
          })
          .catch(() => {});
        await answer("↩️ မပယ်ဖျက်တော့ပါ");
        return;
      }

      const reviewer = cb.from;
      const actorLabel = reviewer.username
        ? `@${reviewer.username}`
        : reviewer.first_name || "Admin";

      const result = await reviewDepositViaApi({
        topUpId,
        action: action === "APPROVE" ? "APPROVE" : "REJECT",
        actorTelegramId: String(reviewer.id),
        actorUsername: reviewer.username,
      });

      if (result.ok || result.error === "ALREADY_REVIEWED") {
        // Final state: either this click decided it, or someone else already
        // did. Either way the message is settled — show the outcome and drop
        // the buttons so the next admin cannot (and need not) click again.
        const outcome: "APPROVED" | "REJECTED" | undefined = result.ok
          ? result.action
          : result.status === "COMPLETED"
            ? "APPROVED"
            : result.status === "REJECTED"
              ? "REJECTED"
              : undefined;

        if (outcome) {
          await ctx.api
            .editMessageCaption(msg.chat.id, msg.message_id, {
              caption: buildReviewOutcomeCaption({
                outcome,
                actorLabel: result.ok ? actorLabel : "Admin",
                reference: result.reference,
                amountMmk: result.amountMmk,
                customerLabel: result.customerLabel || "Unknown",
                telegramId: result.telegramId,
                postedAt: new Date(msg.date * 1000),
              }),
              parse_mode: "HTML",
              reply_markup: EMPTY_KEYBOARD,
            })
            .catch((err: any) => {
              // Telegram refuses to edit messages older than ~48h; the toast
              // below still carries the result.
              console.warn(
                `[AdminDepositReview] Could not edit slip message ${msg.message_id}:`,
                err?.message
              );
            });
        }

        await answer(
          result.ok
            ? outcome === "APPROVED"
              ? "✅ အတည်ပြုပြီး"
              : "❌ ပယ်ဖျက်ပြီး"
            : "⚠️ တခြား admin က ရှေးနေ စစ်ပြီးသားပါ"
        );
        return;
      }

      if (result.error === "NOT_FOUND") {
        await answer("⚠️ Deposit record မတွေ့ပါ");
        return;
      }

      await answer("⚠️ Server နဲ့ ချိတ်ဆက်မရပါ — ခဏနေ ထပ်နှိပ်ပါ");
    } catch (err: any) {
      console.error(`[AdminDepositReview] Unhandled error for dep:${topUpId}:${action}:`, err?.message);
      await answer("⚠️ အမှားအယွင်း ဖြစ်ပေါ်ပါသည်");
    }
  });
}

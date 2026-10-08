import { BOT_EMOJIS, tgEmoji, escapeHtml } from "./emoji";

export function formatMmt(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Yangon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export const SLIP_TITLE_HTML = `${tgEmoji(BOT_EMOJIS.MONEY, "💰")} <b>Deposits အသစ်</b>`;

/**
 * The slip details block (reference/amount/customer/time) shared by the
 * initial relay caption and the post-review caption edit, so the message
 * looks identical before and after an admin acts on it.
 */
export function buildSlipCaptionBody(params: {
  reference: string;
  amountMmk: number;
  customerLabel: string;
  telegramId?: string;
  postedAt: Date;
}): string {
  const receipt = tgEmoji(BOT_EMOJIS.RECEIPT, "🧾");
  const money = tgEmoji(BOT_EMOJIS.MONEY, "💰");
  const person = tgEmoji(BOT_EMOJIS.CHAT, "👤");
  const clock = tgEmoji(BOT_EMOJIS.CLOCK, "🕐");

  return (
    `${receipt} <b>Reference:</b> <code>${escapeHtml(params.reference)}</code>\n` +
    `${money} <b>ပမာဏ:</b> <b>${params.amountMmk.toLocaleString("en-US")} MMK</b>\n` +
    `${person} <b>ဝယ်ယူသူ:</b> ${escapeHtml(params.customerLabel)}` +
    (params.telegramId ? ` (<code>${escapeHtml(params.telegramId)}</code>)` : "") +
    `\n${clock} <i>${formatMmt(params.postedAt)} MMT</i>`
  );
}

/**
 * Post-review caption: same details block with the footer replaced by a short
 * outcome line — "✅ @admin က အတည်ပြုပြီး" / "❌ @admin က ပယ်ဖျက်ပြီး" — so the
 * next admin scanning the group sees the slip is already settled.
 */
export function buildReviewOutcomeCaption(params: {
  outcome: "APPROVED" | "REJECTED";
  actorLabel: string;
  reference: string;
  amountMmk: number;
  customerLabel: string;
  telegramId?: string;
  postedAt: Date;
}): string {
  const statusLine =
    params.outcome === "APPROVED"
      ? `✅ ${escapeHtml(params.actorLabel)} က အတည်ပြုပြီး`
      : `❌ ${escapeHtml(params.actorLabel)} က ပယ်ဖျက်ပြီး`;

  return `${SLIP_TITLE_HTML}\n\n${buildSlipCaptionBody(params)}\n\n${statusLine}`;
}

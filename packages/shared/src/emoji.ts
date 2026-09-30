/**
 * Animated Custom Emojis provided for Arena Store Telegram Bot
 */
export const BOT_EMOJIS = {
  // Navigation & Greetings
  WAVE: "5215248074498128418",      // 👋
  SPARKLES: "5325547803936572038",  // ✨
  LIGHTNING: "5226570145161302027", // ⚡️
  DOWN_ARROW: "5193062103103058714",// 👇
  BAGS: "4958714256343171878",       // 🛍
  BOX: "5472335930549347896",        // 📦
  MONEY: "5316661434996765842",      // 💰
  CHAT: "5443038326535759644",       // 💬
  SPEAKER: "5836698068061261980",    // 📢
  PROFILE: "5373012449597335010",    // 👤

  // Store & Stepper Controls
  BUY_NOW: "5267300544094948794",    // 💳
  MINUS: "5255775038010829248",      // ➖
  PLUS: "5314382246176637382",       // ➕
  COUNTER: "5226929552319594190",    // 🔢
  CHECK: "5206607081334906820",      // ✅
  PARTY: "5420289585575904153",      // 🎉(🥳)
  BACK: "5456187398977247949",       // ⬅️

  // Detail Card & Status
  PRICE: "6149928392281033743",      // 💵
  GIFT: "5449800250032143374",       // 🎁
  ABACUS: "5472404950673791399",     // 🧮
  RECEIPT: "6334448145891592172",    // 🧾
  HOURGLASS: "5255765065096774716",  // ⏳
  KEY: "5278573677900752088",        // 🔑
  WARNING: "5447644880824181073",    // ⚠️
  CANCEL: "5210952531676504517",     // ❌

  // Payment Providers
  KBZPAY: "6206487605421280759",     // 🏧 KBZ Pay
  WAVEPAY: "6057728063049830775",    // 🆗 WavePay
  UABPAY: "5391349017898656371",     // 💚 UAB Pay
  AYAPAY: "5282730523343474638",     // 🙂 AYA Pay
} as const;

/**
 * Escapes special HTML characters to prevent message parse errors or XSS in Telegram HTML mode.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Creates a valid Telegram <tg-emoji> tag with safe HTML escaping.
 */
export function tgEmoji(emojiId: string, fallbackEmoji: string = "✨"): string {
  return `<tg-emoji emoji-id="${emojiId}">${escapeHtml(fallbackEmoji)}</tg-emoji>`;
}

/**
 * Parses raw text containing {pe:<id>} placeholders and produces safe Telegram HTML.
 * Consumes any immediate unicode emoji following {pe:<id>} into the <tg-emoji> tag
 * to prevent double emoji display (e.g. animated emoji + duplicate standard emoji).
 */
export function formatTelegramCustomEmoji(rawText: string, fallbackEmoji: string = "✨"): string {
  if (!rawText) return "";

  // Split on the placeholder pattern: {pe:<numeric-id>} followed optionally by immediate unicode emoji
  const regex = /\{pe:(\d+)\}(?:\s*([\p{Extended_Pictographic}\uFE0F\u200D]+))?/gu;
  let lastIndex = 0;
  let result = "";
  let match: RegExpExecArray | null;

  while ((match = regex.exec(rawText)) !== null) {
    const textBefore = rawText.slice(lastIndex, match.index);
    result += escapeHtml(textBefore);

    const emojiId = match[1];
    const immediateEmoji = match[2];
    const displayFallback = immediateEmoji || fallbackEmoji;

    result += `<tg-emoji emoji-id="${emojiId}">${escapeHtml(displayFallback)}</tg-emoji>`;

    lastIndex = regex.lastIndex;
  }

  // Append remaining text escaped
  result += escapeHtml(rawText.slice(lastIndex));
  return result;
}

/**
 * Strips {pe:<id>} placeholders entirely for plain text contexts (e.g. logs, plain text receipts).
 */
export function stripCustomEmojiPlaceholders(rawText: string): string {
  if (!rawText) return "";
  return rawText
    .replace(/\{pe:\d+\}(?:\s*[\p{Extended_Pictographic}\uFE0F\u200D]+\s*)?/gu, "")
    .trim();
}

export interface ParsedEmojiText {
  emojiId: string | null;
  cleanText: string;
}

/**
 * Extracts custom emoji ID and clean label for Telegram inline keyboard buttons (icon_custom_emoji_id).
 * Strips both the {pe:<id>} placeholder and any immediate duplicate fallback emoji,
 * ensuring buttons and headers don't show double emojis (e.g. [G] 🤖 Gemini -> [G] Gemini).
 */
export function parseCustomEmoji(rawText: string): ParsedEmojiText {
  if (!rawText) return { emojiId: null, cleanText: "" };
  const match = /\{pe:(\d+)\}/.exec(rawText);
  const emojiId = match ? match[1] : null;

  // Strip placeholder and immediately following unicode emoji if present
  const cleanText = rawText
    .replace(/\{pe:\d+\}(?:\s*[\p{Extended_Pictographic}\uFE0F\u200D]+\s*)?/gu, "")
    .trim();

  return { emojiId, cleanText };
}

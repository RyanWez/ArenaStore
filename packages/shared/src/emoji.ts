/**
 * Telegram Custom Emoji & HTML formatting utilities.
 *
 * Supplier text includes placeholders like:
 * `{pe:5353054453832368599}🤖 Gemini AI 18 MONTH`
 *
 * For Telegram Bot HTML message mode, this must be rendered as:
 * `<tg-emoji emoji-id="5353054453832368599">✨</tg-emoji>🤖 Gemini AI 18 MONTH`
 */

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
 * Parses raw text containing {pe:<id>} placeholders and produces safe Telegram HTML.
 * All raw text is safely HTML-escaped before the tg-emoji tags are inserted.
 */
export function formatTelegramCustomEmoji(rawText: string, fallbackEmoji: string = "✨"): string {
  if (!rawText) return "";

  // Split on the placeholder pattern: {pe:<numeric-id>}
  const regex = /\{pe:(\d+)\}/g;
  let lastIndex = 0;
  let result = "";
  let match: RegExpExecArray | null;

  while ((match = regex.exec(rawText)) !== null) {
    const textBefore = rawText.slice(lastIndex, match.index);
    result += escapeHtml(textBefore);

    const emojiId = match[1];
    result += `<tg-emoji emoji-id="${emojiId}">${escapeHtml(fallbackEmoji)}</tg-emoji>`;

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
  return rawText.replace(/\{pe:\d+\}/g, "").trim();
}

export interface ParsedEmojiText {
  emojiId: string | null;
  cleanText: string;
}

/**
 * Extracts custom emoji ID and clean label for Telegram inline keyboard buttons (icon_custom_emoji_id).
 */
export function parseCustomEmoji(rawText: string): ParsedEmojiText {
  if (!rawText) return { emojiId: null, cleanText: "" };
  const match = /\{pe:(\d+)\}/.exec(rawText);
  const emojiId = match ? match[1] : null;
  const cleanText = rawText.replace(/\{pe:\d+\}/g, "").trim();
  return { emojiId, cleanText };
}

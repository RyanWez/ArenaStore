import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  formatTelegramCustomEmoji,
  stripCustomEmojiPlaceholders,
} from "@arena/shared";

describe("Telegram Custom Emoji & HTML Formatting", () => {
  it("escapes HTML special characters", () => {
    expect(escapeHtml("<script>alert('xss')</script>")).toBe(
      "&lt;script&gt;alert('xss')&lt;/script&gt;"
    );
    expect(escapeHtml("Tom & Jerry")).toBe("Tom &amp; Jerry");
    expect(escapeHtml('"quoted"')).toBe("&quot;quoted&quot;");
  });

  it("converts {pe:<numeric-id>} placeholders into valid Telegram <tg-emoji> tags", () => {
    const raw = "{pe:5353054453832368599}🤖 Gemini AI 18 MONTH";
    const formatted = formatTelegramCustomEmoji(raw);

    expect(formatted).toBe(
      '<tg-emoji emoji-id="5353054453832368599">✨</tg-emoji>🤖 Gemini AI 18 MONTH'
    );
  });

  it("handles multiple placeholders while escaping in-between text", () => {
    const raw = "{pe:123} Item 1 <cool> & {pe:456} Item 2";
    const formatted = formatTelegramCustomEmoji(raw);

    expect(formatted).toBe(
      '<tg-emoji emoji-id="123">✨</tg-emoji> Item 1 &lt;cool&gt; &amp; <tg-emoji emoji-id="456">✨</tg-emoji> Item 2'
    );
  });

  it("strips placeholders cleanly for plain text logs and receipts", () => {
    const raw = "{pe:5353054453832368599} Gemini AI 18 MONTH";
    expect(stripCustomEmojiPlaceholders(raw)).toBe("Gemini AI 18 MONTH");
  });

  it("handles empty or falsy strings gracefully", () => {
    expect(formatTelegramCustomEmoji("")).toBe("");
    expect(stripCustomEmojiPlaceholders("")).toBe("");
  });
});

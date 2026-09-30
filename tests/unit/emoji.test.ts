import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  formatTelegramCustomEmoji,
  stripCustomEmojiPlaceholders,
  parseCustomEmoji,
  BOT_EMOJIS,
  tgEmoji,
} from "@arena/shared";

describe("Telegram Custom Emoji & HTML Formatting", () => {
  it("escapes HTML special characters", () => {
    expect(escapeHtml("<script>alert('xss')</script>")).toBe(
      "&lt;script&gt;alert('xss')&lt;/script&gt;"
    );
    expect(escapeHtml("Tom & Jerry")).toBe("Tom &amp; Jerry");
    expect(escapeHtml('"quoted"')).toBe("&quot;quoted&quot;");
  });

  it("converts {pe:<numeric-id>} placeholders into valid Telegram <tg-emoji> tags without duplicate emojis", () => {
    const raw = "{pe:5353054453832368599}🤖 Gemini AI 18 MONTH";
    const formatted = formatTelegramCustomEmoji(raw);

    expect(formatted).toBe(
      '<tg-emoji emoji-id="5353054453832368599">🤖</tg-emoji> Gemini AI 18 MONTH'
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
    const raw = "{pe:5353054453832368599}🤖 Gemini AI 18 MONTH";
    expect(stripCustomEmojiPlaceholders(raw)).toBe("Gemini AI 18 MONTH");
  });

  it("handles empty or falsy strings gracefully", () => {
    expect(formatTelegramCustomEmoji("")).toBe("");
    expect(stripCustomEmojiPlaceholders("")).toBe("");
  });

  it("extracts emojiId and cleanText for inline keyboard buttons without duplicate emoji", () => {
    const raw = "{pe:5069075201950483359}🤖 Gemini AI 18 MONTH";
    const parsed = parseCustomEmoji(raw);
    expect(parsed.emojiId).toBe("5069075201950483359");
    expect(parsed.cleanText).toBe("Gemini AI 18 MONTH");

    const plain = "Steam Wallet $5";
    const plainParsed = parseCustomEmoji(plain);
    expect(plainParsed.emojiId).toBeNull();
    expect(plainParsed.cleanText).toBe("Steam Wallet $5");
  });

  it("provides valid custom animated emoji IDs in BOT_EMOJIS", () => {
    expect(BOT_EMOJIS.WAVE).toBe("5215248074498128418");
    expect(BOT_EMOJIS.SPARKLES).toBe("5325547803936572038");
    expect(BOT_EMOJIS.LIGHTNING).toBe("5226570145161302027");
    expect(BOT_EMOJIS.DOWN_ARROW).toBe("5193062103103058714");
    expect(BOT_EMOJIS.BAGS).toBe("4958714256343171878");
    expect(BOT_EMOJIS.BOX).toBe("5472335930549347896");
    expect(BOT_EMOJIS.MONEY).toBe("5316661434996765842");
    expect(BOT_EMOJIS.CHAT).toBe("5443038326535759644");
    expect(BOT_EMOJIS.SPEAKER).toBe("5836698068061261980");
    expect(BOT_EMOJIS.PROFILE).toBe("5373012449597335010");

    // Stepper & Controls
    expect(BOT_EMOJIS.BUY_NOW).toBe("5267300544094948794");
    expect(BOT_EMOJIS.MINUS).toBe("5255775038010829248");
    expect(BOT_EMOJIS.PLUS).toBe("5314382246176637382");
    expect(BOT_EMOJIS.COUNTER).toBe("5226929552319594190");
    expect(BOT_EMOJIS.CHECK).toBe("5206607081334906820");
    expect(BOT_EMOJIS.PARTY).toBe("5420289585575904153");
    expect(BOT_EMOJIS.BACK).toBe("5456187398977247949");

    // Payment Emojis
    expect(BOT_EMOJIS.KBZPAY).toBe("6206487605421280759");
    expect(BOT_EMOJIS.WAVEPAY).toBe("6057728063049830775");
    expect(BOT_EMOJIS.UABPAY).toBe("5391349017898656371");
    expect(BOT_EMOJIS.AYAPAY).toBe("5282730523343474638");

    const tag = tgEmoji(BOT_EMOJIS.WAVE, "👋");
    expect(tag).toBe('<tg-emoji emoji-id="5215248074498128418">👋</tg-emoji>');
  });
});

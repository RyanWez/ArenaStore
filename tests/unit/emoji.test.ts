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
    expect(BOT_EMOJIS.WAVE).toBe("5458904472598095631");
    expect(BOT_EMOJIS.SPARKLES).toBe("5765017520612315383");
    expect(BOT_EMOJIS.LIGHTNING).toBe("5172425562634847208");
    expect(BOT_EMOJIS.MMQR).toBe("5422814644093868925");
    expect(BOT_EMOJIS.DOWN_ARROW).toBe("5231102735817918643");
    expect(BOT_EMOJIS.BAGS).toBe("5346268255180834499");
    expect(BOT_EMOJIS.BOX).toBe("5348127061191967344");
    expect(BOT_EMOJIS.MONEY).toBe("5769403330761593044");
    expect(BOT_EMOJIS.CHAT).toBe("5348323259593014362");
    expect(BOT_EMOJIS.SPEAKER).toBe("5771868281212245617");
    expect(BOT_EMOJIS.PROFILE).toBe("5316727448644103237");

    // Stepper & Controls
    expect(BOT_EMOJIS.BUY_NOW).toBe("5346227465876423936");
    expect(BOT_EMOJIS.MINUS).toBe("5346176879751612829");
    expect(BOT_EMOJIS.PLUS).toBe("5346004239246183111");
    expect(BOT_EMOJIS.COUNTER).toBe("5226513232549664618");
    expect(BOT_EMOJIS.CHECK).toBe("5260416304224936047");
    expect(BOT_EMOJIS.PARTY).toBe("5994502837327892086");
    expect(BOT_EMOJIS.BACK).toBe("5258236805890710909");
    expect(BOT_EMOJIS.HOME).toBe("5348064629547351986");
    expect(BOT_EMOJIS.EDIT).toBe("5985774024968379294");
    expect(BOT_EMOJIS.FIRE).toBe("5303040337059543238");
    expect(BOT_EMOJIS.PROHIBITED).toBe("5872829476143894491");
    expect(BOT_EMOJIS.DISABLED).toBe("5872829476143894491");
    expect(BOT_EMOJIS.PRICE).toBe("5967390100357648692");
    expect(BOT_EMOJIS.WALLET).toBe("5258204546391351475");

    // Status, Notices & Info
    expect(BOT_EMOJIS.HOURGLASS).toBe("5345809410939700735");
    expect(BOT_EMOJIS.LIGHTBULB).toBe("5258216851472654189");
    expect(BOT_EMOJIS.CLOCK).toBe("5348236797606379943");

    // Payment Emojis
    expect(BOT_EMOJIS.KBZPAY).toBe("6206487605421280759");
    expect(BOT_EMOJIS.WAVEPAY).toBe("6057728063049830775");
    expect(BOT_EMOJIS.UABPAY).toBe("5391349017898656371");
    expect(BOT_EMOJIS.AYAPAY).toBe("5282730523343474638");

    const tag = tgEmoji(BOT_EMOJIS.WAVE, "👋");
    expect(tag).toBe(`<tg-emoji emoji-id="${BOT_EMOJIS.WAVE}">👋</tg-emoji>`);
  });
});

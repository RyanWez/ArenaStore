import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sendTelegramMessage,
  notifyOrderRefunded,
  notifyOrderCredentialsResent,
} from "../../apps/api/src/services/telegram-notifier";
import { config } from "../../apps/api/src/config";

/**
 * Telegram notifier service — customer notification messages.
 *
 * Covers the refund and credential re-send notifications added to
 * apps/api/src/services/telegram-notifier.ts. The Telegram Bot API is never
 * called for real: global fetch is mocked and the config module is replaced
 * with a test token, so no real chat is contacted.
 */

vi.mock("../../apps/api/src/config", () => ({
  config: { TELEGRAM_BOT_TOKEN: "12345:TEST-TOKEN" },
}));

const TEST_TOKEN = "12345:TEST-TOKEN";

function lastSentMessage(): { chatId: string; text: string } {
  const call = (global.fetch as any).mock.calls.at(-1);
  const body = JSON.parse(call[1].body);
  return { chatId: body.chat_id, text: body.text };
}

describe("Telegram Notifier Service", () => {
  const originalFetch = global.fetch;
  const originalToken = config.TELEGRAM_BOT_TOKEN;

  beforeEach(() => {
    config.TELEGRAM_BOT_TOKEN = TEST_TOKEN;
  });

  afterEach(() => {
    config.TELEGRAM_BOT_TOKEN = originalToken;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function mockTelegramOk() {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
  }

  describe("sendTelegramMessage", () => {
    it("posts an HTML parse_mode message to the Bot API and returns true", async () => {
      mockTelegramOk();

      const sent = await sendTelegramMessage("111222333", "<b>Hello</b>");

      expect(sent).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.telegram.org/bot${TEST_TOKEN}/sendMessage`,
        expect.objectContaining({ method: "POST" })
      );
      const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(body).toEqual({
        chat_id: "111222333",
        text: "<b>Hello</b>",
        parse_mode: "HTML",
      });
    });

    it("returns false and skips the API call when no bot token is configured", async () => {
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy;
      config.TELEGRAM_BOT_TOKEN = "";

      const sent = await sendTelegramMessage("111222333", "<b>Hello</b>");

      expect(sent).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("returns false when the Bot API responds with an error", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ ok: false, description: "Bad Request: chat not found" }),
      } as unknown as Response);

      const sent = await sendTelegramMessage("111222333", "text");
      expect(sent).toBe(false);
    });

    it("returns false when the network request throws", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network offline"));

      const sent = await sendTelegramMessage("111222333", "text");
      expect(sent).toBe(false);
    });
  });

  describe("notifyOrderRefunded", () => {
    it("sends a refund notification with order number, amounts and default reason", async () => {
      mockTelegramOk();

      const sent = await notifyOrderRefunded({
        telegramId: "111222333",
        publicOrderNo: "ARN-2026-90001",
        amountMmk: 7800,
        newBalanceMmk: 9800,
      });

      expect(sent).toBe(true);
      const { chatId, text } = lastSentMessage();
      expect(chatId).toBe("111222333");
      expect(text).toContain("<blockquote>");
      expect(text).toContain("အော်ဒါ ငွေပြန်အမ်းခြင်း ပြီးမြောက်ပါသည်");
      expect(text).toContain("<b>ARN-2026-90001</b>");
      expect(text).toContain("+7,800 Ks");
      expect(text).toContain("9,800 Ks");
      expect(text).toContain("<i>Admin Customer Support</i>");
    });

    it("uses the provided refund reason when given", async () => {
      mockTelegramOk();

      await notifyOrderRefunded({
        telegramId: "111222333",
        publicOrderNo: "ARN-2026-90001",
        amountMmk: 7800,
        newBalanceMmk: 9800,
        reason: "Duplicate payment",
      });

      expect(lastSentMessage().text).toContain("<i>Duplicate payment</i>");
    });

    it("escapes HTML-special characters in the order number and reason", async () => {
      mockTelegramOk();

      await notifyOrderRefunded({
        telegramId: "111222333",
        publicOrderNo: 'ARN-2026-<b>1&"x</b>',
        amountMmk: 1000,
        newBalanceMmk: 1000,
        reason: 'Reason "A" & <B>',
      });

      const { text } = lastSentMessage();
      expect(text).toContain("ARN-2026-&lt;b&gt;1&amp;&quot;x&lt;/b&gt;");
      expect(text).toContain("Reason &quot;A&quot; &amp; &lt;B&gt;");
      expect(text).not.toContain("<b>1&");
    });
  });

  describe("notifyOrderCredentialsResent", () => {
    it("sends credentials inside an escaped <pre><code> block with the product name", async () => {
      mockTelegramOk();

      const sent = await notifyOrderCredentialsResent({
        telegramId: "111222333",
        publicOrderNo: "ARN-2026-90001",
        productName: "Gemini AI 18 MONTH",
        credentialsText: 'user: buyer@example.test\npass: <Secret> & "key"',
      });

      expect(sent).toBe(true);
      const { chatId, text } = lastSentMessage();
      expect(chatId).toBe("111222333");
      expect(text).toContain("အော်ဒါ အချက်အလက်များ ပြန်လည်ပေးပို့ခြင်း");
      expect(text).toContain("<b>ARN-2026-90001</b>");
      expect(text).toContain("<b>Gemini AI 18 MONTH</b>");
      expect(text).toContain(
        "<pre><code>user: buyer@example.test\npass: &lt;Secret&gt; &amp; &quot;key&quot;</code></pre>"
      );
      expect(text).toContain("လုံခြုံရေး သတိပေးချက်");
    });

    it("escapes HTML-special characters in the product name", async () => {
      mockTelegramOk();

      await notifyOrderCredentialsResent({
        telegramId: "111222333",
        publicOrderNo: "ARN-2026-90001",
        productName: '<script>alert("x")</script>',
        credentialsText: "plain-credentials",
      });

      const { text } = lastSentMessage();
      expect(text).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
      expect(text).not.toContain("<script>");
    });
  });
});

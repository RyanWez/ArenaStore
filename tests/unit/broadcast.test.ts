import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sendTelegramBroadcastItem,
  type TelegramBroadcastItemOptions,
} from "../../apps/api/src/services/telegram-notifier";
import { CreateBroadcastSchema } from "../../packages/shared/src/schemas";
import { config } from "../../apps/api/src/config";

vi.mock("../../apps/api/src/config", () => ({
  config: { TELEGRAM_BOT_TOKEN: "12345:TEST-BROADCAST-TOKEN" },
}));

const TEST_TOKEN = "12345:TEST-BROADCAST-TOKEN";

describe("Admin Broadcast System", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    config.TELEGRAM_BOT_TOKEN = TEST_TOKEN;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("CreateBroadcastSchema validation", () => {
    it("validates valid broadcast payloads", () => {
      const valid = CreateBroadcastSchema.safeParse({
        title: "Test Announcement",
        message: "Hello <b>everyone</b>!",
        imageUrl: "https://example.com/banner.jpg",
        buttonText: "Shop Now",
        buttonUrl: "https://t.me/ArenaStoreBot",
        targetAudience: "ALL",
      });
      expect(valid.success).toBe(true);
    });

    it("accepts text-only broadcast with optional empty fields", () => {
      const valid = CreateBroadcastSchema.safeParse({
        message: "Simple announcement",
        imageUrl: "",
        buttonText: "",
        buttonUrl: "",
        targetAudience: "CUSTOMERS",
      });
      expect(valid.success).toBe(true);
    });

    it("fails when message is missing or empty", () => {
      const invalid = CreateBroadcastSchema.safeParse({
        message: "",
        targetAudience: "ALL",
      });
      expect(invalid.success).toBe(false);
    });

    it("fails when message exceeds 4096 characters", () => {
      const longMessage = "a".repeat(4097);
      const invalid = CreateBroadcastSchema.safeParse({
        message: longMessage,
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe("sendTelegramBroadcastItem", () => {
    it("sends text message via sendMessage when no image is provided", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      } as Response);

      const res = await sendTelegramBroadcastItem({
        chatId: "987654321",
        text: "<b>Test Announcement</b>",
      });

      expect(res.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.telegram.org/bot${TEST_TOKEN}/sendMessage`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            chat_id: "987654321",
            parse_mode: "HTML",
            text: "<b>Test Announcement</b>",
          }),
        })
      );
    });

    it("sends photo via sendPhoto with caption and inline button", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      } as Response);

      const res = await sendTelegramBroadcastItem({
        chatId: "987654321",
        text: "Check out new promo!",
        imageUrl: "https://example.com/promo.png",
        buttonText: "Open Store",
        buttonUrl: "https://t.me/ArenaStoreBot",
      });

      expect(res.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.telegram.org/bot${TEST_TOKEN}/sendPhoto`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            chat_id: "987654321",
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [[{ text: "Open Store", url: "https://t.me/ArenaStoreBot" }]],
            },
            photo: "https://example.com/promo.png",
            caption: "Check out new promo!",
          }),
        })
      );
    });

    it("detects when bot is blocked by user (403) and returns blocked flag", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          ok: false,
          error_code: 403,
          description: "Forbidden: bot was blocked by the user",
        }),
      } as Response);

      const res = await sendTelegramBroadcastItem({
        chatId: "11223344",
        text: "Blocked user test",
      });

      expect(res.success).toBe(false);
      expect(res.blocked).toBe(true);
    });
  });
});

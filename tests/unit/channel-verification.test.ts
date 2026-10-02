import { describe, it, expect, vi } from "vitest";
import { normalizeChannelUsername } from "../../apps/bot/src/config";
import {
  ChannelVerificationService,
  channelVerificationService,
} from "../../apps/bot/src/services/channel-verification.service";
import { formatForceJoinMessage } from "../../apps/bot/src/formatters/messages";
import { buildForceJoinKeyboard } from "../../apps/bot/src/keyboards/store.keyboards";

describe("Telegram Channel Verification (Force Subscription)", () => {
  describe("normalizeChannelUsername helper", () => {
    it("handles @channel format", () => {
      const result = normalizeChannelUsername("@arenasellerstore");
      expect(result.username).toBe("@arenasellerstore");
      expect(result.url).toBe("https://t.me/arenasellerstore");
    });

    it("handles bare channel username format", () => {
      const result = normalizeChannelUsername("arenasellerstore");
      expect(result.username).toBe("@arenasellerstore");
      expect(result.url).toBe("https://t.me/arenasellerstore");
    });

    it("handles full t.me and https://t.me links", () => {
      const res1 = normalizeChannelUsername("https://t.me/arenasellerstore");
      expect(res1.username).toBe("@arenasellerstore");
      expect(res1.url).toBe("https://t.me/arenasellerstore");

      const res2 = normalizeChannelUsername("t.me/arenasellerstore/");
      expect(res2.username).toBe("@arenasellerstore");
      expect(res2.url).toBe("https://t.me/arenasellerstore");
    });
  });

  describe("ChannelVerificationService", () => {
    it("returns isMember: true for active member status (creator, administrator, member)", async () => {
      const mockApi = {
        getChatMember: vi.fn().mockResolvedValue({ status: "member" }),
      } as any;

      const service = new ChannelVerificationService();
      const res = await service.checkMembership(mockApi, 123456789, "@arenasellerstore");

      expect(res.isMember).toBe(true);
      expect(res.channelUsername).toBe("@arenasellerstore");
      expect(mockApi.getChatMember).toHaveBeenCalledWith("@arenasellerstore", 123456789);
    });

    it("returns isMember: true for administrator status", async () => {
      const mockApi = {
        getChatMember: vi.fn().mockResolvedValue({ status: "administrator" }),
      } as any;

      const service = new ChannelVerificationService();
      const res = await service.checkMembership(mockApi, 123456789, "@arenasellerstore");

      expect(res.isMember).toBe(true);
      expect(res.status).toBe("administrator");
    });

    it("returns isMember: false for left or kicked status", async () => {
      const mockApi = {
        getChatMember: vi.fn().mockResolvedValue({ status: "left" }),
      } as any;

      const service = new ChannelVerificationService();
      const res = await service.checkMembership(mockApi, 123456789, "@arenasellerstore");

      expect(res.isMember).toBe(false);
      expect(res.status).toBe("left");
    });

    it("returns BOT_NOT_ADMIN_OR_CHAT_NOT_FOUND when Telegram throws bot is not an admin", async () => {
      const mockApi = {
        getChatMember: vi.fn().mockRejectedValue(new Error("Bad Request: chat not found")),
      } as any;

      const service = new ChannelVerificationService();
      const res = await service.checkMembership(mockApi, 123456789, "@arenasellerstore");

      expect(res.isMember).toBe(false);
      expect(res.error).toBe("BOT_NOT_ADMIN_OR_CHAT_NOT_FOUND");
    });
  });

  describe("Force Join UI & Keyboards", () => {
    it("formats Force Join Message with channel username and guidance", () => {
      const msg = formatForceJoinMessage("@arenasellerstore");
      expect(msg).toContain("@arenasellerstore");
      expect(msg).toContain("Announcement Channel");
      expect(msg).toContain("Join Channel");
    });

    it("builds Force Join Keyboard with Join Channel URL and Verify callback button", () => {
      const keyboard = buildForceJoinKeyboard("https://t.me/arenasellerstore");
      const buttons = keyboard.inline_keyboard.flat();

      const joinBtn = buttons.find((b) => b.text.includes("Join Channel"));
      expect(joinBtn).toBeDefined();
      expect((joinBtn as any)?.url).toBe("https://t.me/arenasellerstore");

      const verifyBtn = buttons.find((b) => b.text.includes("Joined ပြီးပါပြီ"));
      expect(verifyBtn).toBeDefined();
      expect((verifyBtn as any)?.callback_data).toBe("verify_channel_join");
    });
  });
});

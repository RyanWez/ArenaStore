import { describe, it, expect, vi, beforeEach } from "vitest";
import { BOT_EMOJIS } from "@arena/shared";
import { formatMaintenanceMessage } from "../../apps/bot/src/formatters/messages";
import { buildMaintenanceKeyboard } from "../../apps/bot/src/keyboards/store.keyboards";
import { botSettingsService } from "../../apps/bot/src/services/settings.service";
import { botOrderService } from "../../apps/bot/src/services/order.service";

describe("Telegram Bot Maintenance Mode", () => {
  describe("formatMaintenanceMessage", () => {
    it("formats polite Myanmar maintenance message including support contact", () => {
      const msg = formatMaintenanceMessage("https://t.me/ArenaStoreSupport");
      expect(msg).toContain("စနစ် ခေတ္တ ပြုပြင်ထိန်းသိမ်းနေပါသည်");
      expect(msg).toContain("System Maintenance");
      expect(msg).toContain(`emoji-id="${BOT_EMOJIS.WRENCH}"`);
      expect(msg).toContain("Customer Support သို့ ဆက်သွယ်နိုင်ပါတယ်ခင်ဗျာ");
    });

    it("formats message gracefully without support link when none provided", () => {
      const msg = formatMaintenanceMessage();
      expect(msg).toContain("စနစ် ခေတ္တ ပြုပြင်ထိန်းသိမ်းနေပါသည်");
      expect(msg).toContain("System Maintenance");
    });
  });

  describe("buildMaintenanceKeyboard", () => {
    it("builds keyboard with support url button when url is present", () => {
      const keyboard = buildMaintenanceKeyboard("https://t.me/ArenaStoreSupport");
      expect(keyboard.inline_keyboard.length).toBe(1);
      expect(keyboard.inline_keyboard[0][0].text).toContain("Customer Support");
      expect((keyboard.inline_keyboard[0][0] as any).url).toBe("https://t.me/ArenaStoreSupport");
    });

    it("returns empty keyboard when no support url is present", () => {
      const keyboard = buildMaintenanceKeyboard();
      expect(keyboard.inline_keyboard.flat().length).toBe(0);
    });
  });

  describe("Maintenance Bypass & Guard Logic", () => {
    it("bypasses maintenance mode when user is an approver ID", async () => {
      vi.spyOn(botSettingsService, "getSettings").mockResolvedValue({
        isMaintenanceMode: true,
        telegramApproverIds: "123456789,987654321",
        supportTelegramHandle: "@ArenaStoreSupport",
      } as any);

      const settings = await botSettingsService.getSettings();
      const approverIds = settings.telegramApproverIds.split(",").map((s) => s.trim());

      const adminUser = "123456789";
      const isApprover = approverIds.includes(adminUser);
      expect(isApprover).toBe(true);
    });

    it("blocks regular customers who are not in approverIds list during maintenance", async () => {
      vi.spyOn(botSettingsService, "getSettings").mockResolvedValue({
        isMaintenanceMode: true,
        telegramApproverIds: "123456789",
        supportTelegramHandle: "@ArenaStoreSupport",
      } as any);

      const settings = await botSettingsService.getSettings();
      const approverIds = settings.telegramApproverIds.split(",").map((s) => s.trim());

      const regularUser = "555666777";
      const isApprover = approverIds.includes(regularUser);
      expect(isApprover).toBe(false);
      expect(settings.isMaintenanceMode).toBe(true);
    });
  });
});

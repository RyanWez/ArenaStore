import { getDb, appSettings } from "@arena/db";
import { botConfig } from "../config";

export interface BotAppSettings {
  usdToMmkRate: number;
  defaultMarginPct: number;
  supportTelegramHandle: string;
  kpayAccountName: string;
  kpayPhone: string;
  wavepayAccountName: string;
  wavepayPhone: string;
  ayapayAccountName: string;
  ayapayPhone: string;
  uabpayAccountName: string;
  uabpayPhone: string;
  orderTimeoutMinutes: number;
  isMaintenanceMode: boolean;
  telegramGroupChatId: string;
  telegramDepositTopicId: string;
  telegramBotAlertTopicId: string;
  telegramAdminMentions: string;
  telegramApproverIds: string;
}

class BotSettingsService {
  private cache: BotAppSettings | null = null;
  private lastFetchedAt = 0;
  private readonly CACHE_TTL_MS = 15_000; // 15 seconds

  async getSettings(): Promise<BotAppSettings> {
    const now = Date.now();
    if (this.cache && now - this.lastFetchedAt < this.CACHE_TTL_MS) {
      return this.cache;
    }

    try {
      const db = getDb();
      const rows = await db.select().from(appSettings);
      const map: Record<string, string> = {};
      for (const row of rows) {
        map[row.key] = row.value;
      }

      this.cache = {
        usdToMmkRate: Number(map.usdToMmkRate) || botConfig.DEFAULT_EXCHANGE_RATE_MMK,
        defaultMarginPct: Number(map.defaultMarginPct) || botConfig.DEFAULT_MARGIN_PERCENTAGE,
        supportTelegramHandle: map.supportTelegramHandle || `@${botConfig.SUPPORT_USERNAME}`,
        kpayAccountName: map.kpayAccountName || botConfig.PAYMENT_ACCOUNT_NAME,
        kpayPhone: map.kpayPhone || botConfig.PAYMENT_KPAY_PHONE,
        wavepayAccountName: map.wavepayAccountName || botConfig.PAYMENT_ACCOUNT_NAME,
        wavepayPhone: map.wavepayPhone || botConfig.PAYMENT_WAVEPAY_PHONE,
        ayapayAccountName: map.ayapayAccountName || "Arena Store",
        ayapayPhone: map.ayapayPhone || "09 987 654 321",
        uabpayAccountName: map.uabpayAccountName || "Arena Store",
        uabpayPhone: map.uabpayPhone || "09 789 123 456",
        orderTimeoutMinutes: Number(map.orderTimeoutMinutes) || 15,
        isMaintenanceMode: map.isMaintenanceMode === "true",
        telegramGroupChatId: (map.telegramGroupChatId || botConfig.TELEGRAM_GROUP_CHAT_ID).trim(),
        telegramDepositTopicId: (map.telegramDepositTopicId || botConfig.TELEGRAM_DEPOSIT_TOPIC_ID).trim(),
        telegramBotAlertTopicId: (map.telegramBotAlertTopicId || botConfig.TELEGRAM_BOT_ALERT_TOPIC_ID).trim(),
        telegramAdminMentions: (map.telegramAdminMentions || botConfig.TELEGRAM_ADMIN_MENTIONS).trim(),
        telegramApproverIds: (map.telegramApproverIds || botConfig.TELEGRAM_APPROVER_IDS || "").trim(),
      };
      this.lastFetchedAt = now;
      return this.cache;
    } catch (err: any) {
      console.warn("[BotSettings] Failed to fetch settings from DB, using fallback:", err.message);
      return {
        usdToMmkRate: botConfig.DEFAULT_EXCHANGE_RATE_MMK,
        defaultMarginPct: botConfig.DEFAULT_MARGIN_PERCENTAGE,
        supportTelegramHandle: `@${botConfig.SUPPORT_USERNAME}`,
        kpayAccountName: botConfig.PAYMENT_ACCOUNT_NAME,
        kpayPhone: botConfig.PAYMENT_KPAY_PHONE,
        wavepayAccountName: botConfig.PAYMENT_ACCOUNT_NAME,
        wavepayPhone: botConfig.PAYMENT_WAVEPAY_PHONE,
        ayapayAccountName: "Arena Store",
        ayapayPhone: "09 987 654 321",
        uabpayAccountName: "Arena Store",
        uabpayPhone: "09 789 123 456",
        orderTimeoutMinutes: 15,
        isMaintenanceMode: false,
        telegramGroupChatId: botConfig.TELEGRAM_GROUP_CHAT_ID.trim(),
        telegramDepositTopicId: botConfig.TELEGRAM_DEPOSIT_TOPIC_ID.trim(),
        telegramBotAlertTopicId: botConfig.TELEGRAM_BOT_ALERT_TOPIC_ID.trim(),
        telegramAdminMentions: botConfig.TELEGRAM_ADMIN_MENTIONS.trim(),
        telegramApproverIds: (botConfig.TELEGRAM_APPROVER_IDS || "").trim(),
      };
    }
  }

  invalidateCache(): void {
    this.cache = null;
    this.lastFetchedAt = 0;
  }
}

export const botSettingsService = new BotSettingsService();

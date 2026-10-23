import { getDb, appSettings } from "@arena/db";
import { getCoreConfig } from "../config";

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

export class BotSettingsService {
  private cache: BotAppSettings | null = null;
  private lastFetchedAt = 0;
  private readonly CACHE_TTL_MS = 15_000; // 15 seconds

  async getSettings(): Promise<BotAppSettings> {
    const config = getCoreConfig();
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
        usdToMmkRate: Number(map.usdToMmkRate) || config.DEFAULT_EXCHANGE_RATE_MMK || 4500,
        defaultMarginPct: Number(map.defaultMarginPct) || config.DEFAULT_MARGIN_PERCENTAGE || 15,
        supportTelegramHandle: map.supportTelegramHandle || `@${config.SUPPORT_USERNAME || "ryanwez"}`,
        kpayAccountName: map.kpayAccountName || config.PAYMENT_ACCOUNT_NAME || "Arena Store",
        kpayPhone: map.kpayPhone || config.PAYMENT_KPAY_PHONE || "09 123 456 789",
        wavepayAccountName: map.wavepayAccountName || config.PAYMENT_ACCOUNT_NAME || "Arena Store",
        wavepayPhone: map.wavepayPhone || config.PAYMENT_WAVEPAY_PHONE || "09 123 456 789",
        ayapayAccountName: map.ayapayAccountName || "Arena Store",
        ayapayPhone: map.ayapayPhone || "09 987 654 321",
        uabpayAccountName: map.uabpayAccountName || "Arena Store",
        uabpayPhone: map.uabpayPhone || "09 789 123 456",
        orderTimeoutMinutes: Number(map.orderTimeoutMinutes) || 15,
        isMaintenanceMode: map.isMaintenanceMode === "true",
        telegramGroupChatId: (map.telegramGroupChatId || config.TELEGRAM_GROUP_CHAT_ID || "").trim(),
        telegramDepositTopicId: (map.telegramDepositTopicId || config.TELEGRAM_DEPOSIT_TOPIC_ID || "").trim(),
        telegramBotAlertTopicId: (map.telegramBotAlertTopicId || config.TELEGRAM_BOT_ALERT_TOPIC_ID || "").trim(),
        telegramAdminMentions: (map.telegramAdminMentions || config.TELEGRAM_ADMIN_MENTIONS || "").trim(),
        telegramApproverIds: (map.telegramApproverIds || config.TELEGRAM_APPROVER_IDS || "").trim(),
      };
      this.lastFetchedAt = now;
      return this.cache;
    } catch (err: any) {
      console.warn("[BotSettings] Failed to fetch settings from DB, using fallback:", err.message);
      return {
        usdToMmkRate: config.DEFAULT_EXCHANGE_RATE_MMK || 4500,
        defaultMarginPct: config.DEFAULT_MARGIN_PERCENTAGE || 15,
        supportTelegramHandle: `@${config.SUPPORT_USERNAME || "ryanwez"}`,
        kpayAccountName: config.PAYMENT_ACCOUNT_NAME || "Arena Store",
        kpayPhone: config.PAYMENT_KPAY_PHONE || "09 123 456 789",
        wavepayAccountName: config.PAYMENT_ACCOUNT_NAME || "Arena Store",
        wavepayPhone: config.PAYMENT_WAVEPAY_PHONE || "09 123 456 789",
        ayapayAccountName: "Arena Store",
        ayapayPhone: "09 987 654 321",
        uabpayAccountName: "Arena Store",
        uabpayPhone: "09 789 123 456",
        orderTimeoutMinutes: 15,
        isMaintenanceMode: false,
        telegramGroupChatId: (config.TELEGRAM_GROUP_CHAT_ID || "").trim(),
        telegramDepositTopicId: (config.TELEGRAM_DEPOSIT_TOPIC_ID || "").trim(),
        telegramBotAlertTopicId: (config.TELEGRAM_BOT_ALERT_TOPIC_ID || "").trim(),
        telegramAdminMentions: (config.TELEGRAM_ADMIN_MENTIONS || "").trim(),
        telegramApproverIds: (config.TELEGRAM_APPROVER_IDS || "").trim(),
      };
    }
  }

  invalidateCache(): void {
    this.cache = null;
    this.lastFetchedAt = 0;
  }

  getSupportUrlSync(): string {
    const config = getCoreConfig();
    const handle = this.cache?.supportTelegramHandle || config.SUPPORT_USERNAME || "ryanwez";
    return resolveTelegramSupportUrl(handle);
  }

  async getSupportUrl(): Promise<string> {
    const settings = await this.getSettings();
    return resolveTelegramSupportUrl(settings.supportTelegramHandle);
  }
}

/**
 * Normalizes any handle or URL into a Telegram deep link.
 * Handles '@handle', 'handle', 'https://t.me/handle', 't.me/handle'.
 * Appends a ?start= deep-link param (when no query is present) so that
 * tapping Start in Telegram automatically sends `/start help` to the bot.
 */
export function resolveTelegramSupportUrl(handleOrUrl?: string, fallback = "ryanwez"): string {
  return withStartParam(normalizeSupportUrl(handleOrUrl, fallback));
}

function normalizeSupportUrl(handleOrUrl?: string, fallback = "ryanwez"): string {
  const trimmed = (handleOrUrl || "").trim();
  if (!trimmed) {
    const cleanFallback = (fallback || "ryanwez").trim().replace(/^@+/, "");
    return `https://t.me/${cleanFallback}`;
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  if (trimmed.startsWith("t.me/")) {
    return `https://${trimmed}`;
  }
  const clean = trimmed.replace(/^@+/, "");
  return `https://t.me/${clean}`;
}

function withStartParam(url: string): string {
  return url.includes("?") ? url : `${url}?start=help`;
}

export const botSettingsService = new BotSettingsService();

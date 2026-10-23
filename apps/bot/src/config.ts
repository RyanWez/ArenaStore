import * as dotenv from "dotenv";
import { z } from "zod";

// Load .env from root or parent dirs
dotenv.config();
dotenv.config({ path: "../../.env" });
dotenv.config({ path: "../.env" });

const envSchema = z.object({
  // Accept any environment name (production, staging, preview, …) rather than a
  // fixed enum: insecure-default guards below fire for every env except an
  // explicit "development"/"test", so a non-production deployment is protected
  // too and cannot silently run on the public default secrets.
  NODE_ENV: z.string().default("development"),
  TELEGRAM_BOT_TOKEN: z.string().min(1, "Telegram Bot Token is required in .env"),
  API_BASE_URL: z.string().url().default("http://localhost:4000"),
  UPSTREAM_BASE_URL: z.string().url().default("http://paid2.daki.cc:4153/api/partner/v1"),
  UPSTREAM_API_KEY: z.string().default(""),
  DIGITALCORE_BASE_URL: z.string().url().default("https://digitalcore.top"),
  DIGITALCORE_API_KEY: z.string().default(""),
  SUPPLIERS_ENABLED: z.string().default("xpro"),
  DEFAULT_EXCHANGE_RATE_MMK: z.coerce.number().default(4500),
  DEFAULT_MARGIN_PERCENTAGE: z.coerce.number().default(25),
  SUPPORT_USERNAME: z.string().default("ryanwez"),
  CHANNEL_URL: z.string().default("https://t.me/arenasellerstore"),
  REQUIRED_CHANNEL_USERNAME: z.string().default("@arenasellerstore"),
  FORCE_CHANNEL_JOIN: z.coerce.boolean().default(true),
  PAYMENT_KPAY_PHONE: z.string().default("09960476738"),
  PAYMENT_WAVEPAY_PHONE: z.string().default("09960476738"),
  PAYMENT_ACCOUNT_NAME: z.string().default("Ryan Wez"),
  TELEGRAM_GROUP_CHAT_ID: z.string().default(""),
  TELEGRAM_DEPOSIT_TOPIC_ID: z.string().default(""),
  TELEGRAM_BOT_ALERT_TOPIC_ID: z.string().default(""),
  TELEGRAM_ADMIN_MENTIONS: z.string().default(""),
  TELEGRAM_APPROVER_IDS: z.string().default(""),
  /** Shared secret for internal API calls (deposit review buttons). Empty disables them. */
  INTERNAL_API_TOKEN: z.string().default(""),
  DELIVERY_ENCRYPTION_KEY: z
    .string()
    .min(16)
    .default("arena-store-default-dev-encryption-key-32bytes!"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
});

export type BotConfig = z.infer<typeof envSchema>;

export function loadBotConfig(): BotConfig {
  const isTest = process.env.NODE_ENV === "test" || process.env.VITEST !== undefined;
  const rawEnv = {
    ...process.env,
    TELEGRAM_BOT_TOKEN:
      process.env.TELEGRAM_BOT_TOKEN ||
      (isTest ? "123456789:ABCdefGHIjklMNOpqrsTUVwxyz_mock_test_token" : ""),
    UPSTREAM_BASE_URL:
      process.env.UPSTREAM_BASE_URL ||
      process.env.UPSTREAM_PARTNER_API_BASE_URL ||
      process.env.UPSTREAM_API_URL ||
      "http://paid2.daki.cc:4153/api/partner/v1",
    UPSTREAM_API_KEY:
      process.env.UPSTREAM_API_KEY ||
      process.env.UPSTREAM_PARTNER_API_KEY ||
      process.env.UPTREAM_API_KEY ||
      "",
    DIGITALCORE_BASE_URL:
      process.env.DIGITALCORE_BASE_URL ||
      "https://digitalcore.top",
    DIGITALCORE_API_KEY:
      process.env.DIGITALCORE_API_KEY ||
      "",
    SUPPLIERS_ENABLED:
      process.env.SUPPLIERS_ENABLED ||
      "xpro",
    DELIVERY_ENCRYPTION_KEY:
      process.env.DELIVERY_ENCRYPTION_KEY ||
      "arena-store-default-dev-encryption-key-32bytes!",
  };

  const parsed = envSchema.safeParse(rawEnv);
  if (!parsed.success) {
    console.error("Invalid bot configuration:", parsed.error.format());
    throw new Error("Bot configuration validation failed.");
  }

  const data = parsed.data;

  // Strict security guards: the public default key may only be used in
  // explicit development or test. Any other environment (production, staging,
  // preview, or an unrecognised NODE_ENV) must supply real values or the
  // process refuses to boot.
  const isDevOrTest = data.NODE_ENV === "development" || data.NODE_ENV === "test";
  if (!isDevOrTest && data.DELIVERY_ENCRYPTION_KEY === "arena-store-default-dev-encryption-key-32bytes!") {
    throw new Error(
      `CRITICAL SECURITY ERROR: DELIVERY_ENCRYPTION_KEY is using the insecure default key in a non-dev environment (NODE_ENV=${data.NODE_ENV})! Set a custom key in .env.`
    );
  }

  return data;
}

import { setCoreConfig } from "@arena/core";

export const botConfig = loadBotConfig();
setCoreConfig(botConfig);

/**
 * Normalizes any channel representation (@channel, channel, https://t.me/channel)
 * into a valid Telegram username (@channel) and URL (https://t.me/channel).
 */
export function normalizeChannelUsername(raw: string): { username: string; url: string } {
  let cleaned = (raw || "@arenasellerstore").trim();
  if (cleaned.startsWith("https://t.me/")) {
    cleaned = cleaned.replace("https://t.me/", "");
  } else if (cleaned.startsWith("http://t.me/")) {
    cleaned = cleaned.replace("http://t.me/", "");
  } else if (cleaned.startsWith("t.me/")) {
    cleaned = cleaned.replace("t.me/", "");
  }
  const bareName = cleaned.replace(/^@/, "").replace(/\/$/, "");
  return {
    username: `@${bareName}`,
    url: `https://t.me/${bareName}`,
  };
}

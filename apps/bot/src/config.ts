import * as dotenv from "dotenv";
import { z } from "zod";

// Load .env from root or parent dirs
dotenv.config();
dotenv.config({ path: "../../.env" });
dotenv.config({ path: "../.env" });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  TELEGRAM_BOT_TOKEN: z.string().min(1, "Telegram Bot Token is required in .env"),
  API_BASE_URL: z.string().url().default("http://localhost:4000"),
  UPSTREAM_BASE_URL: z.string().url().default("http://paid2.daki.cc:4153/api/partner/v1"),
  UPSTREAM_API_KEY: z.string().default(""),
  DEFAULT_EXCHANGE_RATE_MMK: z.coerce.number().default(4500),
  DEFAULT_MARGIN_PERCENTAGE: z.coerce.number().default(25),
  SUPPORT_USERNAME: z.string().default("ryanwez"),
  CHANNEL_URL: z.string().default("https://t.me/arenasellerstore"),
  PAYMENT_KPAY_PHONE: z.string().default("09-8472918471"),
  PAYMENT_WAVEPAY_PHONE: z.string().default("09-8492019400"),
  PAYMENT_ACCOUNT_NAME: z.string().default("Ryan Wez (Arena Store)"),
});

export type BotConfig = z.infer<typeof envSchema>;

export function loadBotConfig(): BotConfig {
  const isTest = process.env.NODE_ENV === "test" || process.env.VITEST !== undefined;
  const rawEnv = {
    ...process.env,
    TELEGRAM_BOT_TOKEN:
      process.env.TELEGRAM_BOT_TOKEN ||
      (isTest ? "123456789:ABCdefGHIjklMNOpqrsTUVwxyz_mock_test_token" : ""),
    UPSTREAM_API_KEY:
      process.env.UPSTREAM_API_KEY ||
      process.env.UPSTREAM_PARTNER_API_KEY ||
      process.env.UPTREAM_API_KEY ||
      "",
  };

  const parsed = envSchema.safeParse(rawEnv);
  if (!parsed.success) {
    console.error("Invalid bot configuration:", parsed.error.format());
    throw new Error("Bot configuration validation failed.");
  }
  return parsed.data;
}

export const botConfig = loadBotConfig();

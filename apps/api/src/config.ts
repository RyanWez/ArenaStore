import * as dotenv from "dotenv";
import { z } from "zod";

import path from "node:path";

// Load .env from root or apps/api
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().default("postgres://postgres:postgres@localhost:5432/arena_store"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  ADMIN_SESSION_SECRET: z.string().default("VxyyoXyS9@Mg1c4POHuXjoUVrhhP"),
  ADMIN_EMAIL: z.string().email().default("admin@arenastore.mm"),
  ADMIN_INITIAL_PASSWORD: z.string().min(6).default("ArenaAdmin2026!"),
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  UPSTREAM_BASE_URL: z
    .string()
    .url()
    .default("http://paid2.daki.cc:4153/api/partner/v1"),
  UPSTREAM_API_KEY: z.string().default(""),
  DELIVERY_ENCRYPTION_KEY: z
    .string()
    .min(16)
    .default("arena-store-default-dev-encryption-key-32bytes!"),
  ADMIN_API_KEY: z.string().default("dev_admin_secret_key_change_in_production"),
  DEFAULT_EXCHANGE_RATE_MMK: z.coerce.number().default(4500),
  DEFAULT_MARGIN_PERCENTAGE: z.coerce.number().default(25),
  /** Automatic catalog sync cadence in minutes; 0 disables the scheduler. */
  CATALOG_SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(0).default(10),
  /** Whether Fastify should trust reverse proxy headers like X-Forwarded-For */
  TRUST_PROXY: z
    .union([z.boolean(), z.string()])
    .default(true)
    .transform((val) => (typeof val === "string" ? val.toLowerCase() === "true" || val === "1" : val)),
  /** Allowed CORS origins (comma-separated domains) */
  CORS_ORIGIN: z.string().default("http://localhost:3000,http://127.0.0.1:3000"),
  /**
   * Base32 TOTP shared secret for admin 2FA (Google Authenticator & compatible).
   * Unset or empty disables 2FA; when set, admin logins must supply a valid
   * 6-digit code. Generate with `pnpm totp:enroll`.
   */
  ADMIN_TOTP_SECRET: z
    .union([z.literal(""), z.string().regex(/^[A-Z2-7=]{16,}$/i)])
    .optional(),
  /**
   * Shared secret authenticating the bot process against internal endpoints
   * (e.g. POST /api/bot/deposits/:id/review for the admin group's approve /
   * reject buttons). Empty disables those endpoints entirely.
   */
  INTERNAL_API_TOKEN: z.string().default(""),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(): AppConfig {
  const rawEnv = {
    ...process.env,
    TRUST_PROXY: process.env.TRUST_PROXY ?? true,
    CORS_ORIGIN:
      process.env.CORS_ORIGIN ||
      process.env.ALLOWED_ORIGINS ||
      "http://localhost:3000,http://127.0.0.1:3000",
    ADMIN_EMAIL: process.env.ADMIN_EMAIL || "admin@arenastore.mm",
    ADMIN_INITIAL_PASSWORD:
      process.env.ADMIN_INITIAL_PASSWORD ||
      process.env.ADMIN_PASSWORD ||
      "ArenaAdmin2026!",
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
  };

  const parsed = envSchema.safeParse(rawEnv);
  if (!parsed.success) {
    console.error("Invalid configuration:", parsed.error.format());
    throw new Error("Configuration validation failed.");
  }

  const data = parsed.data;

  // Strict production security guards
  if (data.NODE_ENV === "production") {
    if (data.DELIVERY_ENCRYPTION_KEY === "arena-store-default-dev-encryption-key-32bytes!") {
      throw new Error(
        "CRITICAL SECURITY ERROR: DELIVERY_ENCRYPTION_KEY is using the insecure default key in production! Set a custom key in .env."
      );
    }
    if (data.ADMIN_SESSION_SECRET === "VxyyoXyS9@Mg1c4POHuXjoUVrhhP") {
      throw new Error(
        "CRITICAL SECURITY ERROR: ADMIN_SESSION_SECRET is using the insecure default secret in production! Set a custom secret in .env."
      );
    }
    if (data.ADMIN_API_KEY === "dev_admin_secret_key_change_in_production") {
      throw new Error(
        "CRITICAL SECURITY ERROR: ADMIN_API_KEY is using the insecure default key in production! Set a custom key in .env."
      );
    }
  }

  return data;
}

export const config = loadConfig();

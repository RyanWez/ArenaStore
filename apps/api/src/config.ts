import * as dotenv from "dotenv";
import { z } from "zod";

import path from "node:path";

// Load .env from root or apps/api
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config();

const envSchema = z.object({
  // Accept any environment name (production, staging, preview, …) rather than a
  // fixed enum: insecure-default guards below fire for every env except an
  // explicit "development"/"test", so a non-production deployment is protected
  // too and cannot silently run on the public default secrets.
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().default("postgres://postgres:postgres@localhost:5432/arena_store"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  ADMIN_SESSION_SECRET: z.string().default("VxyyoXyS9@Mg1c4POHuXjoUVrhhP"),
  ADMIN_EMAIL: z.string().email().default("admin@arenastore.mm"),
  ADMIN_INITIAL_PASSWORD: z.string().min(6).default("ArenaAdmin2026!"),
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  TELEGRAM_GROUP_CHAT_ID: z.string().default(""),
  /**
   * Forum topic id (message_thread_id) of the "Bot Alert" topic in the admin
   * group, where operational alerts (low supplier balance etc.) are posted.
   * Optional env fallback — the admin panel setting (app_settings
   * telegramBotAlertTopicId) wins when set. Empty = General topic.
   */
  TELEGRAM_BOT_ALERT_TOPIC_ID: z.string().default(""),
  /**
   * Bot username (with or without @) used to build t.me deep links in
   * customer-facing broadcasts (e.g. the restock notification's "Open the
   * bot" CTA). Optional — unset renders those messages as plain text.
   */
  TELEGRAM_BOT_USERNAME: z.string().default(""),
  UPSTREAM_BASE_URL: z
    .string()
    .url()
    .default("http://paid2.daki.cc:4153/api/partner/v1"),
  UPSTREAM_API_KEY: z.string().default(""),
  DIGITALCORE_BASE_URL: z
    .string()
    .url()
    .default("https://digitalcore.top"),
  DIGITALCORE_API_KEY: z.string().default(""),
  SUPPLIERS_ENABLED: z.string().default("xpro"),
  DELIVERY_ENCRYPTION_KEY: z
    .string()
    .min(16)
    .default("arena-store-default-dev-encryption-key-32bytes!"),
  DEFAULT_EXCHANGE_RATE_MMK: z.coerce.number().default(4500),
  DEFAULT_MARGIN_PERCENTAGE: z.coerce.number().default(25),
  /** Automatic catalog sync cadence in minutes; 0 disables the scheduler. */
  CATALOG_SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(0).default(10),
  /**
   * Supplier balance check cadence in minutes (low-balance alert latency);
   * 0 disables the balance scheduler. Independent of the sync interval so
   * alerts are not delayed by catalog syncs.
   */
  BALANCE_CHECK_INTERVAL_MINUTES: z.coerce.number().int().min(0).default(2),
  MMPAY_APP_ID: z.string().default(""),
  MMPAY_PUBLISHABLE_KEY: z.string().default(""),
  MMPAY_SECRET_KEY: z.string().default(""),
  MMPAY_API_BASE_URL: z.string().default("https://bbapi.myanmyanpay.com"),
  /**
   * Public HTTPS base URL of this API, used to build the MMQR webhook callback
   * URL (`<PUBLIC_API_URL>/api/webhooks/mmpay`). Empty falls back to the
   * webhook URL configured in the MMPay developer portal.
   */
  PUBLIC_API_URL: z.string().default(""),
  /**
   * How often (seconds) the API polls MyanMyanPay for still-PENDING MMQR
   * top-ups and credits any the gateway reports as paid — the safety net for a
   * webhook that was never delivered. 0 disables the reconciliation sweep.
   * Only runs when MMPay credentials are configured.
   */
  MMPAY_RECONCILE_INTERVAL_SECONDS: z.coerce.number().int().min(0).default(45),
  /**
   * Whether Fastify should trust reverse proxy headers like X-Forwarded-For.
   * - "loopback, uniquelocal" (or 1): trusts local & private reverse proxies (e.g. Render,
   *   Docker, Cloudflare, Nginx, AWS VPC) while rejecting spoofed IP headers from public clients. (Default)
   * - false: disables proxy trust completely (binds to socket remoteAddress).
   * - true: trusts all hops in the X-Forwarded-For chain.
   * - string: specific trusted IPs, CIDR subnets, or proxy-addr keywords.
   */
  TRUST_PROXY: z
    .union([z.boolean(), z.number(), z.string()])
    .default("loopback, uniquelocal")
    .transform((val): boolean | string => {
      if (typeof val === "boolean") return val;
      if (typeof val === "number") {
        if (val === 0) return false;
        return "loopback, uniquelocal";
      }
      if (typeof val === "string") {
        const lower = val.toLowerCase().trim();
        if (lower === "true") return true;
        if (lower === "false" || lower === "0" || lower === "") return false;
        if (lower === "1") return "loopback, uniquelocal";
        return val; // Allow specific IP or CIDR subnet
      }
      return "loopback, uniquelocal";
    }),
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
    TRUST_PROXY: process.env.TRUST_PROXY ?? "loopback, uniquelocal",
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
    DIGITALCORE_BASE_URL:
      process.env.DIGITALCORE_BASE_URL ||
      "https://digitalcore.top",
    DIGITALCORE_API_KEY:
      process.env.DIGITALCORE_API_KEY ||
      "",
    SUPPLIERS_ENABLED:
      process.env.SUPPLIERS_ENABLED ||
      "xpro",
    TELEGRAM_GROUP_CHAT_ID:
      process.env.TELEGRAM_GROUP_CHAT_ID ||
      "",
  };

  const parsed = envSchema.safeParse(rawEnv);
  if (!parsed.success) {
    console.error("Invalid configuration:", parsed.error.format());
    throw new Error("Configuration validation failed.");
  }

  const data = parsed.data;

  // Strict security guards: the public default secret/password/key may only be
  // used in explicit development or test. Any other environment (production,
  // staging, preview, or an unrecognised NODE_ENV) must supply real values or
  // the process refuses to boot — fail closed instead of silently serving on a
  // secret that is published in this repository.
  const isDevOrTest = data.NODE_ENV === "development" || data.NODE_ENV === "test";
  if (!isDevOrTest) {
    if (data.DELIVERY_ENCRYPTION_KEY === "arena-store-default-dev-encryption-key-32bytes!") {
      throw new Error(
        `CRITICAL SECURITY ERROR: DELIVERY_ENCRYPTION_KEY is using the insecure default key in a non-dev environment (NODE_ENV=${data.NODE_ENV})! Set a custom key in .env.`
      );
    }
    if (data.ADMIN_SESSION_SECRET === "VxyyoXyS9@Mg1c4POHuXjoUVrhhP") {
      throw new Error(
        `CRITICAL SECURITY ERROR: ADMIN_SESSION_SECRET is using the insecure default secret in a non-dev environment (NODE_ENV=${data.NODE_ENV})! Set a custom secret in .env.`
      );
    }
    if (data.ADMIN_INITIAL_PASSWORD === "ArenaAdmin2026!") {
      throw new Error(
        `CRITICAL SECURITY ERROR: ADMIN_INITIAL_PASSWORD is using the insecure default password in a non-dev environment (NODE_ENV=${data.NODE_ENV})! Set a custom password in .env.`
      );
    }

    // MMPay fail-closed guard. The gateway is optional (both keys empty = off),
    // but a HALF-configured gateway in production is dangerous: with only the
    // publishable key the gateway handshake is half-wired, and with no secret
    // key the webhook signature check is silently skipped — a forged SUCCESS
    // callback could credit a wallet. Require both keys together, or neither.
    const hasMmpayPublishable = Boolean(data.MMPAY_PUBLISHABLE_KEY);
    const hasMmpaySecret = Boolean(data.MMPAY_SECRET_KEY);
    if (hasMmpayPublishable !== hasMmpaySecret) {
      throw new Error(
        `CRITICAL CONFIG ERROR: MyanMyanPay is half-configured in a non-dev environment (NODE_ENV=${data.NODE_ENV}). ` +
          `Set BOTH MMPAY_PUBLISHABLE_KEY and MMPAY_SECRET_KEY (the webhook signature is only enforced when the secret is present), or leave both empty to disable MMPay.`
      );
    }
    if (hasMmpayPublishable && hasMmpaySecret && !data.PUBLIC_API_URL) {
      console.warn(
        "[config] MMPay keys are set but PUBLIC_API_URL is empty — the webhook callback URL cannot be built; falling back to the portal-configured webhook. Set PUBLIC_API_URL to the public HTTPS origin (e.g. https://arena.ryanwez.com)."
      );
    }
  }

  return data;
}

export const config = loadConfig();

export function getEnabledSuppliers(): ("XPRO" | "DIGITALCORE")[] {
  const raw = (config.SUPPLIERS_ENABLED || "xpro").toLowerCase().split(",").map((s) => s.trim());
  const list: ("XPRO" | "DIGITALCORE")[] = [];
  if (raw.includes("xpro")) list.push("XPRO");
  if (raw.includes("digitalcore")) list.push("DIGITALCORE");
  return list.length > 0 ? list : ["XPRO"];
}


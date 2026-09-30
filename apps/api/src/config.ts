import * as dotenv from "dotenv";
import { z } from "zod";

// Load .env from root or apps/api
dotenv.config({ path: "../../.env" });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().default("postgres://postgres:postgres@localhost:5432/arena_store"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
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
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(): AppConfig {
  const rawEnv = {
    ...process.env,
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
  return parsed.data;
}

export const config = loadConfig();

/**
 * Shared, non-secret constants for the integration test environment.
 *
 * These values are injected into process.env by tests/vitest.config.ts BEFORE
 * any application module is imported, so the dotenv loaders inside
 * apps/api/src/config.ts and apps/bot/src/config.ts can never override them
 * with the developer's real .env values.
 *
 * Nothing here is a real credential: the upstream base URL points at an
 * unroutable localhost port (port 9 = discard protocol, connection refused
 * immediately), and all keys are clearly synthetic test-only values.
 */
export const TEST_DB_HOST = process.env.TEST_DB_HOST || "127.0.0.1";
export const TEST_DB_PORT = process.env.TEST_DB_PORT || "5432";
export const TEST_DB_USER = process.env.TEST_DB_USER || "postgres";
export const TEST_DB_PASSWORD = process.env.TEST_DB_PASSWORD || "postgres";
export const TEST_DB_NAME = "arena_store_test";

export const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ||
  `postgres://${TEST_DB_USER}:${TEST_DB_PASSWORD}@${TEST_DB_HOST}:${TEST_DB_PORT}/${TEST_DB_NAME}`;

/** Unroutable localhost port — any accidental real upstream call fails instantly. */
export const TEST_UPSTREAM_BASE_URL = "http://127.0.0.1:9";
export const TEST_DIGITALCORE_BASE_URL = "http://127.0.0.1:9";

export const TEST_DELIVERY_ENCRYPTION_KEY = "arena-integration-test-delivery-key-32b!!";
export const TEST_ADMIN_SESSION_SECRET = "arena-integration-test-session-secret-32b!!";
export const TEST_ADMIN_API_KEY = "arena-integration-test-admin-api-key";

export const TEST_ADMIN_EMAIL = "test-admin@arena-store.test";
export const TEST_ADMIN_PASSWORD = "TestAdminPass2026!";

/** Shared secret exercising the bot → API internal endpoints in tests. */
export const TEST_INTERNAL_API_TOKEN = "arena-integration-test-internal-token";

/** Environment overrides applied to every Vitest worker before app imports. */
export const TEST_ENV: Record<string, string> = {
  NODE_ENV: "test",
  DATABASE_URL: TEST_DB_URL,
  DIRECT_URL: TEST_DB_URL,
  // Both upstream key variants must be cleared: apps/api config falls back
  // from UPSTREAM_API_KEY to UPSTREAM_PARTNER_API_KEY.
  UPSTREAM_BASE_URL: TEST_UPSTREAM_BASE_URL,
  UPSTREAM_API_KEY: "",
  UPSTREAM_PARTNER_API_KEY: "",
  DIGITALCORE_BASE_URL: TEST_DIGITALCORE_BASE_URL,
  DIGITALCORE_API_KEY: "",
  SUPPLIERS_ENABLED: "xpro,digitalcore",
  // Keep the catalog sync scheduler off in every test environment.
  CATALOG_SYNC_INTERVAL_MINUTES: "0",
  TELEGRAM_BOT_TOKEN: "",
  DELIVERY_ENCRYPTION_KEY: TEST_DELIVERY_ENCRYPTION_KEY,
  ADMIN_SESSION_SECRET: TEST_ADMIN_SESSION_SECRET,
  ADMIN_API_KEY: TEST_ADMIN_API_KEY,
  ADMIN_EMAIL: TEST_ADMIN_EMAIL,
  ADMIN_INITIAL_PASSWORD: TEST_ADMIN_PASSWORD,
  ADMIN_TOTP_SECRET: "",
  INTERNAL_API_TOKEN: TEST_INTERNAL_API_TOKEN,
  LOG_LEVEL: "silent",
};

/**
 * Unit tests are pure domain logic: the database URL is deliberately emptied
 * (which blocks the .env dotenv loaders too) so bot services deterministically
 * use their in-memory fallbacks instead of silently touching any real DB.
 */
export const UNIT_ENV: Record<string, string> = {
  ...TEST_ENV,
  DATABASE_URL: "",
  DIRECT_URL: "",
};

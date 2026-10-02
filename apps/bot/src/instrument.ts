import * as Sentry from "@sentry/node";
import * as dotenv from "dotenv";

/**
 * Sentry must initialize before grammY handlers run, so this module is
 * imported FIRST in src/index.ts. ESM hoists imports, which would otherwise
 * let ./bot load first — keep it at the top.
 *
 * bot/config.ts normally loads .env, but it evaluates after this import, so
 * the same dotenv cascade is repeated here to make SENTRY_DSN visible.
 */
dotenv.config();
dotenv.config({ path: "../../.env" });
dotenv.config({ path: "../.env" });

// Without a DSN the SDK never sends events (and the init is skipped entirely),
// so local dev and test runs carry zero Sentry overhead.
export const isSentryEnabled = Boolean(process.env.SENTRY_DSN);

if (isSentryEnabled) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0.1,
  });
}

/** Flush pending events before process exit (no-op when Sentry is disabled). */
export async function closeSentry(): Promise<void> {
  if (!isSentryEnabled) return;
  await Sentry.close(2000);
}

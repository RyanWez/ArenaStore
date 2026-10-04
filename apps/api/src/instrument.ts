import * as Sentry from "@sentry/node";
import * as dotenv from "dotenv";
import path from "node:path";

/**
 * Sentry must initialize before Fastify (and its diagnostics-channel hooks)
 * load, so this module is imported FIRST in src/index.ts. ESM hoists imports,
 * which would otherwise let ./server load first — keep it at the top.
 *
 * config.ts normally loads .env, but it evaluates after this import, so the
 * same dotenv cascade is repeated here to make SENTRY_DSN visible.
 */
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config();

// Without a DSN the SDK never sends events (and the init is skipped entirely),
// so local dev and test runs carry zero Sentry overhead.
export const isSentryEnabled = Boolean(process.env.SENTRY_DSN);

/**
 * Error context may carry customer PII (telegram ids, emails, usernames) and
 * internal request URLs. Sentry still gets the message + stack, but request
 * payloads are dropped entirely and values under PII-shaped keys are redacted
 * before anything leaves the process. Keep in sync with the bot's instrument.ts.
 */
const PII_KEY = /(telegram|username|phone|email|password|token|secret|authorization|cookie)/i;

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = PII_KEY.test(key) ? "[redacted]" : redactValue(val);
    }
    return out;
  }
  return value;
}

if (isSentryEnabled) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0.1,
    beforeSend(event) {
      delete event.request;
      if (event.extra) event.extra = redactValue(event.extra) as typeof event.extra;
      if (event.contexts) event.contexts = redactValue(event.contexts) as typeof event.contexts;
      for (const crumb of event.breadcrumbs ?? []) {
        if (crumb.data) crumb.data = redactValue(crumb.data) as typeof crumb.data;
      }
      return event;
    },
  });
}

/** Flush pending events before process exit (no-op when Sentry is disabled). */
export async function closeSentry(): Promise<void> {
  if (!isSentryEnabled) return;
  await Sentry.close(2000);
}

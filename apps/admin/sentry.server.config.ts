import * as Sentry from "@sentry/nuxt";

// Server (Nitro) Sentry init — bundled by the @sentry/nuxt module and run at
// server start. Runtime config is not ready here, so read the environment
// directly. No-op unless NUXT_PUBLIC_SENTRY_DSN is configured.
const dsn = process.env.NUXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
  });
}

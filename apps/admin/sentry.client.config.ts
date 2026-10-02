import * as Sentry from "@sentry/nuxt";

// Client-side Sentry init — auto-picked-up by the @sentry/nuxt module.
// No-op unless NUXT_PUBLIC_SENTRY_DSN is configured.
const dsn = useRuntimeConfig().public.sentry.dsn as string | undefined;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
  });
}

# 04 — Free Deployment Plan

## Status

**COMPLETED & LIVE IN PRODUCTION (2026-10-03)**
See [2026-10-03.md](file:///home/zixuan/Projects/Arena%20Store/Memory/2026-10-03.md) for full deployment details, architecture runbook, environment variables, and resolved pitfalls.
- Backend API & Bot: `https://arenastore-backend.onrender.com/` (Render Free Web Service, Singapore)
- Database: Neon Serverless PostgreSQL (`ep-steep-wave-b3bec48e-pooler.c-4.ap-southeast-1.aws.neon.tech`)
- Admin Dashboard: Vercel (`arenastore-admin`)
- Keep-Alive: UptimeRobot pinging every 10 minutes

## MVP deployment target

| Component | Preferred starting option | Notes |
|---|---|---|
| Admin dashboard | Vercel | Nuxt 3 (Nitro) friendly; protect the admin route |
| API + Telegram webhook/worker | Render, Railway-equivalent, or low-cost VPS | Must stay awake for reliable webhooks/jobs |
| PostgreSQL | Neon or Supabase | Use backups and connection pooling |
| Redis | Upstash | queue, idempotency locks, stock reservations |
| File storage | Cloudflare R2 or Supabase Storage | payment screenshots / product assets only |
| Error tracking | Sentry | never send credentials or delivery payloads |

## Recommendation

Free tiers are acceptable for scaffold and internal testing. A real money/order system should move to an always-on low-cost VPS or paid managed runtime before public launch. Sleeping server processes can delay payment verification, webhook processing, and fulfilment.

## Arena preview requirement

Arena's live preview runs inside a sandboxed iframe. Development-mode servers can block client JavaScript assets requested from that opaque origin, leaving server-rendered pages visible but non-interactive. For an Arena preview, run a fresh production build and serve the Nuxt output (`node apps/admin/.output/server/index.mjs`) rather than `nuxt dev`; do not broadly weaken origin-security checks merely to make a preview work.

## Deployment requirements

- HTTPS for public backend routes.
- Environment secrets configured in the deployment provider, not in source files.
- Health endpoint, database migration workflow, error tracking, backup plan, and uptime alert before launch.
- Bot webhook URL must be public and use HTTPS; development may use long polling.
- Restrict admin access with authentication, role checks, and secure session settings.

## Monitoring setup (Sentry + UptimeRobot)

Scaffolding is already in place (`apps/*/src/instrument.ts` for API/bot, `@sentry/nuxt` module + `sentry.{client,server}.config.ts` for admin). Everything is **a complete no-op until a DSN is configured** — no DSN means zero network traffic and zero overhead, so this setup can ship before any account exists.

### 1. Sentry (error tracking, free tier)

1. Create a free account at [sentry.io](https://sentry.io) and an organization (e.g. `arena-store`).
2. Create three projects and copy each DSN (Settings → Projects → Client Keys):
   - `arena-api` (platform: Node) → `SENTRY_DSN`
   - `arena-bot` (platform: Node) → `SENTRY_DSN` (can reuse the API DSN, but separate projects keep issues tidy)
   - `arena-admin` (platform: Nuxt) → `NUXT_PUBLIC_SENTRY_DSN`
3. Set the variables where each app runs:
   - API + bot: runtime environment on the host (Render/Railway/VPS env, or `.env` consumed by docker-compose, which passes `SENTRY_DSN` through).
   - Admin: `NUXT_PUBLIC_SENTRY_DSN` must be set **at build time** as well — the Nuxt module only wires the SDK when the DSN exists during the build (Vercel project env var; docker-compose passes it as a build arg). It is read again at runtime for server-side init.
4. Optional (better stack traces): add `SENTRY_AUTH_TOKEN` to the admin build to upload source maps.
5. Alert routing: Sentry default email alerts are enough to start; add a Telegram/email integration later.

Never send credentials or delivery payloads to Sentry — the SDK only receives unhandled exceptions and route transactions.

### 2. UptimeRobot (uptime alerts, free tier: 50 monitors at 5-minute intervals)

1. Create a free account at [uptimerobot.com](https://uptimerobot.com) → Add New Monitor.
2. Monitor 1 — API health (HTTP(s)): URL `https://<api-host>/health`, interval 5 min. The endpoint answers `200 {"status":"ok"}` when healthy and `503 {"status":"degraded"}` when the database is unreachable, so a DB outage pages automatically. A degraded upstream partner API still returns 200 with `degraded: true` (store keeps serving from local catalog state).
3. Monitor 2 — Admin (HTTP(s)): URL `https://<admin-host>/` — catches the whole dashboard being down.
4. Monitor 3 — Keyword check (Keyword): URL `https://<api-host>/health`, keyword `"status":"ok"` — catches the 200-but-degraded case where only the upstream partner API is down.
5. Set the alert contact (email; Telegram contact is supported) for all three monitors.

## Release gates

1. All core tests pass.
2. A sandbox/mock fulfilment scenario passes end-to-end.
3. Payment review flow tested without real customer data.
4. Supplier read-only sync verified.
5. No live key exists in tracked files or build output.
6. Restore procedure and admin access documented.

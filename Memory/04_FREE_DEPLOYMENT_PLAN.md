# 04 — Free Deployment Plan

## Status

Planning document only. Provider quotas and free tiers must be verified immediately before deployment.

## MVP deployment target

| Component | Preferred starting option | Notes |
|---|---|---|
| Admin dashboard | Vercel | Next.js-friendly; protect the admin route |
| API + Telegram webhook/worker | Render, Railway-equivalent, or low-cost VPS | Must stay awake for reliable webhooks/jobs |
| PostgreSQL | Neon or Supabase | Use backups and connection pooling |
| Redis | Upstash | queue, idempotency locks, stock reservations |
| File storage | Cloudflare R2 or Supabase Storage | payment screenshots / product assets only |
| Error tracking | Sentry | never send credentials or delivery payloads |

## Recommendation

Free tiers are acceptable for scaffold and internal testing. A real money/order system should move to an always-on low-cost VPS or paid managed runtime before public launch. Sleeping server processes can delay payment verification, webhook processing, and fulfilment.

## Arena preview requirement

Arena's live preview runs inside a sandboxed iframe. Next.js development mode can block client JavaScript assets requested from that opaque origin, leaving server-rendered pages visible but non-interactive. For an Arena preview, run a fresh production build and `next start` process rather than `next dev`; do not broadly weaken origin-security checks merely to make a preview work.

## Deployment requirements

- HTTPS for public backend routes.
- Environment secrets configured in the deployment provider, not in source files.
- Health endpoint, database migration workflow, error tracking, backup plan, and uptime alert before launch.
- Bot webhook URL must be public and use HTTPS; development may use long polling.
- Restrict admin access with authentication, role checks, and secure session settings.

## Release gates

1. All core tests pass.
2. A sandbox/mock fulfilment scenario passes end-to-end.
3. Payment review flow tested without real customer data.
4. Supplier read-only sync verified.
5. No live key exists in tracked files or build output.
6. Restore procedure and admin access documented.

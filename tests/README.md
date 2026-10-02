# Tests

## Layout

- `unit/` — pure domain logic: money, price, stock, parsers, state transitions
- `integration/` — money-flow tests against a real throwaway local Postgres (`arena_store_test`): wallet top-up review, bot purchase, API order fulfillment, catalog sync
- `e2e/` — admin dashboard flows (Playwright, mocked UI): auth, products table, deposit slip review
- `fixtures/` — synthetic catalog/order/payment fixture builders (`seed.ts`)
- `mocks/` — upstream XPro Partner API mock payloads (`upstream.ts`) and admin API payloads for E2E (`admin-api.ts`)
- `setup/` — vitest test environment (`test-env.ts`), integration DB bootstrap (`integration-global-setup.ts`), safety guard (`integration-safety.ts`), in-memory Redis fake (`in-memory-redis.ts`)

## Running

```bash
pnpm test                      # unit + integration
pnpm test:unit                 # unit only — no Postgres required
pnpm test:integration          # integration only
pnpm test:e2e                  # Playwright E2E (desktop + mobile chromium)
```

Integration tests automatically use a local PostgreSQL if one is reachable (e.g. `docker compose up -d postgres`); if none is running, a user-space embedded instance (Postgres 17 via `embedded-postgres`) is started from `tests/.pgdata` (gitignored) — no Docker or system install required. No Redis is needed (in-memory fake).

## Integration test safety model

- Every test file rebuilds a pristine `arena_store_test` database (DROP + CREATE + migrations) — the development/production database is never touched.
- `tests/setup/integration-safety.ts` refuses to run unless `DATABASE_URL` points at a local database named `*_test`, `UPSTREAM_BASE_URL` points at localhost, and no upstream API key is present.
- The vitest config injects all safe env values (empty upstream keys, unroutable `http://127.0.0.1:9` upstream URL, empty Telegram token, test-only encryption keys) before any app module import, so the developer's `.env` can never leak into a test run.
- `apps/api/src/services/order.service.ts` carries an additional runtime guard that refuses to place an upstream order from a test environment with a non-local upstream URL (mirrors the bot-side guard).
- Redis is replaced by an in-memory fake (`setup/in-memory-redis.ts`); the upstream supplier and Telegram are always mocked.

## Browser coverage (Playwright E2E)

`playwright.config.ts` builds the Nuxt admin app and serves the production output (`node apps/admin/.output/server/index.mjs`) on `127.0.0.1:3100`, for desktop-chromium and mobile-chromium (Pixel 7) projects. Specs live in `e2e/`:

- `admin-auth.spec.ts` — unauthenticated redirect to /login, login → dashboard, invalid-credentials error, sidebar logout
- `products-table.spec.ts` — catalog table rendering (names/prices/stock badges), paused filter pill, pause toggle → confirm dialog → captured `PUT`, upstream catalog sync
- `deposits-review.spec.ts` — slip list rendering, approve (`POST {action: APPROVE}`) with status update, reject with default reason dialog, slip proof image

First run needs the browser binary: `pnpm --filter @arena-store/tests exec playwright install chromium` (~150 MB).

**How the mocking works.** The admin UI calls same-origin `/api/admin/**`; `e2e/helpers/mock-admin-api.ts` intercepts every such request in the browser with `page.route()` and answers from `mocks/admin-api.ts` payload builders, recording each call for request-shape assertions. The API server, Postgres, Redis, and the upstream supplier are never contacted — CI runs the E2E job without any services. Response envelopes follow the real admin contract (`{ ok, ... }`), and review actions mutate the mock list state so the pages' 4-second polling sees the change.

**Constraint:** after logging in through the form, all navigation stays client-side (sidebar links, including the mobile hamburger). A full page reload with the session cookie would trigger the SSR auth check (`GET /api/admin/auth/me`) inside the Nitro proxy, which has no backend behind it in E2E. CI runs only the desktop project (`--project=desktop-chromium`) to keep time down.

## Rules

- Mirror application feature names in test filenames.
- Use `*.test.ts` for Vitest tests and `*.spec.ts` for Playwright E2E tests.
- Never include real token values, real customer information, or actual delivery credentials.
- Any change to pricing, stock, order status, payment handling, or supplier client needs a matching test update.

# Tests

## Layout

- `unit/` — pure domain logic: money, price, stock, parsers, state transitions
- `integration/` — money-flow tests against a real throwaway local Postgres (`arena_store_test`): wallet top-up review, bot purchase, API order fulfillment, catalog sync
- `e2e/` — admin dashboard and customer journey flows (Playwright; Phase 2, currently no specs)
- `fixtures/` — synthetic catalog/order/payment fixture builders (`seed.ts`)
- `mocks/` — upstream XPro Partner API mock payloads (`upstream.ts`)
- `setup/` — vitest test environment (`test-env.ts`), integration DB bootstrap (`integration-global-setup.ts`), safety guard (`integration-safety.ts`), in-memory Redis fake (`in-memory-redis.ts`)

## Running

```bash
pnpm test                      # unit + integration
pnpm test:unit                 # unit only — no Postgres required
pnpm test:integration          # integration only
```

Integration tests automatically use a local PostgreSQL if one is reachable (e.g. `docker compose up -d postgres`); if none is running, a user-space embedded instance (Postgres 17 via `embedded-postgres`) is started from `tests/.pgdata` (gitignored) — no Docker or system install required. No Redis is needed (in-memory fake).

## Integration test safety model

- Every test file rebuilds a pristine `arena_store_test` database (DROP + CREATE + migrations) — the development/production database is never touched.
- `tests/setup/integration-safety.ts` refuses to run unless `DATABASE_URL` points at a local database named `*_test`, `UPSTREAM_BASE_URL` points at localhost, and no upstream API key is present.
- The vitest config injects all safe env values (empty upstream keys, unroutable `http://127.0.0.1:9` upstream URL, empty Telegram token, test-only encryption keys) before any app module import, so the developer's `.env` can never leak into a test run.
- `apps/api/src/services/order.service.ts` carries an additional runtime guard that refuses to place an upstream order from a test environment with a non-local upstream URL (mirrors the bot-side guard).
- Redis is replaced by an in-memory fake (`setup/in-memory-redis.ts`); the upstream supplier and Telegram are always mocked.

## Browser coverage (Phase 2, planned)

Playwright configuration exists (`playwright.config.ts`, production admin build on port 3100) but no specs are written yet. Planned: admin login, products table rendering, deposit slip review.

## Rules

- Mirror application feature names in test filenames.
- Use `*.test.ts` for Vitest tests and `*.spec.ts` for Playwright E2E tests.
- Never include real token values, real customer information, or actual delivery credentials.
- Any change to pricing, stock, order status, payment handling, or supplier client needs a matching test update.

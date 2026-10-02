# 08 — Testing Architecture

## Status

Current as of 2026-10-02 (Memory daily log entry 8). This is the single source of truth for how tests are structured, run, and kept safe in this repository. Read this before adding or changing tests, money logic, or the upstream integration.

## 1. Layout

```text
tests/
├── vitest.config.ts              # Two Vitest projects: "unit" and "integration"
├── playwright.config.ts          # Admin E2E (Phase 2 — configured, no specs yet)
├── setup/
│   ├── test-env.ts               # Non-secret test constants + TEST_ENV / UNIT_ENV maps
│   ├── integration-safety.ts     # Per-file guard: refuses unsafe test environments
│   ├── integration-bootstrap.ts  # Per-file: ensure local Postgres + migrate + truncate
│   └── in-memory-redis.ts        # ioredis fake (auth sessions + rate-limit Lua commands)
├── fixtures/
│   └── seed.ts                   # Synthetic builders (catalog, customer+wallet, top-up)
├── mocks/
│   └── upstream.ts               # XPro Partner API payload factories ({pe:...} included)
├── unit/                         # 12 files — pure domain logic, NO database (memory fallback)
├── integration/                  # 4 files — real Postgres money-flow tests
└── e2e/                          # empty — Playwright specs planned (Phase 2)
```

## 2. How to run

| Command | What it runs | Needs |
|---|---|---|
| `pnpm test` | unit + integration (this is what CI runs) | local Postgres (auto-provisioned) |
| `pnpm test:unit` | unit project only | nothing |
| `pnpm test:integration` | integration project only | local Postgres (auto-provisioned) |
| `pnpm test:ui` | Playwright (no specs yet — Phase 2) | production admin build on port 3100 |

Integration tests automatically use a local PostgreSQL if reachable (e.g. `docker compose up -d postgres`). If none is running, a user-space **Postgres 17** cluster is initialised in `tests/.pgdata` (gitignored) from the `@embedded-postgres/linux-x64` binaries and started **detached via `pg_ctl`** — no Docker, no root, no system install. The whole suite shares one server across worker processes.

## 3. Environment model (why tests can never leak secrets)

All env values are injected by `tests/vitest.config.ts` via the project `env` option, which runs BEFORE any application module is imported. The dotenv loaders in `apps/api/src/config.ts` and `apps/bot/src/config.ts` never override already-set variables, so the developer's real `.env` is permanently shadowed.

| Variable | Unit project | Integration project | Reason |
|---|---|---|---|
| `NODE_ENV` | `test` | `test` | activates bot-side upstream skip guard |
| `DATABASE_URL` / `DIRECT_URL` | **empty** | `postgres://postgres:postgres@127.0.0.1:5432/arena_store_test` | unit = deterministic in-memory fallbacks; integration = real throwaway DB |
| `UPSTREAM_BASE_URL` | `http://127.0.0.1:9` (unroutable) | same | any accidental real upstream call fails instantly |
| `UPSTREAM_API_KEY` + `UPSTREAM_PARTNER_API_KEY` | empty | empty | both variants must be cleared (API config falls back between them) |
| `TELEGRAM_BOT_TOKEN` | empty | empty | notifier no-ops; bot config injects a mock token in test mode |
| `CATALOG_SYNC_INTERVAL_MINUTES` | `0` | `0` | the automatic catalog sync scheduler must never run inside tests (server.ts also double-guards on `NODE_ENV !== "test"`) |
| `DELIVERY_ENCRYPTION_KEY` | test-only key | test-only key | deliveries encrypt/decrypt with a known synthetic key |
| `ADMIN_SESSION_SECRET`, `ADMIN_API_KEY`, `ADMIN_EMAIL`, `ADMIN_INITIAL_PASSWORD` | test values | test values | login tests are deterministic regardless of developer `.env` |
| `LOG_LEVEL` | `silent` | `silent` | keeps Fastify output quiet |

Key insight to preserve: **empty-string env values are the mechanism** that blocks dotenv fallbacks — never replace them with "unset".

## 4. Safety model (3 layers)

1. **Env hardening** (config level) — see table above.
2. **`tests/setup/integration-safety.ts`** (runs before every integration file) — refuses to run unless: DB host is `localhost`/`127.0.0.1`/`::1` AND database name ends with `_test`; `UPSTREAM_BASE_URL` points at localhost; no upstream API key present. Verified: a Supabase-style `TEST_DATABASE_URL` is refused.
3. **`assertUpstreamSafeForTests()` in `apps/api/src/services/order.service.ts`** (runtime) — refuses to place an upstream order from a test environment with a non-local `UPSTREAM_BASE_URL` (mirrors the bot-side guard in `apps/bot/src/services/order.service.ts:520`).

Additional natural guards: the API Telegram notifier no-ops without `TELEGRAM_BOT_TOKEN`; bot `purchaseWithWallet` skips the upstream call when `NODE_ENV=test` and no upstream key.

## 5. Test database lifecycle

`tests/setup/integration-bootstrap.ts` runs before EVERY integration test file (top-level await):

1. `canReachLocalPostgres()` — connect to the admin `postgres` database (1.5 s timeout).
2. If unreachable → acquire a **filesystem lock** (`tests/.pgdata.lock`, `O_EXCL`, stale locks > 120 s broken) because Vitest workers may overlap; inside the lock: initialise cluster if `PG_VERSION` missing (initdb with password file, cleaned up after), start detached with `pg_ctl -o "-p 5432 -k /tmp"`, kill stale processes matched ONLY by our exact data-dir path if the port stays busy, then `CREATE DATABASE arena_store_test` if missing.
3. `runMigrations()` from `packages/db` (idempotent — drizzle tracks applied migrations).
4. `TRUNCATE TABLE <all public tables> RESTART IDENTITY CASCADE` — every test file starts from a clean, fully migrated schema.

Deliberate choices to remember:
- **TRUNCATE instead of DROP/CREATE DATABASE**: database-level drop/create raced against a previous worker's server that was still shutting down; truncate inside the DB is immune to that.
- **Detached `pg_ctl` instead of the `embedded-postgres` library start**: the library kills its server when the spawning process exits, which killed the DB mid-suite when workers recycled. `pg_ctl`-started servers survive worker exits.
- **Per-process unique fixtures**: `tests/fixtures/seed.ts` derives slugs, `upstreamProductId`s, and telegramIds from per-process randomness, so overlapping workers sharing one DB cannot collide on unique columns.

Reset everything (last resort):
```bash
pkill -f "tests/.pgdata"      # stop the embedded cluster
rm -rf tests/.pgdata tests/.pgdata.lock
```

## 6. Mocking patterns (use these, do not invent new ones)

- **Upstream XPro client**: literal `vi.mock("../../apps/api/src/services/xpro-client", factory)` at module top level of the test file, with a `vi.hoisted(() => ({...}))` state object mutated per test (see `tests/integration/api-order-fulfillment.integration.test.ts`). The mock must export `xproClient` plus inert classes for every value-imported symbol (`XProApiError`, `XProProduct`, `XProCategory`, `XProCreateOrderResponse`). Resolved-path matching means this one mock covers `catalogService`, `orderService`, and route modules alike.
- **Redis**: `vi.mock("../../apps/api/src/services/redis", () => ({ getRedis: () => h.redis }))` with `h.redis = new InMemoryRedis()` set in `beforeAll` — `vi.hoisted` is required because the mock factory runs before top-level statements.
- **Upstream payloads**: build with `tests/mocks/upstream.ts` factories; never hardcode payloads inline in tests.
- **DB data**: build with `tests/fixtures/seed.ts` builders (`seedCatalog`, `seedCustomer`, `seedTopUpRequest`, `syntheticTelegramId`); telegramIds always come from the synthetic 99-prefix range.
- Existing **unit** tests use manual `global.fetch` stubs and a proven `vi.mock` of `@arena/db`'s `getDb` — keep those untouched.

## 7. Coverage map (what the integration suite pins down)

| File | Tests | Money invariants asserted |
|---|---|---|
| `wallet-topup.integration.test.ts` | 5 | approve → wallet credited exactly (integer MMK) + `TOPUP_CREDIT` ledger row referencing the top-up + status COMPLETED; reject → no credit, no ledger; double-approve → 400 "already COMPLETED"; 404 unknown deposit; 401 without admin session |
| `bot-purchase.integration.test.ts` | 3 | happy path: debit = 3,900 Ks exactly, `ORDER_DEBIT` ledger negative entry, order DELIVERED, encrypted delivery round-trips via test key and never stores plaintext; INSUFFICIENT_FUNDS stores nothing; OUT_OF_STOCK leaves wallet untouched |
| `api-order-fulfillment.integration.test.ts` | 5 | PENDING_PAYMENT + 15-minute reservation + item snapshot; approve → upstream purchase receives the internal `externalOrderId` (idempotency key), AES-256-GCM payload stored then decryptable, reservation released, submission VERIFIED, `APPROVE_AND_DELIVER` audit row; double-fulfill refused; upstream failure → order FAILED with no delivery stored; reject → CANCELLED + REJECTED + reservation released |
| `catalog-sync.integration.test.ts` | 3 | `syncFullCatalog` batch upserts; `{pe:...}` placeholders preserved in `name`/`descriptionMmk`/snapshots; slug sanitized + `iconEmoji` extracted; retail 0.69 USD → 4,000 Ks at rate 4500 + 25 % margin; idempotent re-sync (no duplicates); admin customizations (`isActive=false`, custom `retailPriceMmk`) survive re-sync while supplier fields refresh |

The bot fallback product contract used by `bot-purchase` test: bot catalog serves product **id 10, 3,900 Ks, stock 50, "Gemini AI 18 MONTH"** in test mode — the test seeds a matching products row (id 10) to satisfy the `order_items` FK.

## 8. Rules for future tests

1. Integration tests import app code via relative paths (`../../apps/...`), DB via `@arena/db`; never use real secrets, real customer data, or real delivery content.
2. New integration tests go in `tests/integration/*.integration.test.ts`; they get a fresh-truncated DB per file automatically — do not write your own truncate/cleanup for shared tables, and do not depend on data from other files.
3. Any new upstream call path (like a new XPro endpoint used for money) must be reachable in tests only through the mocked module or localhost — extend the safety guard if a new dangerous external call is added.
4. Any change to pricing, stock, order status, payment handling, or the supplier client needs a matching test update (also in `tests/README.md`).
5. Money assertions use exact integer equality — never `toBeCloseTo`.

## 9. Known gaps & follow-ups (open decisions)

- `OrderService.approvePaymentAndFulfill` / `rejectPayment` are **not mounted on any HTTP route** (service-level only) — decide: wire to admin routes or remove (Phase 5 decision).
- Refund (`POST /api/admin/orders/:id/refund`) and balance-adjust routes perform wallet update + ledger insert + order update as **separate awaits** despite "atomically" comments — money-safety gap; wrap in `db.transaction`.
- Bot-side `approveTopUp` credits wallets **without** a `wallet_ledger` entry (admin review route does write one) — ledger invariant differs per path.
- Playwright admin E2E specs = Phase 2 (config exists; `tests/README.md` lists planned specs).
- `OrderService.getUserProfile` hardcodes `walletBalanceMmk: 0` (API side only).

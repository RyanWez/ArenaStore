# 09 — Pending Work (မမေ့သင့်တဲ့ လုပ်စရာစာရင်း)

> **RULE / စည်းမျဉ်း:** Whenever anyone asks "လုပ်စရာ ရှိသေးလား?" (anything left to do?),
> **the two sections below — Financial Audit Logs and Minor Security Polish — must be
> mentioned first**, before anything else. Created 2026-10-03 at the owner's request.
>
> **Status update 2026-10-04:** Financial Audit Logs is essentially DONE (RBAC commit
> wired `writeAudit` into every money/admin action — see §1). Minor Security Polish is
> DONE except #9 (Render env check, owner) and #10 (blocked on supplier) — see §2.
> Remaining truly-open items live in the "Related smaller leftovers" list (all
> nice-to-have). UptimeRobot now pings /health every 5 min (free-tier spin-down solved).
>
> Items already done (as of 2026-10-03): all Critical/High security fixes, dependency
> CVE bumps, wallet atomicity everywhere, TOTP 2FA on admin login, performance work
> (N+1 fixes, reservation purge, supervisor, .dockerignore). See git log for details.

---

## 1. Financial Audit Logs (audit trail for money actions)

**Why:** wallet credits, debits, refunds and credential deliveries are money. Right now
there is no durable record of *which admin approved what, when, for which customer*.

**✅ RESOLVED 2026-10-04 (mostly by the RBAC commit 8be2c2b):** `writeAudit` now runs for
supplier sync, product/category updates, deposit approve+reject (both panel and Telegram
paths via `deposit-review.service.ts`), order refund, resend, settings/recalculate changes,
balance adjustments, staff/role changes and customer status/delete — ~15 call sites across
`admin.ts`, `admin-users.ts` and `deposit-review.service.ts`. The helper never throws, so a
failed audit write can never fail the money mutation. History of the original finding:
- `auditLogs` was (2026-10-03) written ONLY by the customer deactivate / restore / delete flow
  (`apps/api/src/routes/admin.ts` — 3 inserts around lines 1673/1721/1798).
- The following money actions write **no** `auditLogs` row:
  - Deposit approve / reject — `POST /api/admin/deposits/:id/review` (admin.ts, review transaction ~line 639)
  - Refund — order refund flow in admin.ts (~line 880-940)
  - Resend credentials (admin.ts ~line 941-1008 area)
  - Adjust balance — `POST /api/admin/customers/:id/adjust-balance` (admin.ts ~line 1486+;
    it writes a `walletLedger` row of type `ADMIN_ADJUSTMENT`, but that is not an audit log —
    it has no actor/subject context beyond the note field)
- `payment_submissions.reviewed_by` is never populated by the active deposit review flow
  (NOTE: `topup_requests.reviewed_by`/`reviewed_at` ARE now populated by the review flow — done 2026-10-04;
  the legacy `payment_submissions` table remains unused).

**Fix approach:**
1. ✅ Done — every money action writes an `auditLogs` row (see RESOLVED note above). Rows are
   written immediately after each mutation via the never-throw helper rather than inside the
   wallet transaction itself; ledger rows remain the transactional record of record.
2. ✅ Done 2026-10-04 for the active flow: `topup_requests.reviewedBy` + `reviewedAt` are set
   inside the guarded review transaction (`POST /api/admin/deposits/:id/review` and the bot
   endpoint share `reviewDeposit`). The legacy `payment_submissions` table stays unused.
3. (Open, optional) Extend the admin list endpoints to join audit rows (an "activity" view).

**Tests:** extend `tests/integration/wallet-topup.integration.test.ts` and
`tests/integration/api-order-fulfillment.integration.test.ts` (or admin-order-actions unit
tests) to assert the audit row exists after each money action, with the acting admin's id.

---

## 2. Minor Security Polish (small fixes, each < ~30 min)

| # | Item | Where | Fix |
|---|------|-------|-----|
| 1 | ✅ DONE 2026-10-04 — Sentry sends local error context that may contain customer PII | `apps/api/src/instrument.ts`, `apps/bot/src/instrument.ts` | `beforeSend` drops `event.request` and redacts values under PII-shaped keys (telegram/username/phone/email/password/token/secret/authorization/cookie) in extra/contexts/breadcrumbs |
| 2 | ✅ DONE 2026-10-04 — `GET /health` returned raw DB error text | `apps/api/src/routes/health.ts` | Response now carries a generic `error` marker; detail logged server-side only (`health-route.test.ts` asserts no leak) |
| 3 | ✅ DONE 2026-10-04 — Admin session cookie lacked the `secure` flag | `apps/admin/composables/useAuth.ts` | `secure: import.meta.env.PROD` — on for built deploys, off for `nuxt dev` on localhost |
| 4 | ✅ DONE 2026-10-04 — Dead secrets invited confusion | `config.ts`, `.env.example`, `docker-compose.yml` | `ADMIN_API_KEY` (read+guarded but used by no route) and `TELEGRAM_SECRET_TOKEN` (never read; bot uses long polling) removed everywhere |
| 5 | ✅ DONE 2026-10-04 — Public profile endpoint exposed spending stats | `apps/api/src/routes/orders.ts` | `GET /api/users/:telegramId/profile` deleted (no consumer — the bot reads the DB directly via its own `getUserProfile`); unused API service method removed too |
| 6 | ✅ DONE 2026-10-04 — Order rate-limit key trusted `body.telegramId` alone | `apps/api/src/routes/orders.ts` | Bucket is now `order_${req.ip}_${tgId}` — a spoofed id can no longer mint fresh buckets (`rate-limit.test.ts` mirrors it) |
| 7 | ✅ DONE 2026-10-04 — `ADMIN_INITIAL_PASSWORD` default had no production guard | `apps/api/src/config.ts` | Throws at boot in production when equal to `ArenaAdmin2026!`, matching the sibling guards. NOTE: Render env must carry a custom ADMIN_INITIAL_PASSWORD or the deploy boot-loops |
| 8 | ✅ DONE 2026-10-04 — Dashboard `pendingOrders` always counted 0 | `apps/api/src/routes/admin.ts` | Counts the real in-flight statuses `PENDING_PAYMENT`/`PAYMENT_SUBMITTED`; pendingDeposits now counts both reviewable statuses (`SUBMITTED`+`PENDING`) |
| 9 | OPEN (owner action) — Verify `REDIS_URL` in production uses `rediss://` (TLS) — code sets no TLS option; it relies entirely on the URL scheme | Render env; `apps/api/src/services/redis.ts` | Check the Render dashboard value; if plain `redis://`, switch to `rediss://` |
| 10 | OPEN (blocked on supplier) — Supplier API key + order traffic travel over plaintext HTTP (`http://paid2.daki.cc:4153/...`) | `apps/api/src/config.ts` (`UPSTREAM_BASE_URL` default), `.env` | Request HTTPS from the supplier (or IP-allowlist), then rotate the key. Blocked on the supplier, not on us |

---

## Related smaller leftovers (mention only if asked for the FULL list)

- Admin customer-detail page does per-order queries inside a loop (N+1): `apps/api/src/routes/admin.ts` ~1350-1399 (compare: the orders list endpoint is properly batched with `inArray`).
- Price recalculation updates products one-by-one: admin.ts ~1098-1117 (could be one CASE-based UPDATE).
- Bot middleware runs 3-5 DB roundtrips per message (user upsert + suspension guard): could be merged (`apps/bot/src/bot.ts:58-100`).
- Unbounded growth: `wallet_ledger` / `audit_logs` have no retention pruning (fine for now; revisit if storage becomes a concern on Neon free tier).
- E2E suite has only one spec (`tests/e2e/deposits-review.spec.ts`); login-2FA flow has no e2e coverage.
- Infra is configured only in dashboards (no `render.yaml` / `vercel.json`) — not reproducible from the repo.

---

## Done & verified on 2026-10-04: deposit review from the admin Telegram group

- Extracted the deposit review implementation from the admin route into
  `apps/api/src/services/deposit-review.service.ts` (`reviewDeposit`), shared by
  `POST /api/admin/deposits/:id/review` (panel, thin wrapper now) and the new
  internal endpoint `POST /api/bot/deposits/:id/review`
  (`apps/api/src/routes/bot.ts`, auth: `x-internal-token` vs `INTERNAL_API_TOKEN`,
  timing-safe). The guarded-claim race fix from earlier is preserved verbatim.
- Relayed slips in the admin group now carry ✅/❌ inline buttons
  (`apps/bot/src/services/admin-group.service.ts`). Callbacks are handled BEFORE
  the private-chat-only guard (`apps/bot/src/handlers/admin-deposit-review.ts`);
  session/user-sync/channel-verification are bypassed so admins are not
  auto-created as customers. Reject is a two-step confirm (it notifies the
  customer). On approve/reject the slip message is re-rendered via
  `editMessageCaption` with a short outcome line ("✅ @admin က အတည်ပြုပြီး") and
  the keyboard is removed, so nobody can click a stale button; 409 responses
  re-render the same settled state.
- Bot→API calls go through `apps/bot/src/services/deposit-review.client.ts`
  (typed results, 10s timeout, 1 retry). TELEGRAM actors are recorded in the
  audit details; `reviewed_by` stays NULL (FK is to staff users).
- Env: `INTERNAL_API_TOKEN` (api + bot, .env.example + docker-compose). Deploy
  order matters: API first, then bot.
- Tests: `tests/unit/deposit-review-caption.test.ts` (9) and
  `tests/integration/bot-deposit-review.integration.test.ts` (6: auth 401,
  approve+credit with TELEGRAM actor, double-review 409 without double credit,
  reject, 404, validation). Full suite 27 files / 204 tests green; api+bot
  tsc clean.

---

## Done & verified on 2026-10-03 (for context — do not re-report)

- Critical: `/deposit` command removed (dashboard-only crediting), `view_order` ownership
  check, slip-image / telegram-file / `GET /api/orders/:id` locked down, secrets rotation
  (bot token revoked, admin password rotated), TOTP 2FA enrolled via `pnpm totp:enroll`.
- High: drizzle-orm 0.45.3 / fastify 5.12.5 / nuxt 3.21.11 (CVEs), trustProxy, CORS
  allowlist, atomic wallet updates on ALL paths (bot purchase, deposit approval, refund,
  adjust-balance).
- Performance: catalog N+1 → grouped aggregate, by-id product endpoint, count(*) profiles,
  expired reservation purge, bullmq removed, process supervisor + fault handlers,
  `.dockerignore`.

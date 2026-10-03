# 09 — Pending Work (မမေ့သင့်တဲ့ လုပ်စရာစာရင်း)

> **RULE / စည်းမျဉ်း:** Whenever anyone asks "လုပ်စရာ ရှိသေးလား?" (anything left to do?),
> **the two sections below — Financial Audit Logs and Minor Security Polish — must be
> mentioned first**, before anything else. Created 2026-10-03 at the owner's request.
>
> Items already done (as of 2026-10-03): all Critical/High security fixes, dependency
> CVE bumps, wallet atomicity everywhere, TOTP 2FA on admin login, performance work
> (N+1 fixes, reservation purge, supervisor, .dockerignore). See git log for details.

---

## 1. Financial Audit Logs (audit trail for money actions)

**Why:** wallet credits, debits, refunds and credential deliveries are money. Right now
there is no durable record of *which admin approved what, when, for which customer*.

**Current state (verified 2026-10-03):**
- `auditLogs` is written ONLY by the customer deactivate / restore / delete flow
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
1. Inside the SAME transaction as each wallet mutation, insert an `auditLogs` row:
   action (`DEPOSIT_APPROVED`, `DEPOSIT_REJECTED`, `ORDER_REFUNDED`, `CREDENTIALS_RESENT`,
   `BALANCE_ADJUSTED`), acting admin id, target customer/order id, amount, reference.
2. Populate `payment_submissions.reviewed_by` (and `reviewed_at`) on deposit review.
   ✅ Done 2026-10-04 for the active flow: `topup_requests.reviewedBy` + `reviewedAt` are set
   inside the guarded review transaction (`POST /api/admin/deposits/:id/review`).
3. Extend the admin list endpoints to join audit rows (optional, for an "activity" view).

**Tests:** extend `tests/integration/wallet-topup.integration.test.ts` and
`tests/integration/api-order-fulfillment.integration.test.ts` (or admin-order-actions unit
tests) to assert the audit row exists after each money action, with the acting admin's id.

---

## 2. Minor Security Polish (small fixes, each < ~30 min)

| # | Item | Where | Fix |
|---|------|-------|-----|
| 1 | Sentry sends local error context that may contain customer PII (names, telegram ids) | `apps/api/src/instrument.ts`, `apps/bot/src/instrument.ts` | Add a `beforeSend` hook that drops `request` data and redacts PII-shaped strings |
| 2 | `GET /health` returns raw DB error text (can leak host/credential fragments on DB failure) | `apps/api/src/routes/health.ts` (~lines 24-26, 47) | Return a generic message; log the detail server-side only |
| 3 | Admin session cookie lacks the `secure` flag | `apps/admin/composables/useAuth.ts` (`useCookie('arena_admin_token', ...)`) | Set `secure: true` in production (conditionally — `secure` cookies are not sent over plain http on some browsers; keep it off for `localhost` dev) |
| 4 | Dead secrets invite confusion: `ADMIN_API_KEY` is read + guarded but used by no route; `TELEGRAM_SECRET_TOKEN` exists in env files but is never read (bot uses long polling, not webhooks) | `apps/api/src/config.ts:31`, `.env.example:5` | Remove both, or implement their intended feature |
| 5 | Public `GET /api/users/:telegramId/profile` exposes `totalSpentMmk` / `ordersCount` for any Telegram id without auth | `apps/api/src/routes/orders.ts:93-103` | Restrict to bot-internal calls (shared secret header) or delete the endpoint if unused |
| 6 | Order-creation rate-limit key trusts `body.telegramId` (spoofable → fresh bucket per fake id; can pin 15-min stock reservations on arbitrary users) | `apps/api/src/routes/orders.ts` (keyGenerator ~line 15-17) | Combine IP + telegramId in the key: `order_${req.ip}_${tgId}` |
| 7 | `ADMIN_INITIAL_PASSWORD` still defaults to `ArenaAdmin2026!` and has **no** production guard (the other defaults do throw in production) | `apps/api/src/config.ts:20` + guard block `:81-97` | Add a production guard that throws when it equals the default (password was rotated manually on Render, but the guard prevents regressions) |
| 8 | Dashboard status drift: `pendingOrders` counts statuses `'PENDING'` / `'PROCESSING'` which never occur → metric is always 0 (real values: `PENDING_PAYMENT`, `PROCESSING_SUPPLIER`, …). Top-up status values also mix conventions | `apps/api/src/routes/admin.ts:170` (verified), schema comments in `packages/db/src/schema/topups.ts:16` | Align counted status values with the actual `OrderStatus` enum / top-up statuses |
| 9 | Verify `REDIS_URL` in production uses `rediss://` (TLS) — code sets no TLS option; it relies entirely on the URL scheme | Render env; `apps/api/src/services/redis.ts` | Check the Render dashboard value; if plain `redis://`, switch to `rediss://` |
| 10 | Supplier API key + order traffic travel over plaintext HTTP (`http://paid2.daki.cc:4153/...`) | `apps/api/src/config.ts` (`UPSTREAM_BASE_URL` default), `.env` | Bigger than "minor": request HTTPS from the supplier (or IP-allowlist), then rotate the key. Blocked on the supplier, not on us |

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

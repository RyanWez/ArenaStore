# 2026-10-11 — MMPay Integration Fix Plan

> Source: full code review of branch `feat/mmpay-integration` (commits `901224d`,
> `fcfb43f` + 1 uncommitted change in `apps/bot/src/formatters/messages.ts`).
> Status: **PLAN — awaiting owner approval before any code change.**
> Verdict: happy path works, but there is **1 production-breaking webhook bug**,
> **1 financial-risk (unpaid order approvable)**, and **1 status-vocabulary mismatch**
> that make the feature "barely working", not production-ready.

## Portal / Env config verification (from owner screenshot)

- Webhook path `/api/webhooks/mmpay` matches the registered route
  (`apps/api/src/routes/mmpay.ts:135`). **Correct.**
- Sandbox `pk_test_...` vs production `pk_live_...` are correctly distinguished by
  `MmpayService.isSandbox` (checks for `_test_`). **Correct.**
- Production (`arena.ryanwez.com`) enforces webhook signature verification, so Finding
  #1 (raw-body signature) is a hard go-live blocker. Signature is the ONLY production
  gate (IP whitelist is left optional per MMPay docs).
- `PUBLIC_API_URL` must be set to `https://arena.ryanwez.com` in production and added to
  `.env.example` (currently referenced in `mmpay.ts:230` but undocumented).

---

## Findings (11)

### #1 — Webhook signature verified over re-serialized body, not raw bytes  [SEVERITY: HIGH / BLOCKER]
- Where: `apps/api/src/routes/mmpay.ts:36`, `apps/api/src/services/mmpay.service.ts:109-125`;
  no raw-body capture anywhere in `apps/api` (no `fastify-raw-body` / `addContentTypeParser`).
- Problem: `payloadString = JSON.stringify(request.body)` re-serializes the Fastify-parsed
  body. MMPay signs the exact raw bytes it sent. Key order / whitespace / number format /
  unicode escaping can differ, so HMAC will not match. Signature is enforced only when
  `NODE_ENV === "production"`, so this passes in dev and fails in production: legit webhooks
  get 401, the gateway shows the payment as paid, but the customer wallet is never credited.
- Fix: capture the raw request body (register `fastify-raw-body`, or a content-type parser
  that stores `request.rawBody`) and compute/verify the HMAC over that exact raw string.
  Add an HTTP-level test (fastify `inject`) that posts a signed body end-to-end.

### #2 — Unpaid PENDING MMQR is manually approvable and counted as a pending deposit  [SEVERITY: HIGH / FINANCIAL]
- Where: MMQR rows created with `status "PENDING"` (`mmpay.ts:217-224`); reviewable set
  includes PENDING (`deposit-review.service.ts:59,185`); admin stats count PENDING
  (`admin.ts:276`); deposits list has no default status filter (`admin.ts:896`).
- Problem: a QR that the customer has NOT paid yet (PENDING, no slip) appears in the admin
  deposit review list and in the pending badge. An admin clicking Approve credits the wallet
  for money that was never received.
- Fix: exclude MMPAY-method deposits from manual review (webhook is the only approver), or
  restrict manual review to `SUBMITTED` only. Do not count PENDING MMPAY toward reviewable
  deposits. Decide and apply consistently across review guard + stats + list.

### #3 — Status vocabulary mismatch: "COMPLETED" vs "APPROVED"  [SEVERITY: HIGH / CORRECTNESS]
- Where: approval sets `status "COMPLETED"` (`deposit-review.service.ts:211`); bot status
  check compares against `"APPROVED"` (`apps/bot/src/bot.ts:934`); webhook idempotency guard
  compares against `"APPROVED"` (`mmpay.ts:84`).
- Problem: after a real successful payment the status is COMPLETED, so the bot's
  "Check Payment Status" button never matches and falls into the final else branch telling
  the user "payment still pending" even though the wallet was already credited. The webhook
  idempotency guard is dead code (never true); double-credit is prevented only by
  `reviewDeposit`'s own status guard, which is fragile.
- Fix: align on a single success status. Make the bot status check and webhook guard accept
  the actual approved status ("COMPLETED"). Ideally centralize statuses (see #9) so this
  cannot drift again.

### #4 — MMQR reference generator reuses the known collision-prone pattern  [SEVERITY: MEDIUM]
- Where: `mmpay.ts:211` — `MMQR-${Date.now().slice(-6)}-${4-digit random}`.
- Problem: this is exactly the pattern deliberately removed for `TOP-` references
  (`apps/bot/src/services/order.service.ts:88-106`): last-6 timestamp wraps and the 4-digit
  random is weak. `reference` is a UNIQUE column, so a collision throws on insert → 500.
- Fix: use `crypto.randomBytes(4)` style like `generateTopUpReference()` /
  `generateOrderReference()`.

### #5 — Webhook does not validate amount or currency  [SEVERITY: MEDIUM]
- Where: `mmpay.ts:83-105` credits `topUp.amountMmk`, ignoring `payload.amount` and
  `payload.currency`.
- Problem: no defense against a mismatched/partial amount or non-MMK currency. Dynamic QR is
  fixed-amount so this is usually fine, but there is no assertion.
- Fix: assert `payload.currency === "MMK"` and `payload.amount === topUp.amountMmk`
  (or `>=`), log + reject the webhook on mismatch.

### #6 — Non-production signature bypass + catch-all `POST /` route  [SEVERITY: MEDIUM / SECURITY]
- Where: `mmpay.ts:45` (bypass when not production), `mmpay.ts:135-138` (routes incl.
  `POST /`, `POST /webhook`).
- Problem: in any non-production deployment, anyone who can reach the endpoint can forge a
  SUCCESS webhook and credit a wallet. Risky if staging shares production-like data. The
  `POST /` catch-all also shadows the API root.
- Fix: drop the `POST /` and `POST /webhook` aliases (keep `/api/webhooks/mmpay`). Keep the
  dev bypass only behind an explicit opt-in flag, and still require a signature when a secret
  key is configured regardless of NODE_ENV.

### #7 — "Single active order" check is not atomic (TOCTOU)  [SEVERITY: MEDIUM]
- Where: `mmpay.ts:172-226` check-then-insert with no lock/unique constraint.
- Problem: two concurrent create requests both pass the existing-active check, both insert,
  both call the gateway → duplicate PENDING MMQR orders. Bot-side `activeTopUpLocks` is
  in-memory and single-instance only.
- Fix: guard with a partial unique index (one PENDING MMPAY per user) or a per-user advisory
  lock around the check+insert, mirroring the wallet-debit advisory lock pattern already used
  in `order.service.ts`.

### #8 — Uncommitted messages.ts change breaks the unit test + MMPay attribution  [SEVERITY: MEDIUM]
- Where: uncommitted diff in `apps/bot/src/formatters/messages.ts` removed the
  "⚡️ PAYMENT POWERED BY MYANMYANPAY" block from `formatMmpayQrInvoiceMessage`.
- Problem: `tests/unit/mmpay.test.ts:90` asserts the caption contains
  "PAYMENT POWERED BY MYANMYANPAY", so `pnpm test` now fails. Removing the attribution from
  the caption may also violate MMPay branding requirements (it still exists only inside the
  QR card image).
- Fix: decide to keep or drop the attribution. If dropped, update the test and confirm MMPay
  branding compliance (card-image attribution is sufficient). If kept, revert the change.

### #9 — Status type drift; no central TopUpStatus enum  [SEVERITY: LOW]
- Where: `apps/bot/src/services/order.service.ts:77-86` (`TopUpRecord.paymentMethod` lacks
  MMPAY; status union lacks COMPLETED/FAILED/EXPIRED). Statuses are scattered string literals
  (FAILED/EXPIRED/CANCELLED/COMPLETED/APPROVED) with no enum.
- Problem: this drift is the root cause of #3 and will keep recurring.
- Fix: add a `TopUpStatus` enum in `packages/shared/src/enums.ts` and reference it everywhere
  (webhook writes, bot checks, admin stats). Fix the `TopUpRecord` types.

### #10 — qr.service polish  [SEVERITY: LOW]
- Where: `apps/bot/src/services/qr.service.ts:42` comment says "Level M" but code (line 46)
  uses `errorCorrectionLevel: "H"`; `getLogoPath()` runs `fs.existsSync` on every call.
- Fix: correct the comment; resolve+cache the logo path once at module load.

### #11 — Cross-flow interference between KPAY and MMPAY pending orders  [SEVERITY: LOW]
- Where: `order.service.ts:466-472` (KPAY `createTopUpRequest` cancels ALL PENDING incl. an
  active MMPAY); MMPAY create only expires MMPAY PENDING (`mmpay.ts:197-208`).
- Problem: mixing the two payment paths can silently cancel each other's active order.
- Fix: scope each flow's auto-cancel/expire to its own `paymentMethod`.

---

## Phased execution plan (await owner approval per phase)

### Phase 1 — Production blockers (MUST fix before go-live)  ✅ DONE 2026-10-11
- #1 raw-body webhook signature verification (+ end-to-end signed-body test)
- #3 align success status so the bot "Check Status" button and webhook guard work
- #2 stop unpaid PENDING MMQR from being manually approvable / counted
- Verify: `pnpm test` green; signed webhook inject test passes; unpaid PENDING not in review.

**Implementation notes (Phase 1):**
- New `apps/api/src/plugins/raw-body.ts` (`registerRawJsonBodyParser`), wired into
  `mmpayRoutes`; webhook now HMACs `request.rawBody` instead of `JSON.stringify(request.body)`.
- Webhook idempotency guard + bot `mmpay_check` now accept `"COMPLETED"` (the real approved
  status) as well as `"APPROVED"`.
- `reviewDeposit` gained `viaGatewayWebhook`; a human approving a PENDING `MMPAY` deposit now
  returns `code: "MMPAY_AUTO_ONLY"` (handled in `admin.ts` + `bot.ts` as 409). The MMPay
  webhook passes `viaGatewayWebhook: true` so it can still credit a PENDING request.
- Dashboard pending-deposit count (`admin.ts`) excludes PENDING MMPay (counts SUBMITTED +
  non-MMPay PENDING).
- Tests: 2 new raw-body unit tests in `tests/unit/mmpay.test.ts`; new
  `tests/integration/mmpay-webhook.integration.test.ts` (SUCCESS credit, idempotency, 404,
  manual-review block). API+bot typecheck clean; unit 267/268 (the 1 failure is the
  pre-existing #8 attribution assertion from the uncommitted messages.ts edit), integration
  41/41.

### Phase 2 — Correctness & financial hardening  ✅ DONE 2026-10-11
- #5 validate amount + currency in webhook
- #6 remove `POST /` + `POST /webhook` aliases; gate dev bypass behind explicit flag
- #4 collision-safe MMQR reference generator
- Verify: forged/mismatched webhook rejected; reference uniqueness under load.

**Implementation notes (Phase 2):**
- #5: webhook SUCCESS now rejects (400, no credit, stays PENDING) when
  `payload.currency` is not MMK or `payload.amount !== topUp.amountMmk`.
- #6: dropped the `POST /` and `POST /webhook` catch-all routes (kept
  `/api/webhooks/mmpay` + `/webhooks/mmpay`). Signature is now enforced whenever
  `MMPAY_SECRET_KEY` is configured — every environment, not just production — so
  the old `NODE_ENV === "production"` bypass is gone. A local/dev/test instance
  with no secret still skips the check. Test env now clears `MMPAY_*` in
  `tests/setup/test-env.ts` so the developer's real .env secret cannot bleed in.
- #4: `MMQR-` reference now uses base36 timestamp + `crypto.randomBytes(4)` hex
  (same scheme as the bot's TOP-/ARN- generators), replacing the collision-prone
  `Date.now().slice(-6)` + 4 random digits.
- Tests: added amount-mismatch, currency-mismatch and catch-all-removed cases to
  `tests/integration/mmpay-webhook.integration.test.ts`. API typecheck clean;
  full suite 312/313 (the 1 failure is the #8 caption attribution assertion,
  deferred to Phase 3 per owner).

### Phase 3 — Robustness  ✅ DONE 2026-10-11
- #7 atomic single-active-order (partial unique index or advisory lock)
- #11 scope auto-cancel/expire per payment method
- #8 resolve attribution + fix/keep the unit test
- Verify: concurrent create yields one order; cross-flow no longer cancels MMQR.

**Implementation notes (Phase 3):**
- #7: new migration `0011_add_mmpay_single_active_order.sql` + schema partial
  unique index `uq_topups_user_active_mmpay` on `(user_id)` WHERE
  `payment_method='MMPAY' AND status='PENDING'` (one active MMQR per user,
  DB-enforced). The migration first expires any pre-existing duplicates. The
  create route now catches the unique violation (23505): returns the existing
  QR if ready, else 409 "being prepared, retry".
- #11: the manual (KPAY) `createTopUpRequest` auto-cancel is now scoped with
  `ne(paymentMethod,'MMPAY')`, so starting a manual top-up no longer cancels an
  active MMQR (which has its own cancel/expire path).
- #8: owner's decision — attribution removed from the caption text, kept on the
  QR card image. Updated the formatter doc comment and realigned the stale unit
  assertions (`tests/unit/mmpay.test.ts`) to the current concise caption
  (MMK/no-USD, 15-min notice, reference, KPay/WavePay) and asserted the caption
  no longer contains the uppercase attribution.
- Tests: added single-active-order integration cases (duplicate rejected 23505;
  fresh order allowed after the previous is terminal). DB + API + bot typecheck
  clean; full suite **315/315 green**.

### Phase 4 — Type safety & polish  ✅ DONE 2026-10-11
- #9 central `TopUpStatus` enum + fix `TopUpRecord` types
- #10 qr.service comment + cached logo path
- Also: add `PUBLIC_API_URL` to `.env.example`.
- Verify: typecheck clean; QR still scans.

**Implementation notes (Phase 4):**
- #9: added `TopUpStatus` enum to `packages/shared/src/enums.ts`
  (PENDING/SUBMITTED/COMPLETED/APPROVED/REJECTED/CANCELLED/FAILED/EXPIRED).
  `TopUpRecord` (order.service) now types `status: TopUpStatus` and
  `paymentMethod` includes MMPAY. The #3-prone comparison sites now reference the
  enum: bot `mmpay_check` (COMPLETED/APPROVED/EXPIRED/CANCELLED) and the webhook
  already-credited guard (COMPLETED/APPROVED).
- #10: `qr.service` resolves the logo path once at module load (`LOGO_PATH`)
  instead of `fs.existsSync` on every render; corrected the stale "Level M"
  comment to match the actual Level 'H' error correction.
- `.env.example`: documented `PUBLIC_API_URL` (used to build the webhook
  callback URL) under the MMPay section.
- Verify: shared/API/bot typecheck clean; full suite **315/315 green**.

---

## Status: all four phases complete (2026-10-11)

---

## Phase 5 — MMQR order-UX cleanup  ✅ DONE 2026-10-11

Found during live sandbox testing: after a successful MMQR payment the customer
saw **two** success messages (the generic deposit-approved notice from the
webhook + the MMQR-specific one shown only after a manual "Refresh"), and the
live QR invoice (with Refresh/Cancel buttons) lingered until the user refreshed.

Root cause: the bot never persisted the QR photo's Telegram message id, so the
webhook couldn't touch that message — it only pushed a separate generic text
notification, and the QR was cleaned up only by the manual Refresh handler.

Fixes:
- Migration `0012` + schema: new `mmpay_qr_message_id` column.
- Bot persists the QR photo's message id on send/re-show
  (`order.service.attachMmpayQrMessage`, wired into `mmpay_pay` / `mmpay_show`).
- API `telegram-notifier`: new `deleteTelegramMessage` + `notifyMmpayTopUpSuccess`
  (deletes the live QR invoice, posts one MMQR success card).
- `reviewDeposit` gained `notifyCustomer` / `notifyGroup` flags.
- Webhook SUCCESS: credits via `reviewDeposit` with both notifications off, then
  fire-and-forget `notifyMmpayTopUpSuccess` (fast-ack — the gateway response is
  no longer blocked on Telegram latency). Returns 500 if the credit genuinely
  failed so MyanMyanPay retries.
- Bot `mmpay_check` COMPLETED branch no longer re-sends a full success card
  (that was the duplicate); it just acknowledges + clears its own view. The
  webhook owns the single success message.

Result: payment → QR invoice auto-removed + exactly one success card, no manual
Refresh, no duplicate. Full suite 315/315 green. Migrations `0011`+`0012`
applied to the Neon dev DB.

### Deploy checklist (production)
- Run `pnpm --filter @arena/db db:migrate` (applies `0011`+`0012`).
- Set `PUBLIC_API_URL=https://arena.ryanwez.com`, ensure `MMPAY_SECRET_KEY` set
  (webhook signature enforced whenever present).
- Point the MMPay portal webhook at `<PUBLIC_API_URL>/api/webhooks/mmpay`.

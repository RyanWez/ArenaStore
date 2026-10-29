# Arena Store — Phase 3 Execution Plan: Wallet Checkout & Dual Top-Up Engine

Detailed operational breakdown of Phase 3 from `02_IMPLEMENTATION_ROADMAP.md` into three
sequenced sub-phases (3A → 3B → 3C). Written 2026-10-25; grounded in the current code state.

## 0. Ground Rules (inherited from roadmap + AGENT.md)

- **Zero-breakage guarantee:** `apps/bot` and `apps/admin` must stay fully functional; the full
  Vitest suite (47 files / 401+ tests at last count) stays green after every sub-phase.
- **Zero new money logic:** every money mutation goes through existing `@arena/core`
  (`botOrderService`) methods, which already implement the advisory lock, guarded conditional
  debit, paired atomic `wallet_ledger` insert, and auto-refund compensation.
- **Authentication contract:** all new routes reuse the existing store session mechanism —
  `extractStoreToken()` (Bearer header or `arena_store_session` cookie) →
  `storeAuthService.getCustomerSession(token)` → `getOrCreateUser()` → `status === "ACTIVE"`
  guard. This guard block currently lives inline in `GET /auth/me`
  (`apps/api/src/routes/store/auth.ts:515+`); extract it once into a shared `requireStoreSession`
  preHandler and reuse it on every new route so 401/403 semantics stay identical.
- **New routes register in `apps/api/src/server.ts`** alongside `storeAuthRoutes` (line ~114).

---

## Sub-Phase 3A — Store Orders API + 1-Click Wallet Purchase

### Backend (`apps/api/src/routes/store/orders.ts` — new file)

| Route | Core method to reuse | Notes |
|---|---|---|
| `POST /api/store/orders` `{ productId, quantity }` | `botOrderService.purchaseWithWallet` (`packages/core/src/services/order.service.ts:975`) | Returns `{ success, orderId, publicOrderNo, totalMmk, credentialsText, remainingBalance, error }`. Map core errors to typed HTTP responses: `INSUFFICIENT_FUNDS` → 402 + `{ deficitMmk }`, `OPERATION_IN_PROGRESS` → 409, `OUT_OF_STOCK` → 409, upstream failure → 502 (funds already auto-refunded by core). Rate limit ~10/min per session. |
| `GET /api/store/orders` | `botOrderService.getUserOrders(telegramId)` (`:1575`) | Ownership implicit via session telegramId. |
| `GET /api/store/orders/:id/credentials` | `botOrderService.getOrderById(orderId, requesterTelegramId)` (`:1614`) | 404 for non-owner (do not leak existence); DELIVERED-only; decrypt via existing core AES-256-GCM util in memory; never log plaintext. This endpoint is also consumed by Phase 4's vault UI. |

- **Session guard:** extract `requireStoreSession` preHandler (see ground rules) into
  `apps/api/src/routes/store/session-guard.ts` (or shared module) and register on all three routes.
- **Input validation:** strict fastify schema — `productId` positive int, `quantity` int 1..max
  (reuse existing sale-limit constants), `orderId` format-validated.
- **Decision point D1 — web purchase DM receipt:** `purchaseWithWallet` takes an optional
  `botApi` used to send the Telegram DM receipt. Options:
  (a) API sends the receipt itself via a direct Bot API `sendMessage` using `TELEGRAM_BOT_TOKEN`
  (already in API env for initData HMAC) — recommended, keeps purchase response time independent
  of the bot process;
  (b) skip DM receipt for web orders in 3A and add later.
  Confirm with owner before implementing.

### Frontend (`apps/web`)

1. **`components/purchase/BuyBottomSheet.vue`** (new): product plan summary, quantity stepper,
   integer-MMK line totals (no float math — mirror bot calculation), live wallet balance line,
   primary CTA. In-flight guard prevents double-submit (core also dedupes via `activePurchases`).
2. **Wire `pages/index.vue` `handleBuyProduct`** (currently `console.log` only, lines 55–60):
   logged-out → open `AuthChallengeModal` (existing); logged-in → open `BuyBottomSheet`.
3. **Success path:** subtle success animation → credentials panel from the POST response
   (`credentialsText`) with 1-click copy → link to `/orders`.
4. **`INSUFFICIENT_FUNDS` path (Smart Deficit Shortcut shell):** show exact
   `totalMmk - balanceMmk` with pre-filled top-up CTA. Full behavior lands in 3C once the
   top-up modal exists; in 3A the CTA can open the (disabled-until-3B) placeholder state —
   per AGENT.md interaction rules, do not ship a dead control: gate the CTA to a visible
   "coming in next update" state or ship 3A+3B together.
5. **`composables/useStoreOrders.ts`** (new): fetch orders, loading/empty/error states.
6. **`pages/orders.vue`:** replace the placeholder card with the live orders list (status pills).

### Acceptance — 3A
- [ ] Sufficient balance: buy → credentials visible in < 3s.
- [ ] Insufficient balance: deficit shown is exactly `totalMmk - balanceMmk` (integer kyats).
- [ ] Double-click safe (single request; second click visibly disabled while settling).
- [ ] Non-owner `GET /orders/:id/credentials` → 404; non-DELIVERED → 409.
- [ ] `tests/integration/store-orders.integration.test.ts`: happy path (upstream mocked),
  insufficient funds, ownership, replay/dedupe, suspended-account 403.

---

## Sub-Phase 3B — Wallet API + MMQR Realtime Invoice Modal

### Backend (`apps/api/src/routes/store/wallet.ts` — new file)

| Route | Implementation | Notes |
|---|---|---|
| `GET /api/store/wallet` | from `getOrCreateUser()` wallet row | balance, totalSpent, memberSince; also powers profile card sub-stats (fixes the "Top Ups 1+/0" fudge). |
| `GET /api/store/wallet/ledger` | **new core query** `getWalletLedger(telegramId, { limit, before? })` | `walletLedger` is currently write-only in core; add a simple indexed select (id desc cursor pagination). |
| `POST /api/store/wallet/topup/mmqr` `{ amountMmk }` | reuse `botOrderService.createMmpayTopUp` (`order.service.ts:614`) | **Decision point D2:** that method self-calls `POST /api/payments/mmpay/create` over HTTP with `x-internal-token` (built for the bot process). For the API's own store routes, extract the create/status logic out of `apps/api/src/routes/mmpay.ts` into a shared service so bot and web share one code path without a self-HTTP hop. Single-active-invoice + 15-min expiry + amount rules must remain identical. |
| `GET /api/store/wallet/topup/mmqr/status/:ref` | reuse `checkMmpayStatus(reference)` (`:716`; same D2 note) | Returns PENDING/PAID/EXPIRED + credited amount. Rate limit ~20/min. |

- The MMPay webhook `/api/webhooks/mmpay` and the global reconcile scheduler already credit
  wallets for both bot and web — no change.
- Amount validation: integer MMK, min/max identical to the bot's existing top-up rules
  (reuse the same constants, do not fork them).

### Frontend (`apps/web`)

1. **`components/wallet/MmqrInvoiceModal.vue`** (new): QR rendered client-side from `qr` string
   (flat SVG renderer — `qrcode` lib; zero gradients per design system), circular SVG countdown
   ring from `expiresAt` (15:00, `stroke-dashoffset` per second), poll status every 3s,
   on `PAID`: success state + `useStoreAuth.refreshMe()` wallet ticker update + auto-close.
   All motion respects `prefers-reduced-motion`.
2. **Top-up amount entry:** preset chips + custom input, integer MMK validation.
3. **Wire the existing dead controls:** `WalletBalanceCard` "+ Top Up (MMQR)" button and
   profile `handleTopup` → open the modal (removes today's `console.log` dead ends).
4. **Wallet number ticker:** rolling-digit transition on balance change.

### Acceptance — 3B
- [ ] Countdown decrements accurately every second; modal auto-closes on payment success.
- [ ] Wallet balance updates without page refresh after webhook credit.
- [ ] Single active invoice enforced across bot + web (shared core lock — verify with a
      cross-path integration test).
- [ ] `tests/integration/store-wallet.integration.test.ts`: mmqr create (returns qr/expiresAt),
      status transitions, ledger pagination, amount validation rejections; MMPay provider mocked.

---

## Sub-Phase 3C — Smart Deficit Shortcut + Manual Slip Upload

### Backend

1. **`POST /api/store/wallet/topup/slip`** (multipart, in `store/wallet.ts`):
   - Validate mime (jpeg/png/webp) + size cap (align with the existing bot slip limits).
   - **New upload ingest:** the existing `attachTopUpSlip` (`order.service.ts:805`) is
     Telegram-`fileId`-oriented and cannot accept an HTTP buffer. New path: API uploads the
     buffer to the Admin Group via direct Bot API `sendPhoto` (multipart) using
     `TELEGRAM_BOT_TOKEN`, with the SAME caption format (`TOP-XXXXXX`, amount, provider,
     customer) and the SAME inline ✅/❌ keyboard the bot path uses, and creates the
     `topup_requests` row (`SUBMITTED`).
   - Review flows through the existing `reviewDeposit` service (panel + Telegram group buttons)
     — zero new money logic; the 409 double-review guard already protects both paths.
2. **SSE/poll for approval:** optional — minimum viable is balance refresh on next `fetchMe()`;
   a small `topup_requests` status poll in the pending sheet is a nice-to-have.

### Frontend

1. **`components/wallet/SlipUploadSheet.vue`** (new): drag-drop + file picker, image preview,
   amount + provider (KPay/WavePay) fields, submit multipart, "စစ်ဆေးနေဆဲ" pending state.
2. **Top-up entry unification:** one sheet with two tabs — `MMQR` (3B modal) and `Slip`
   (3C sheet); the Smart Deficit Shortcut from 3A deep-links into it with the deficit amount
   pre-filled and returns to the pending purchase after a successful MMQR top-up.

### Acceptance — 3C
- [ ] Slip lands in the admin Telegram group with identical ✅/❌ review buttons; approve
      credits the wallet; web balance reflects it.
- [ ] Web and bot review paths converge on `reviewDeposit` (no double credit).
- [ ] `tests/integration/store-topup-slip.integration.test.ts`: upload validation (mime/size),
      relay mocked, review convergence, ownership.

---

## Cross-cutting checklist (every sub-phase)

- `pnpm lint` 0 errors; workspace `tsc --noEmit` clean; full Vitest suite green.
- New routes: rate limits, strict input schemas, typed error codes — mirror the hardening
  pattern already used in `store/auth.ts`.
- No secrets or plaintext credentials in logs; credentials reveal only over an authenticated
  owner session.
- Append the daily `Memory/YYYY-MM-DD.md` entry after each sub-phase; update this file's
  checkboxes as items complete.

## Sequencing

3A → 3B strictly ordered (deficit shortcut needs the top-up modal to target); 3C depends on 3B's
sheet shell. 3A is the largest chunk (API + purchase funnel + orders page binding).

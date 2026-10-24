# Arena Store — Web Storefront Implementation Roadmap

## 1. Overview & Phasing Principles

This roadmap provides the operational blueprint for implementing the **Arena Store Web Storefront** (`apps/web` at `arena.ryanwez.com`). 

### Core Engineering Directives
- **Zero-Breakage Guarantee:** The existing Telegram bot (`apps/bot`) and administrative dashboard (`apps/admin`) must remain fully functional throughout every phase.
- **Continuous Verification:** The entire test suite (currently 45 test files, 379 passing tests) must pass with 100% green status after every phase.
- **Incremental Value Delivery:** Each phase delivers a standalone, independently testable milestone.

---

## 2. Phase-by-Phase Execution Plan

```
[Phase 0: Shared Core Engine Extraction] 
  └── Extract order/catalog/referral services from apps/bot into packages/core
  └── Verify all 379 existing Vitest suites remain green

[Phase 1: Store Backend API & 4-Digit Bot Auth]
  └── Build /api/store/auth/* endpoints in Fastify
  └── Implement /start login_<ticketId> & matching keyboard in apps/bot
  └── Implement Telegram Mini App initData HMAC-SHA256 validator

[Phase 2: Nuxt 4 Storefront & Design System Foundation]
  └── Initialize apps/web (Nuxt 4 + Tailwind CSS)
  └── Implement 2026 Flat Monolithic Design System (Signal Orange #FF5A1F)
  └── Build Mobile 2-Col Bento, Frosted Bottom Bar, and 3D Hero Card Deck

[Phase 3: Wallet Checkout & Dual Top-Up Engine]
  └── Connect 1-Click purchaseWithWallet & Smart Deficit Calculator
  └── Build MMQR Realtime Invoice Modal with countdown ring
  └── Build Drag-and-Drop Manual Slip Upload Module

[Phase 4: Customer Dashboard & Credentials Vault]
  └── Implement Virtual Black Titanium Member Card (EMV Chip & TG Verified)
  └── Implement Recent Orders List with AES-256-GCM Eye Reveal Key
  └── Implement Referral Dashboard & Commission Statistics

[Phase 5: Mini App Integration, Deployment & QA]
  └── Configure Telegram WebApp SDK (haptic feedback, safe area insets)
  └── Route arena.ryanwez.com via Cloudflare Tunnel
  └── Execute End-to-End QA across Mobile Safari, Chrome, and Telegram App
```

---

### Phase 0: Shared Core Engine Extraction (`packages/core`)

#### Objectives
Eliminate architectural boundary violations and duplicate business logic by creating a dedicated `@arena/core` workspace package.

#### Tasks
1. **Package Initialization:**
   - Create `packages/core/package.json`, `tsconfig.json`, and `src/index.ts`.
   - Register dependencies on `@arena/db`, `@arena/shared`, `@arena/suppliers`, and `drizzle-orm`.
   - Add `@arena/core` to `pnpm-workspace.yaml`.
2. **Service Relocation:**
   - Move `BotOrderService` from `apps/bot/src/services/order.service.ts` to `packages/core/src/services/order.service.ts`.
   - Move `BotCatalogService` from `apps/bot/src/services/catalog.service.ts` to `packages/core/src/services/catalog.service.ts`.
   - Move `ReferralService` from `apps/bot/src/services/referral.service.ts` to `packages/core/src/services/referral.service.ts`.
3. **Decouple App-Specific Configs:**
   - Refactor hardcoded `botConfig` dependencies to accept options injection or shared environment contracts.
4. **Update Consumers:**
   - Update `apps/bot` imports to consume from `@arena/core`.
   - Re-export services so existing unit and integration tests find their targets without breakage.

#### Acceptance Criteria
- [x] `packages/core` builds cleanly with `tsc --noEmit`.
- [x] `pnpm test` runs all 45 test files and 379 tests with 0 failures.
- [x] Telegram bot starts and handles `/start`, catalog browsing, and wallet balance checks identically.

---

### Phase 1: Store Backend API & 4-Digit Bot Handshake Auth

#### Objectives
Establish the complete customer-facing API surface in `apps/api` and implement the W3K-style challenge-response login mechanism.

#### Tasks
1. **Challenge Ticket & Session Engine:**
   - Implement `auth.store.service.ts` using Redis:
     - `createTicket(ip, userAgent)`: Generates 4-digit code (e.g. `3717`) and stores ticket with 300s TTL.
     - `confirmTicket(ticketId, telegramId)`: Validates code match and transitions state to `CONFIRMED`.
     - `createSession(telegramId)`: Issues cryptographically signed session token.
2. **Fastify Route Registration (`apps/api/src/routes/store`):**
   - `POST /api/store/auth/ticket`: Issues new challenge ticket.
   - `GET /api/store/auth/events/:ticketId`: Server-Sent Events stream for instant login notification.
   - `POST /api/store/auth/telegram-webapp`: Validates `Telegram.WebApp.initData` HMAC-SHA256 signature for zero-click login.
   - `GET /api/store/auth/me`: Returns active session profile.
   - `POST /api/store/auth/session`: Sets HttpOnly session cookie from confirmed token/ticket.
   - `POST /api/store/auth/logout` & `POST /api/store/auth/logout-all`: Session termination.
3. **Bot Deep-Link & Keyboard Matching:**
   - In `apps/bot/src/bot.ts`, handle `/start login_<ticketId>`.
   - Fetch ticket from Redis, verify `PENDING` state, and generate 3 random distractors.
   - Send security alert DM displaying device metadata, client IP location, and a 2x2 inline keyboard.
   - On button click callback, compare chosen digit with correct ticket code.
   - If correct: transition ticket to `CONFIRMED`, edit message to success confirmation.
   - If cancel: invalidate ticket and edit message to cancelled.

#### Acceptance Criteria
- [x] Ticket lifecycle test: ticket creation -> bot match -> confirmation event verified via unit tests (`tests/unit/store-auth.test.ts`).
- [x] Mini App HMAC signature verification rejects tampered query strings, malformed hashes, and clock-drift anomalies.
- [x] Session cookie is generated with `httpOnly; Secure; SameSite=Lax` and full integration tests verified (`tests/integration/store-auth.integration.test.ts`).
- [x] Security Hardened: Single-use ticket consumption (`consumeTicket`) completely prevents ticket replay attacks.
- [x] Security Hardened: Route-level rate limiting on `POST /ticket` (15/min) and auth routes (30/min).
- [x] Security Hardened: Strict regex validation on `ticketId` (`^tk_[a-f0-9]{24}$`) and session tokens (`^[a-f0-9]{64}$`).
- [x] Security Hardened: Account status guards (`user.status === "ACTIVE"`) reject suspended/banned users with 403 `ACCOUNT_SUSPENDED`.
- [x] Performance Hardened: Multiplexed Redis pub/sub over a single shared subscriber eliminates socket leaks and Redis maxclients exhaustion across SSE streams.

---

### Phase 2: Nuxt 4 Storefront & Design System Foundation (`apps/web`)

#### Objectives
Build the modern, responsive storefront frontend matching the approved master designs. Broken down into 3 manageable, interconnected sub-phases:
- **Sub-Phase 2A:** Nuxt 4 Setup, 2026 Flat Monolithic Design System & Responsive App Shell (COMPLETED).
- **Sub-Phase 2B:** 3D Card Stack Hero Carousel, Category Scroll & Bento Product Grid (NEXT).
- **Sub-Phase 2C:** 4-Digit Challenge Modal & Live Realtime SSE Handshake Integration.

#### Tasks
1. **Sub-Phase 2A: Foundation & Responsive App Shell:**
   - [x] Initialize `apps/web` with Nuxt 4 compatibility (`Nuxt 3.21.11`), Vue 3, and Tailwind CSS.
   - [x] Configure `@arena/shared` workspace dependency and `"dev:web"` script.
   - [x] Configure 2026 Flat Monolithic design tokens (Dark `#08090B`, Signal Orange `#FF5A1F`, zero purple, zero gradients).
   - [x] Configure Nitro API proxy: `/api/**` -> `http://localhost:4000/api/**`.
   - [x] Implement reactive auth composable (`useStoreAuth.ts`) with Telegram Mini App auto-login.
   - [x] Build sticky Header (`TheHeader.vue`) with logo, JetBrains Mono wallet balance pill, and profile indicator.
   - [x] Build frosted bottom navigation bar (`TheBottomNav.vue`) with iOS safe-area padding and 4 tabs (`Home`, `Products`, `Orders`, `Profile`).
   - [x] Build default layout and live index landing page.

2. **Sub-Phase 2B: 3D Showcase & Bento Grid:**
   - [x] Build 3D card deck with CSS `perspective: 1200px` and `transform-style: preserve-3d` (Hero Carousel).
   - [x] Center stage ChatGPT Plus card with flanking Claude and Canva cards with touch swipe gesture support.
   - [x] Horizontal category momentum scrollbar (`All`, `AI`, `Design`, `Video`, `Productivity`, `VPN`).
   - [x] 2-Column Mobile & 4-Column Desktop Bento Product Grid with squircle icons, stock badges, and MMK pricing.
   - [x] Integrate live catalog data from Fastify API (`/api/catalog/categories` & `/api/catalog/products`) with SSR prefetching.

3. **Sub-Phase 2C: Auth Modal & SSE Realtime Handshake UI:**
   - [ ] W3K-style Login Modal: displays 4-digit code and direct Telegram bot deep link button.
   - [ ] SSE real-time listener binding with ticket confirmation events for zero-refresh login.
   - [ ] Instant wallet balance and profile sync.

#### Acceptance Criteria
- [x] Sub-Phase 2A: Nuxt builds cleanly (`pnpm --filter @arena/web build`), `pnpm lint` 0 errors, 47 test files (401 tests) passing.
- [x] Sub-Phase 2B: 3D Card Stack Carousel rotates smoothly, Category scrollbar filters products, Bento grid renders live catalog with SSR prefetching.
- [ ] Sub-Phase 2C: Full browser login cycle via 4-digit challenge code completes seamlessly in < 2 seconds.


---

### Phase 3: Wallet Checkout & Dual Top-Up Engine

#### Objectives
Enable customers to complete instant 1-click purchases using their wallet and fund their account via MMQR or manual slip upload.

#### Tasks
1. **Instant Wallet Purchase Flow:**
   - Implement Buy Bottom Sheet: displays product plan, quantity stepper, and wallet balance check.
   - If balance is sufficient: executes `POST /api/store/orders`. On success, plays subtle success animation and navigates to order details.
   - If balance is insufficient: triggers **Smart Deficit Shortcut** (e.g. `လိုအပ်သော ကျန်ငွေ ၃,၅၀၀ Ks ဖြည့်ရန်`) with 1-click pre-filled top-up transition.
2. **Realtime MMQR Invoice Modal:**
   - Calls `POST /api/store/wallet/topup/mmqr`.
   - Renders QR Code on-screen with SVG circular countdown ring (15-minute expiry).
   - Polls `GET /api/store/wallet/topup/mmqr/status/:ref` every 3 seconds.
   - Upon payment confirmation from MMPay webhook: triggers instant success sound/animation and updates wallet counter ticker.
3. **Manual Slip Upload Module:**
   - Drag-and-drop / file selector for KPay and WavePay screenshot slips.
   - Submits multipart form to `POST /api/store/wallet/topup/slip`.
   - Relays image to Telegram Admin Group for one-tap verification (`TOP-XXXXXX`).

#### Acceptance Criteria
- [ ] 1-Click Buy with sufficient balance delivers credentials immediately in `< 3s`.
- [ ] Deficit top-up correctly calculates exact difference (`totalMmk - balanceMmk`).
- [ ] MMQR countdown decrements accurately every second and auto-closes on payment success.

---

### Phase 4: Customer Dashboard & Credentials Vault

#### Objectives
Provide a comprehensive customer account management interface matching the approved dashboard designs.

#### Tasks
1. **Virtual Black Titanium Member Card:**
   - Render luxury matte card with embedded golden EMV chip, customer name, masked Telegram ID (`87•••••077`), and solid green `✓ TG VERIFIED` badge.
   - Emboss geometric Arena "A" logo watermark on the right wing.
2. **Wallet Balance Tile:**
   - Display live balance in `JetBrains Mono` with full-width Signal Orange `+ Top Up (MMQR)` action button.
   - Sub-stats: Total Top-Ups count, Total Spent MMK, Member Since date.
3. **Encrypted Credentials Vault:**
   - Recent Orders list with status badges (`DELIVERED` green pill, `PROCESSING` amber pill).
   - Implement **`👁️ Eye Reveal Key`** button:
     - Calls `GET /api/store/orders/:id/credentials`.
     - Displays decrypted username, password, or invite link in a modal with 1-click "Copy" button.
4. **Referral Rewards Widget:**
   - Display total referred friends count and lifetime 3% commissions earned.
   - 1-Click copy for customer's personalized invite links.

#### Acceptance Criteria
- [ ] Member card details render correctly from active session without layout overflow.
- [ ] Unauthenticated users or non-owners cannot access `/api/store/orders/:id/credentials`.
- [ ] Clipboard copy works seamlessly on both iOS Safari and Android Chrome.

---

### Phase 5: Mini App Integration, Deployment & QA

#### Objectives
Finalize Telegram Mini App mode, configure production routing via Cloudflare Tunnel, and execute comprehensive end-to-end testing.

#### Tasks
1. **Telegram WebApp SDK Configuration:**
   - Integrate `@telegram-apps/sdk-vue` or native `window.Telegram.WebApp`.
   - Configure `expand()` for full-height webview.
   - Bind native `HapticFeedback` to buttons and checkout actions.
   - Handle safe area insets to prevent UI overlap with Telegram's top bar and bottom close pill.
2. **Domain & Cloudflare Tunnel Setup:**
   - Route `arena.ryanwez.com` to local port `3002` (`apps/web`).
   - Configure HTTPS SSL termination and CORS policies in `apps/api`.
3. **End-to-End QA Checklist:**
   - Test Flow 1: New customer opens `arena.ryanwez.com` on PC -> logs in via 4-digit code -> tops up via MMQR -> purchases ChatGPT Plus -> reveals credentials.
   - Test Flow 2: Customer opens Bot -> taps Menu Button -> Mini App opens with instant auto-login -> purchases Canva Pro -> receives receipt in Bot DM.
   - Test Flow 3: Customer submits manual slip on Web -> Admin approves in Telegram Group -> Web balance updates automatically.

#### Acceptance Criteria
- [ ] Zero console errors or unhandled promise rejections across all pages.
- [ ] Lighthouse Performance score >= 90 on mobile.
- [ ] Full test suite (45 files, 379+ tests) passing 100% green.

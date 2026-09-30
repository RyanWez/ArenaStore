# 06 — Implementation Roadmap (Phases 1 to 5)

## Overview

This roadmap defines the structured, production-ready engineering plan for **Arena Store** — a Telegram storefront with Myanmar Kyat (MMK) customer pricing, an upstream USD supplier API integration (XPro Seller Partner API), and an admin dashboard built with Nuxt 3, Tailwind CSS, and PrimeVue.

```text
Phase 1: Shared Core & Database Foundation
   │
   ▼
Phase 2: Upstream Partner API Client & Backend Service (apps/api)
   │
   ▼
Phase 3: Admin Dashboard (apps/admin — Nuxt 3 + PrimeVue)
   │
   ▼
Phase 4: Customer Telegram Bot (apps/bot — grammY)
   │
   ▼
Phase 5: End-to-End Testing, Security Hardening & Deployment
```

---

## Phase 1: Shared Core & Database Foundation

### Objective
Establish the single source of truth for database models, domain validation, monetary calculations, and Telegram emoji formatting across all apps in the monorepo.

### Target Locations
- `packages/shared`
- `packages/db`

### Key Deliverables & Implementation Details
1. **Domain Models & Drizzle ORM Schema (`packages/db`):**
   - `users`: Telegram customers and admin staff (roles: `CUSTOMER`, `ADMIN`, `SUPPORT`).
   - `categories`: Arena Store categories (display name, slug, sort order, icon/emoji, active flag).
   - `products`: Sellable items linked to `upstreamProductId`, MMK retail price, local limit, manual pause flag.
   - `product_supplier_snapshots`: Read-only cache of upstream product data (USD price, live stock, delivery type).
   - `orders`: Order entity with unique `publicOrderNo` (e.g. `ARN-2026-XXXXX`), status, total MMK amount, and deterministic `externalOrderId`.
   - `order_items`: Order line items with snapshot of unit MMK price, unit USD cost, quantity.
   - `order_deliveries`: Encrypted storage of delivered credentials/links (`type: CREDENTIALS | LINK | FILE | TEXT`), delivered timestamp.
   - `payment_submissions`: Customer payment proof (payment method: `KPAY`, `WAVEPAY`, `CB_PAY`, `AYAPAY`, screenshot URL/file_id, transaction ID, status: `SUBMITTED`, `VERIFIED`, `REJECTED`).
   - `stock_reservations`: Time-limited stock holds (e.g. 15-minute reservation during payment submission).
   - `audit_logs`: Tracking sensitive admin actions (price modifications, manual delivery resends, payment approvals).

2. **Monetary & Pricing Engine (`packages/shared`):**
   - **Integer MMK Math:** All MMK stored and calculated in whole kyats without JavaScript float imprecision.
   - **USD Decimal Safety:** Safe string/micro-unit representations for upstream supplier prices.
   - **Pricing Formula:** `calculateRetailMmk(upstreamUsd, exchangeRate, markupPercentage, fixedFeeMmk)`.
   - **Sellable Stock Rule:** `customer_stock = min(supplier_stock, wallet_affordable_units, local_limit) - active_reservations`.

3. **Telegram Custom Emoji Formatter (`packages/shared`):**
   - Preserves raw supplier text `{pe:<numeric-id>}` in database.
   - Sanitizes and compiles to `<tg-emoji emoji-id="...">fallback</tg-emoji>` for Telegram HTML messages.

4. **Shared Zod Validation Schemas (`packages/shared`):**
   - Validation schemas for catalog filters, order placement, payment submission, and admin settings.

### Verification Gate for Phase 1
- Drizzle migrations run cleanly on local PostgreSQL instance.
- Unit tests verify 100% of money math, margin formulas, stock clamping, and emoji parser cases.

---

## Phase 2: Upstream Partner API Client & Core Backend Service

### Objective
Create the high-performance Fastify backend service that interfaces with the upstream XPro Partner API, orchestrates order lifecycles, and executes background fulfillment jobs.

### Target Locations
- `apps/api`

### Key Deliverables & Implementation Details
1. **Resilient Upstream XPro Client:**
   - Base URL: `http://paid2.daki.cc:4153/api/partner/v1`.
   - Endpoints integrated:
     - `GET /health` (connectivity check)
     - `GET /balance` (wallet balance check)
     - `GET /catalog/categories` & `GET /catalog/products` (catalog synchronization)
     - `POST /orders` (atomic upstream order with `productId`, `quantity`, `externalOrderId`)
     - `GET /orders/{id}` (delivery retrieval and verification)
   - Built-in circuit breaker, request timeout (10s), exponential backoff on 429 / 5xx, and rate limit tracker (60 req/min).

2. **Order Lifecycle State Machine:**
   ```text
   PENDING_PAYMENT ──► PAYMENT_SUBMITTED ──► PAYMENT_VERIFIED
                                                    │
                                                    ▼
   DELIVERED ◄── [AES-256 Encrypt] ◄── SUCCESSFUL_UPSTREAM_ORDER
        ▲
        └───── (Fallback: Manual Fulfillment by Admin if upstream OOS)
   ```

3. **Idempotency & Delivery Security:**
   - Every upstream purchase uses internal UUID formatted as `externalOrderId: "arn-<order_id>"`.
   - In case of network timeout, auto-retry with identical `externalOrderId` ensures zero double-billing.
   - Upstream delivery payload is encrypted using AES-256-GCM before saving into `order_deliveries`.

4. **BullMQ / Redis Asynchronous Queue:**
   - Background worker processes catalog sync (every 5-15 minutes).
   - Order fulfillment worker handles upstream order placement and notifies Telegram bot upon completion.

### Verification Gate for Phase 2
- Integration tests verify catalog sync, idempotency retry logic, and simulated delivery encryption/decryption using test fixtures.

---

## Phase 3: Admin Dashboard (Nuxt 3 + PrimeVue)

### Objective
Provide store operators with a modern, fast, and responsive management interface to oversee orders, review payment slips, set MMK prices, and monitor supplier status.

### Target Locations
- `apps/admin`

### Key Deliverables & Implementation Details
1. **Application Shell & Theming:**
   - Nuxt 3 with `@primevue/nuxt-module` and Aura dark-mode theme preset.
   - Tailwind CSS layout utilities.
   - Responsive Drawer sidebar navigation: Overview, Orders, Products, Categories, Payments, Customers, Supplier, Settings, Audit Logs.
   - Top navigation bar featuring real-time Supplier Wallet Balance indicator ($1.00 USD), quick alerts, and sync status.

2. **Products & Catalog Management Workspace (`/products`):**
   - PrimeVue `DataTable` with global search, category filtering, stock tags (In Stock, Low, Out of Stock), and sorting.
   - Dialog/Drawer for editing:
     - Base USD cost (read-only from supplier).
     - MMK retail price calculation with live profit margin preview.
     - Local maximum selling limit.
     - Product active / paused toggle switch with optimistic UI feedback.
   - Custom quantity presets preview.

3. **Payment Verification & Orders Workspace (`/payments`, `/orders`):**
   - Payment slips review drawer:
     - High-resolution preview of customer payment receipt (KPay / WavePay).
     - Transaction ID search and duplicate slip detection.
     - One-click **"Approve & Auto-Deliver"** button: transitions order status, triggers Phase 2 fulfillment worker, delivers accounts to bot.
     - **"Reject with Reason"** dialog: sends structured rejection message to customer bot.

4. **Supplier Status Workspace (`/supplier`):**
   - Upstream API health check card.
   - Balance, spend, and rate-limit consumption graphs/gauges.
   - Manual "Sync Catalog Now" trigger.

### Verification Gate for Phase 3
- Admin builds cleanly (`pnpm build`).
- Responsive verification on desktop and mobile viewports (data tables convert cleanly to mobile cards or responsive drawer).

---

## Phase 4: Customer Telegram Bot (grammY)

### Objective
Deliver a localized, intuitive, and high-conversion storefront bot for Myanmar customers with real-time catalog navigation, Burmese instructions, Prepaid Wallet Architecture, and instant digital goods delivery.

### Target Locations
- `apps/bot`

### Key Deliverables & Implementation Details
1. **Interactive Navigation Structure:**
   - 2x2 Grid + Navigation Layout:
     - Row 1: `[ 🛍 ပစ္စည်းများဝယ်ယူရန် ]` (Green Style) + `[ 👤 My Profile ]`
     - Row 2: `[ 💰 Wallet ]` + `[ 📦 ကျွန်ုပ်၏အော်ဒါများ ]`
     - Row 3: `[ 💬 Help & Support ]` + `[ 📢 Channel ]` (`@arenasellerstore`)
   - Programmatically registered commands: `/start` and `/menu`.
   - Testing/admin command: `/deposit <amount>`.

2. **Catalog & Product Browsing Flow:**
   - Dynamic 2-column inline keyboard for Categories with custom animated icons.
   - Products list with Option A MMK pricing format (`3,900 Ks`, `19,500 Ks`).
   - Product detail card with blockquote header, clean description, MMK price, stock, and interactive quantity controller:
     - Stepper: `[-] [Quantity] [+]`
     - Quick Presets: `[✅ 1] [5] [10] [20] [30] [50]`
     - Custom Quantity: `[🎉 Custom Quantity]` (parses natural numeric input).

3. **Prepaid Wallet Architecture (Recommendations A to D):**
   - **Recommendation A (Smart Top-Up Shortcut):** Exact deficit calculation on Buy Now when wallet balance is insufficient (`totalMmk - balanceMmk`), with direct 1-click deficit invoice button.
   - **Recommendation B (Wallet Dashboard & Quick Presets):** Displays live balance, total spent, and quick top-up preset buttons (`5,000`, `10,000`, `20,000`, `50,000 Ks`, and custom amount).
   - **Recommendation C (Deposit Slip Verification):** Generates payment invoice with KPay & WavePay phone numbers and reference (`TOP-XXXXXX`). Customer uploads screenshot slip in chat; bot acknowledges receipt immediately.
   - **Recommendation D (Instant 1-Click Purchase & Immediate Delivery):** When balance is sufficient, customer confirms purchase -> atomic wallet balance deduction -> **immediate delivery of digital credentials in chat within seconds (zero waiting time, no 15-minute stock hold).**
   - **My Orders Viewer:** Customers can view past orders (`/orders`) and retrieve accounts/keys anytime.

4. **Premium Custom Animated Emojis:**
   - Full set of 19 Telegram Premium animated custom emojis implemented across all message headers, bullet points, stats, warnings, and button labels. Raw Unicode emojis strictly disallowed.

5. **Smooth Bot UX & Performance Optimization Standards:**
   - **Zero-Wait Callback Acknowledgement:** Call `await ctx.answerCallbackQuery()` immediately on every button press to eliminate Telegram's circular loading spinner.
   - **In-Place Message Editing (No Chat Spam):** Update quantities, page numbers, and menus via `editMessageText` / `editMessageReplyMarkup` rather than posting new messages.
   - **Multi-Tap & Double-Submit Debouncing:** Session-level lock on order submission and payment receipt upload.
   - **In-Memory Catalog Cache:** Cache active category and product summaries with 5-minute TTL for sub-100ms keyboard navigation.

### Verification Gate for Phase 4 (COMPLETED ✅)
- 19 Telegram Premium Animated Custom Emojis active with `icon_custom_emoji_id` and `tgEmoji()`.
- Option A MMK retail pricing (`3,900 Ks`, `19,500 Ks`) implemented and verified.
- Interactive quantity controller (`[-] [1] [+]`, presets `[✅ 1] [5] [10] [20] [30] [50]`, `[🎉 Custom Quantity]`).
- Full Prepaid Wallet Architecture (Recommendations A to D) fully operational.
- Admin Dashboard updated with dedicated `Product Orders` and `Deposit Slips` workflows.
- Full unit test suite passing (62/62 tests passing in `pnpm test`).
- Live Telegram Bot `@arenastoredev_bot` active and listening in dev background process.

---

## Phase 5: End-to-End Testing, Security Hardening & Deployment Setup

### Objective
Validate full system integration across all apps, enforce strict security standards, and establish production-ready containerized deployment pipelines.

### Target Locations
- `tests/`
- `infrastructure/`

### Key Deliverables & Implementation Details
1. **End-to-End Automated Testing:**
   - Playwright E2E tests for Admin dashboard workflows.
   - Integration tests covering:
     - Bot creates order -> DB stores order & reservation.
     - Admin approves payment -> API triggers upstream order -> Delivery stored encrypted -> Bot receives delivery.
     - Upstream failure handling: Out-of-stock rollback, insufficient wallet balance alert to admin.

2. **Security Hardening:**
   - Verify zero API keys or secrets in client builds, git history, or client bundles.
   - API rate limiting (per-IP and per-telegram-user).
   - AES-256-GCM encryption verification for all stored delivery payloads.
   - SQL injection & XSS sanitization audit.

3. **Deployment Configuration:**
   - Dockerfile and Docker Compose configurations for:
     - `apps/api` (Fastify service)
     - `apps/bot` (grammY bot process with webhook or polling)
     - Redis & PostgreSQL container orchestration
   - Deployment configuration for `apps/admin` (Vercel or standalone Node / Nitro server).
   - Production `.env` guidelines and health-check alerts.

### Verification Gate for Phase 5
- Full test suite passes (`pnpm test`).
- Production build succeeds across all workspace apps (`pnpm build`).
- Zero unencrypted sensitive credentials in database.

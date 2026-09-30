# 00 — Architecture Overview

## Purpose

Arena Store is a Telegram-first storefront for digital products and AI software subscriptions in Myanmar. Customers browse products and pay in MMK; the backend fulfills orders through instant delivery using customer prepaid wallet funds and an upstream partner API priced in USD.

## System Architecture (Wallet-First Flow)

```text
Telegram Customer
      │ (1. Deposit KPay/WavePay Slip)
      ▼
┌──────────────┐      Approve Deposit (+MMK)     ┌──────────────┐
│  apps/bot    │ ◄────────────────────────────── │  apps/admin  │
│  (Storefront)│                                 │ (Admin Panel)│
└──────┬───────┘                                 └──────┬───────┘
       │ (2. Instant 1-Click Buy with Wallet)           │
       ▼                                                ▼
┌──────────────┐                                ┌──────────────┐
│  apps/api    │ ─────────────────────────────► │ PostgreSQL   │
│  (Backend)   │                                │ & Redis      │
└──────┬───────┘                                └──────────────┘
       │ (3. Upstream Fulfillment if needed)
       ▼
┌───────────────────────────┐
│ Upstream Partner API (USD)│
└───────────────────────────┘
```

## Workspace Boundaries

| Area | Responsibility | Status |
|---|---|:---:|
| `apps/bot` | Telegram bot storefront, 2x2 grid menus, animated custom emojis, Prepaid Wallet (A to D), instant credentials delivery | **Completed (Phase 4)** ✅ |
| `apps/admin` | Nuxt 3 dashboard, Product Orders fulfillment, Wallet Deposit Slips review, rates & margins | **Completed (Phase 3)** ✅ |
| `apps/api` | Fastify backend, upstream XPro client, encryption, order & deposit processing | **Completed (Phase 2)** ✅ |
| `packages/db` | Drizzle ORM schema, entities (users, products, orders, wallet, deposits) | **Completed (Phase 1)** ✅ |
| `packages/shared` | Shared types, BOT_EMOJIS (19 custom animated IDs), MMK money & retail calculators | **Completed** ✅ |
| `tests` | Vitest test suites (62/62 tests passing), unit & integration coverage | **Completed** ✅ |

## Core Architectural Decisions & Evolution

1. **Prepaid Wallet Architecture (Recommendations A to D):**
   - *Previous Approach:* Per-order payment slip with 15-minute stock hold.
   - *Current Reality:* Customers maintain a prepaid MMK wallet. Product purchases are **Instant 1-Click Buy** with atomic balance deduction and immediate credentials delivery (zero waiting time).
   - *Smart Deficit Shortcut:* If wallet balance is insufficient on Buy Now, bot calculates exact deficit (`deficitMmk = totalMmk - walletBalance`) and provides direct 1-click deficit invoice.
2. **Decoupled Admin Verification:**
   - Manual slip verification is strictly confined to **Wallet Top-Up / Deposits** (`TOP-XXXXXX`).
   - Digital product orders are automatically delivered and recorded as `DELIVERED` without requiring manual per-order verification.
3. **Telegram Premium Animated Custom Emojis:**
   - Full set of 19 animated custom emojis (`tgEmoji(BOT_EMOJIS.<NAME>)` and `icon_custom_emoji_id`) across all messages and buttons. Raw Unicode emojis strictly disallowed.
4. **Pricing Standard (Option A):**
   - Retail prices displayed as `<amount> Ks` (e.g. `3,900 Ks`, `19,500 Ks`) using English numerals and comma separation.
5. **Security & Privacy:**
   - Upstream supplier API key and USD supplier costs are never exposed to clients or Telegram users.
   - Delivery credentials (passwords, tokens, keys) are AES-256-GCM encrypted in database.

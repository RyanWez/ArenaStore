# 03 — UI / UX Specification

## Status

Implemented and active across both the **Nuxt 3 Admin Dashboard** (`apps/admin`) and the **Customer Telegram Bot** (`apps/bot`).

## Visual Direction & Core Aesthetics

- **Telegram Bot Experience:** Button-led, localized in Burmese, high-contrast dark aesthetic, powered by 19 Telegram Premium animated custom emojis.
- **Admin Dashboard:** Dark-mode SaaS aesthetic built with **Nuxt 3 + PrimeVue v4 (Aura preset) + Tailwind CSS**, zero-flicker transitions, and responsive layout.

---

## Customer Bot Architecture (Telegram Storefront)

### 1. Main Menu Layout (2x2 Grid + Navigation)

```text
Row 1: [ 🛍 ပစ္စည်းများဝယ်ယူရန် ] (Green Button)  |  [ 👤 My Profile ]
Row 2: [ 💰 Wallet ]                             |  [ 📦 ကျွန်ုပ်၏အော်ဒါများ ]
Row 3: [ 💬 Help & Support ]                     |  [ 📢 Channel ]
```
- Registered BotFather commands: `/start` and `/menu`.
- Testing/admin command: `/deposit <amount>`.
- Support link: Direct admin telegram handle.
- Channel link: `https://t.me/arenasellerstore`.

### 2. Catalog & Stepper Controls
- **Categories Grid:** 2-column inline keyboard with animated category icons.
- **Product List:** Option A pricing format (`3,900 Ks`, `19,500 Ks`).
- **Product Detail Card:** Expandable blockquote header, clean description, MMK price, stock availability, and interactive quantity controller:
  - Stepper: `[-] [Quantity] [+]`
  - Quick presets: `[✅ 1] [5] [10] [20] [30] [50]`
  - Custom quantity: `[🎉 Custom Quantity]` (parses natural numeric input from chat).

### 3. Prepaid Wallet Architecture (Recommendations A to D)
- **Recommendation A (Smart Top-Up Shortcut):** When customer clicks "Buy Now", if wallet balance is insufficient, the bot calculates exact deficit (`totalMmk - balanceMmk`) and provides a 1-click shortcut button: `[ 💳 <deficit> Ks အတိအကျ ငွေဖြည့်မည် ]`.
- **Recommendation B (Wallet Dashboard & Presets):** Displays live balance and total spent with quick preset buttons (`5,000`, `10,000`, `20,000`, `50,000 Ks`, plus Custom Amount).
- **Recommendation C (Deposit Slip Verification):** Generates payment invoice with KPay & WavePay phone numbers and unique reference (`TOP-XXXXXX`). Customer uploads screenshot slip in chat; bot acknowledges receipt immediately.
- **Recommendation D (Instant 1-Click Purchase & Immediate Delivery):** When balance is sufficient, user confirms purchase -> atomic wallet balance deduction -> **immediate delivery of digital credentials in chat within seconds (zero waiting time, no 15-minute stock hold).**
- **My Orders Viewer:** Customers can view past orders (`/orders`) and retrieve accounts/keys anytime.

---

## Admin Dashboard Architecture

### Orders & Payments Split
In the sidebar, `ORDERS & PAYMENTS` is decoupled into two specialized workflows:

1. **`💳 Deposit Slips` (`/payments`):**
   - Review KPay / WavePay screenshot receipts submitted by customers to top up their Wallet.
   - Shows active `Review` badge with count of pending slips.
   - Zoomable high-resolution screenshot modal.
   - 1-Click `Approve & Credit Wallet` button: automatically credits customer's wallet and triggers automated celebration notification to the customer on Telegram.
   - Reject modal with selectable reasons.
   - KPI metrics: Pending Deposits, Approved Today, and Auto Bot Crediting status.

2. **`🛍 Product Orders` (`/orders`):**
   - Displays all instant digital product purchases fulfilled via Wallet balance (`💰 Wallet Balance`).
   - Status: `DELIVERED` (Instant), `PROCESSING_SUPPLIER`, `CANCELLED`, `REFUNDED`.
   - Order Details Modal: view delivered account credentials (email, password, invite link, activation key) with one-click copy.
   - Action controls: `Re-send to Telegram` and `Refund to Wallet` (directly returns funds to user's wallet for customer service).
   - KPI metrics: Delivered Orders, Wallet Sales Revenue, and &lt; 1 sec fulfillment speed.

---

## Strict Rule: Premium Custom Animated Emojis

> [!IMPORTANT]
> **ALL customer-facing Telegram Bot messages, headers, bullet points, statistics, warnings, and button labels MUST strictly use Telegram Premium animated custom emojis.**
> - Use `tgEmoji(BOT_EMOJIS.<NAME>, '<fallback>')` or `<tg-emoji emoji-id="...">`.
> - Use `icon_custom_emoji_id: BOT_EMOJIS.<NAME>` on inline buttons.
> - **NEVER** leave raw Unicode emojis (`👤`, `💳`, `🛍`, `📦`, `💰`, `⚠️`, `✨`) in message templates.

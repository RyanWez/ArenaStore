# Arena Store - Project Knowledge & Rules

## 1. MyanMyanPay (MMPay / MMQR) Architecture
- **Server API Base URL**: Must always be `https://ezapi.myanmyanpay.com`. Do NOT use `bbapi.myanmyanpay.com` (which is client-side browser only and lacks backend `/payments/sandbox-handshake` routes).
- **Sandbox vs Production**: Test keys (`pk_test_`, `sk_test_`) use the `sandbox-` path segment (`/payments/sandbox-handshake`, `/payments/sandbox-create`, `/payments/sandbox-get`).
- **Signature & Nonce**: Signed via HMAC-SHA256 (`${nonce}.${bodyString}`) with secret key. Nonce generated during handshake must match the create call.
- **Webhook Callback**: Delivered to `<PUBLIC_API_URL>/api/webhooks/mmpay`. On local dev, runs over Cloudflare Tunnel (e.g. `https://arena-dev.ryanwez.com`).

## 2. MMQR Countdown Janitor & Throttling
- Located in [`apps/bot/src/services/mmpay-invoice-scheduler.ts`](file:///home/zixuan/Projects/ArenaStore/apps/bot/src/services/mmpay-invoice-scheduler.ts).
- Sweeps every 30s (`TICK_MS = 30 * 1000`).
- **Milestone Throttling**: Only edits the caption when remaining minutes match `COUNTDOWN_MILESTONES = [13, 10, 5, 3, 1]`. Skipped on all other minutes to reduce Telegram API calls by ~65% and prevent rate limiting.
- Deduplicated via in-memory `lastEditedMilestones` map (`lastEditedMilestones.set(row.reference, remainingMin)`).
- When remaining time reaches 0, the invoice is auto-expired, QR photo is deleted, and the expired notice card is sent.

## 3. Bot Customer Dashboard & UI Formatting
- `/start`, `menu_start`, and channel verification render a clean text dashboard without blockquote:
  ```text
  🛍️ Arena Store
  👤 အမည်: <Name>
  🆔 အကောင့် ID: <TelegramId>
  💳 လက်ကျန်ငွေ: <Balance> MMK

  အောက်ပါ ရွေးချယ်မှုများမှ စတင်ပါခင်ဗျာ။
  ```
- Formatter: `formatStartMessage({ name, telegramId, balanceMmk })` in [`apps/bot/src/formatters/messages.ts`](file:///home/zixuan/Projects/ArenaStore/apps/bot/src/formatters/messages.ts).

## 4. Custom Animated Emoji IDs ([`packages/shared/src/emoji.ts`](file:///home/zixuan/Projects/ArenaStore/packages/shared/src/emoji.ts))
- `STORE`: `"4958714256343171878"` (🛍️ Arena Store)
- `BAGS`: `"5983399041197675256"` (🛍️ Catalog)
- `ID`: `"5936017305585586269"` (🆔 Account ID)
- `WALLET`: `"5258204546391351475"` (💳 Wallet)
- `HOURGLASS`: `"5345809410939700735"` (⏳ Timer / Under Review)
- `CLOCK`: `"5348236797606379943"` (🕒 Time / Expiry)
- `LIGHTBULB`: `"5258216851472654189"` (💡 Tip / Guidance)
- `PRICE`: `"5967390100357648692"` (💵 Price / Deficit top-up)
- Emojis in HTML mode must use `tgEmoji(BOT_EMOJIS.<NAME>, "<fallback>")` which outputs `<tg-emoji emoji-id="...">fallback</tg-emoji>`.

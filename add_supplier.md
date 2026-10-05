# DigitalCore Supplier ထည့်သွင်းရေး — အသေးစိတ် Plan

> **Doc purpose:** အရင် Agent ရဲ့ Plan (Adapter Pattern, `varchar(100)`, Snapshot `supplier` field, Admin UI tabs) ဟာ လမ်းကျောင်းမှန်ပါတယ်။ ဒီ doc က ဒီ plan အပေါ် အခြေခံပြီး — (၁) codebase ကို တကယ် စစ်ဆေးပြီး တွေ့ရတဲ့ **blocking gaps**, (၂) DigitalCore docs (`digitalcore_api_docs.html`) ကနေ တွေ့ရတဲ့ **အရင် plan မခွဲခြမ်းရှာထားတဲ့ API ကန့်သတ်ချက်များ**, (၃) Phase အလိုက် အကောင်အထည်ဖော်ရမယ့် **file-level အသေးစိတ် plan** ကို ဖြည့်စွက်ထားတာပါ။
>
> **ပြင်ပ ပံ့ပိုးမှု အချက်အလက် အရင်းအမြစ်များ:** `xpro_partner_api_docs.txt` (ရှိပြီးသား), `digitalcore_api_docs.html` (repo root, untracked), code inspection (agent ၃ ဦး ဖြင့် cross-checked)။

---

## 1. အရင် Plan အပေါ် သဘောတူမှု (Confirmed Correct)

| အရင် Plan | အတည်ပြုချက် |
|---|---|
| Adapter Pattern / `ISupplierClient` | ✅ မှန်။ ဒါပေမယ့် **bot ထဲမှာ XPro client duplicate ဖြစ်နေတာ** (`apps/bot/src/services/xpro-order.ts` raw fetch + `apps/bot/src/services/catalog.service.ts` direct fetch) ကိုလည်း ပေါင်းရမယ် — အောက်မှာ ကြည့်ပါ။ |
| `upstreamProductId` → `varchar(100)` | ✅ လိုအပ်တယ်။ ဒါပေမယ့် **type ပြောင်းတာတစ်ခုတည်းနဲ့ မလုံဘူး** — Section 2 ကြည့်ပါ။ |
| `productSupplierSnapshots` မှာ `supplier` field | ✅ မှန်။ ဒါပေမယ့် လက်ရှိ `productId` column မှာ **global UNIQUE constraint ရှိနေလို့** ရှေ့ဆက်မရနိုင်ဘူး။ |
| Admin UI: Supplier Filter Tab, Badge, Top Bar Balance, Diagnostic Page | ✅ မှန်။ file-level အသေးစိတ်ကို Section 9 မှာ ဖြည့်ထားပါတယ်။ |

---

## 2. ⛔ Blocking Prerequisites — အရင် Plan မပါဝင်တဲ့ Critical Gaps

ဒီ ၅ ချက်က **DigitalCore sync ကို မစမီ ဖြေရှင်းရမယ့်** အချက်များဖြစ်ပြီး မဖြေရှင်းဘဲ ဆက်ရင် production မှာ data corruption ဖြစ်နိုင်ပါတယ်။

### C1 — Cross-supplier ID Collision (အကြမ်းဖက်ဆုံး)

`packages/db/src/schema/products.ts:8` မှာ `upstreamProductId: integer().notNull().unique()` ရှိပြီး catalog sync က `onConflictDoUpdate({ target: products.upstreamProductId })` (`apps/api/src/services/catalog.service.ts:131-143, 284-296`) နဲ့ upsert လုပ်တယ်။

- `upstreamProductId` မှာ **global unique** ဖြစ်နေလို့ XPro ID `101` နဲ့ DigitalCore ID `101` (သို့) slug `"101"` ဆို **DigitalCore sync က XPro product ရဲ့ နာမည်/category/price ကို တိတ်တဆိတ် overwrite လုပ်သွားမယ်**။ Order တင်ရင် မှားယွင်းတဲ့ supplier ကနေ ship ဖြစ်သွားနိုင်တယ်။
- Type ကို `varchar` ပြောင်းလို့ကော `"101"` နဲ့ `101` ကို string အနေနဲ့ တူသွားရင်လည်း တူညီနေမယ့် ပြဿနာ ရှိနေတုန်းပါပဲ။

**Fix:** `products` table မှာ `supplier` column ထည့်ပြီး unique ကို **composite `(supplier, upstream_product_id)`** အဖြစ် ပြောင်းရမယ်။ `onConflictDoUpdate` target လည်း composite ဖြစ်ရမယ်။

### C2 — Snapshot table က single-supplier architecture

`productSupplierSnapshots.productId` မှာ `.notNull().unique()` (`packages/db/src/schema/products.ts:29-32`) — product တစ်ခုမှာ snapshot တစ် row ပဲ သိမ်းလို့ ရသမယ်။ နှစ်ဆူးလုံးက တစ်ပြိုင်နက် price/stock မသိမ်းနိုင်ဘူး။

**Fix:** `productId` unique ဖယ်ပြီး `unique(productId, supplier)` composite + `supplier` column ထည့်ရမယ်။ Upsert conflict target လည်း ပြောင်းရမယ် (`catalog.service.ts:316-331`)။

### C3 — Sync က non-numeric ID တွေကို တိတ်တဆိတ် ချန်လှပ်ပစ်တယ်

`apps/api/src/services/catalog.service.ts:95-96, 245-246`:

```ts
const upstreamId = Number(...);
if (!upstreamId || isNaN(upstreamId)) continue;   // error/log မှ မထုတ်ဘူး
```

DigitalCore ရဲ့ ID တွေက slug (`"gemini_pro_18_months"`) ဖြစ်လို့ ဒီ code အတိုင်းဆို **sync အောင်မြင်တယ်လို့ ပေါ်ပေမယ့် product ၀ ခုပဲ တင်သွားမယ်**။

ထပ်ပြီး `getProducts({ limit: 100 })` (`catalog.service.ts:77, 195`) မှာ **pagination loop မရှိ** — catalog က ၁၀၀ ကျော်ရင် ပထမ ၁၀၀ ပဲ sync မယ်။ DigitalCore `/api/user/products` ကတော့ array အပြည့်တစ်ခါတည်းပြန်တယ် (pagination မရှိ)၊ XPro ဘက်မှာတော့ အခွင့်ကောင်းယူပြီး offset loop ထည့်ပြင်သင့်တယ်။

### C4 — Order path တစ်ခုလုံး integer typed ဖြစ်နေတယ်

- `apps/bot/src/services/xpro-order.ts:46` — `productId: number`
- `apps/bot/src/services/order.service.ts:547` — `const targetUpstreamId = product.upstreamProductId || product.id;`

ဒုတိယ line က အန္တရာယ်အများဆုံးပဲ — `upstreamProductId` မရှိ/empty ဖြစ်နေရင် **local `products.id` (integer PK) ကို supplier ကို ပို့သွားမယ်** → မှားယွင်းတဲ့ product ship ဖြစ်နိုင်တယ်၊ ဒါပေမယ့် customer ရဲ့ wallet က တကယ့် product ရဲ့ ဈေးနဲ့ နှုတ်ပြီးပြီ။

**Fix:** fallback ဖယ်ပြီး `upstreamProductId` မရှိရင် order ကို hard-fail + clear error ထုတ်ရမယ်။ String ID အတွက် တစ်ပိုင်းတစ်စ typing အားလုံး update ရမယ် (file list — Section 7)။

### C5 — `deliveries.upstreamOrderId` က INTEGER

`packages/db/src/schema/deliveries.ts:11` — DigitalCore order_id က `"ORD-3232432"` လိုမျိုး **string** ဖြစ်လို့ delivery record သိမ်းလို့ မရဘူး။ `varchar(64)` ပြောင်းရမယ်။

---

## 3. DigitalCore API — Verified Facts (docs ကနေ အတည်ပြုပြီး)

| ခေါင်းစဉ် | DigitalCore | Arena Store အတွက် ဆိုက်ဆိုင်မှု |
|---|---|---|
| Base URL | `https://digitalcore.top` (Standard HTTPS) | `DIGITALCORE_BASE_URL` default |
| Auth | Header `Api-Key: <key>` (`X-Api-Key`, `Authorization: Bearer` လည်း လက်ခံ) | Client က `Api-Key` ကို အဓိကသုံးမယ် |
| API Key ရရှိမှု | `@DCoreStoreBot` Telegram bot → ⚙️ Reseller API | Balance top-up လည်း ဒီ bot ကနေပဲ **manual** လုပ်ရမယ် (Section 8 ops) |
| Catalog | `GET /api/user/products` → flat array၊ **category concept လုံးဝမရှိ**၊ pagination မရှိ | Category ခွဲမှုက admin လက်ထဲ ရောက်မယ် (Section 5-B) |
| Product shape | `{id: slug, name, stock, price, priceFrom, tiers: [{minQty, maxQty, price}]}` | `id` က string slug။ `priceFrom` = tier အနိမ့်ဆုံးဈေး |
| Balance | `GET /api/user/me` → `{balance: number, total_orders: string}` | **Health endpoint မရှိ** — `/me` ကို health proxy အဖြစ်သုံးမယ် (latency + key validity စစ်လို့ရ) |
| Buy | `POST /api/user/buy` body `{id, count}` (count default 1, **max 1000**) → `{success, order_id: "ORD-…", view_url, total_amount, quantity, items: [string]}` | `items[]` = activation link/token — XPro `delivery.lines` (`user:pass`) နဲ့ မတူ |
| Order History | `GET /api/user/history?page=N` (50/page) | **Reconciliation အတွက် အသုံးဝင်ဆုံး endpoint** (Section 5-A) |
| Single Order | `GET /api/user/order?id=ORD-…` → order + `items` | Timeout ပြဿနာ ဖြစ်ရင် items ပြန်ရယူဖို့ |
| Errors | `{success: false, msg: "…"}` + HTTP 401/400/404 | Error code map — Section 6 |

**Error `msg` စာရင်း:** `MISSING_API_KEY`, `INVALID_API_KEY` (401) · `INSUFFICIENT_BALANCE`, `OUT_OF_STOCK`, `ID_REQUIRED`, `INVALID_COUNT`, `MAX_COUNT_EXCEEDED` (400) · `PRODUCT_NOT_FOUND`, `ORDER_NOT_FOUND` (404)

---

## 4. ⚠️ အရင် Plan မခွဲခြမ်းစိတ်ဖြာထားတဲ့ Design Implications များ

### A — Idempotency လုံးဝမရှိခြင်း (အရေးကြီးဆုံး ကွာခြားချက်)

XPro မှာ `externalOrderId` (idempotency key) ရှိလို့ network timeout ပြန် retry လုပ်လို့ ရတယ်။ **DigitalCore မှာ ဒါမရှိဘူး** — docs မှာ "database row-locking" ဆိုတာ server-side race condition အတွက်ပဲဖြစ်ပြီး client retry ဒုတိယတစ်ခါ ပို့ရင် **double purchase** ဖြစ်သွားမယ် (ငွေနှစ်ခါနှုတ်၊ ကုန်နှစ်ခါထွက်)။

**Mitigation policy (၃ ဆင့်):**

1. **Failure class ခွဲမယ်** — connection refused / DNS failure (request မရောက်တာ သေချာ → safe retry) vs. timeout / connection reset after send (ambiguous → **retry မလုပ်ဘူး**)။ `XProClient` ရဲ့ လက်ရှိ retry logic ထဲမှာ timeout ကိုလည်း retry လုပ်နေတာမျိုး DigitalCore အတွက် မလုပ်ရ။
2. **Ambiguous failure → reconciliation window** — order ကို `PROCESSING_SUPPLIER` မှာ ထားပြီး refund ချက်ချင်း မလုပ်ဘူး။ `supplier_reconciliations` row ဖန်တီးပြီး worker က `/api/user/history` page 1 ထဲမှာ `total_amount` + `quantity` + timestamp (±5 min window) တူညီမှုရှာတယ်။ တွေ့ရင် `GET /api/user/order?id=` နဲ့ items ရယူပြီး order ပြီးမြောက်အောင် လုပ်မယ်။
3. **Manual resolve** — worker နဲ့ မပြေလည်ရင် admin UI မှာ "Deliver" (items ရယူပြီး ပြီးမြောက်) သို့ "Refund" (wallet ပြန်ထည့် + order FAILED/REFUNDED) နှစ်ခုကို admin ကိုယ်တိုင် ရွေးမယ်။ Alert က `telegram-notifier` မှတဆင့်။

**New table:**

```ts
// packages/db/src/schema/reconciliations.ts (new)
export const supplierReconciliations = pgTable("supplier_reconciliations", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  supplier: varchar("supplier", { length: 16 }).notNull(),        // "DIGITALCORE"
  upstreamOrderId: varchar("upstream_order_id", { length: 64 }),  // found via /history
  status: varchar("status", { length: 24 }).notNull().default("PENDING"), // PENDING | RESOLVED_DELIVERED | RESOLVED_REFUNDED
  attempts: integer("attempts").notNull().default(0),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  notes: text("notes"),
});
```

### B — Category မရှိခြင်း

အရင် plan ထဲက "Category နာမည်တွေပါတဲ့ Product List" ဆိုတာ မှားနားလည်မှုပါ — docs အရ DigitalCore product response ထဲ **category field လုံးဝမရှိပါ**။ ဒါကြောင့်:

- `categories` table (`upstreamCategoryId` integer) က XPro အတွက်ပဲ ဆက်လက်အသုံးပြုမယ် — ထိစရာမလို။
- DigitalCore products sync လုပ်ရင် `appSettings` ထဲက `digitalcore.defaultCategorySlug` (e.g. `"uncategorized"`) ကို ကြည့်ပြီး အဲ့ category ထဲ ထည့်မယ် (မရှိရင် auto-create)။
- Admin က `products.vue` မှာ category ကို လက်ဖြင့် ပြန်ရွေးနိုင်တယ် (existing category edit UI ကို ပြန်သုံး)။ Sync ပြန်လာတုန်း **admin က လက်ဖြင့် ရွေးထားတဲ့ category ကို overwrite မလုပ်ရ** — ဒါက ရှိပြီးသား invariant ("admin overrides are never clobbered", `tests/integration/catalog-sync.integration.test.ts:11-18`) နဲ့ တူညီတယ်။ DigitalCore အတွက် ထို့ကြောင့် default category က **product အသစ်တင်တဲ့အခါမှပဲ** apply လုပ်မယ်။

### C — Wholesale Tiers (ဈေးနှုန်း system)

XPro က flat price ဖြစ်လို့ `productSupplierSnapshots.supplierPriceUsd` varchar တစ်ခုတည်းနဲ့ လုံလောက်ခဲ့တယ်။ DigitalCore မှာ:

- Snapshot မှာ **`pricingTiers jsonb` (nullable)** column အသစ်ထည့်မယ် (XPro အတွက် null)။
- `supplierPriceUsd` = tier ၀ ဈေး (`minQty: 1`) — ရှိပြီးသား margin/retail price logic မထိခိုက်စေဖို့။
- **Buy အချိန် actual cost** က quantity အလိုက် tier ပြောင်းမယ်။ New pure function in `packages/shared/src/money.ts`:

```ts
/** Tiers [{minQty, maxQty, price}] ထဲက quantity နဲ့ ကိုက်တဲ့ unit cost (USD cents) —
 *  integer-cents safe, float math တစ်ခုမှ မသုံးရ (AGENT.md rule) */
export function effectiveUnitCostUsdCents(
  tiers: Array<{ minQty: number; maxQty: number | null; price: number | string }>,
  quantity: number,
): number {
  const qtyTiers = [...tiers].sort((a, b) => a.minQty - b.minQty);
  for (const t of qtyTiers) {
    if (quantity >= t.minQty && (t.maxQty === null || quantity <= t.maxQty)) {
      return usdToCents(t.price);
    }
  }
  throw new Error("No pricing tier covers the requested quantity.");
}
```

- **Response total verification:** buy မပြီးမီ expected total = `effectiveUnitCostUsdCents(tiers, count) × count` ကို client-side တွက်ပြီး response `total_amount` နဲ့ **integer cents အတိအကျ** တူမတူ စစ်မယ်။ မတူရင် order ကို auto-deliver မလုပ်ဘဲ review flag တင်မယ် (billing mismatch alert)။
- JSON number (e.g. `0.55`) ကနေ cents ပြောင်းရာမှာ `usdToCents` ရဲ့ `Math.round(n × 100)` path ကိုသာ သုံးရမယ် — float တိုက်ရိုက် မဆောင့်ရ။

### D — Delivery Data: `items[]` + `view_url`

- `DeliveryType` enum မှာ **`LINK` ရှိပြီးသား** (`packages/shared/src/enums.ts`) — DigitalCore items တွေကို `LINK` delivery type နဲ့ သိမ်းမယ် (activation link ဖြစ်နေရင်)။
- လက်ရှိ `encryptPayload(lines: string[])` (`apps/api/src/services/encryption.ts:16`, bot copy တူ) က string array ပဲ လက်ခံတယ်။ **Versioned payload format v2** ထည့်မယ် — decrypt က version မပါတဲ့ legacy format ကိုလည်း ဆက်ဖတ်နိုင်ရမယ် (ရှိပြီးသား delivered orders မပျက်ရ):

```ts
// v1 (legacy): string[] — decryptPayload က အလိုအလျောက် detect
// v2 (new):    { v: 2, lines: string[], viewUrl?: string, supplier?: string }
```

- `formatCredentialsText` က `user:pass` အတွက် ရည်ရွယ်တယ် — `apps/bot/src/formatters/messages.ts` ရဲ့ `formatDeliveryMessage` မှာ deliveryType `LINK` ဖြစ်ရင် lines တွေကို numbered list (သို့) inline button (view_url ရှိရင်) အနေနဲ့ ပြမယ်။ Customer-facing message မှာ `stripCustomEmojiPlaceholders()` စည်းမျဉ်းဆက်လက်လိုက်နာရမယ် (AGENT.md §3)။

### E — String Order IDs နဲ့ `externalOrderId`

- `deliveries.upstreamOrderId` → `varchar(64)` (C5)။
- `orders.externalOrderId` (varchar 128, unique) မှာ လက်ရှိ `XPRO-${upstreamOrderId}` pattern ရှိတယ် (`apps/bot/src/services/order.service.ts:724`) — DigitalCore အတွက် `DIGITALCORE-${order_id}` (e.g. `DIGITALCORE-ORD-3232432`)။
- `orders` table မှာ **`supplier varchar(16)` nullable column** ထပ်ထည့်ရင် admin orders page မှာ supplier filter လုပ်လို့ရပြီး reconciliation မှာလည်း အသုံးဝင်မယ် (backfill: order item ရဲ့ product.supplier ကနေ)။

### F — Health / Usage endpoint မရှိခြင်း

XPro `getHealth()` (`/health`) + `getUsage()` (`/usage`) ရှိတယ်။ DigitalCore မှာ မရှိဘူး — `ISupplierClient.getHealth()` က DigitalCore အတွက် `GET /api/user/me` ကို 2.5s timeout နဲ့ သုံးမယ် (200 OK = online + key valid; 401 = key invalid alert)။ `getUsage()` က `UnsupportedSupplierOperationError` throw မယ် — caller တွေက optional ဆက်ဆံရမယ်။

### G — Manual Balance Top-up + Low-balance Alert

DigitalCore balance က `@DCoreStoreBot` Telegram bot ထဲက account နဲ့ ချိတ်ထားပြီး top-up က **manual** ပါ။ ဒါကြောင့်:

- `appSettings` မှာ `supplier.balanceAlertThresholdUsd` (default 5) ထည့်မယ်။ (User သတ်မှတ်ချက်: $5.00 USD အောက် ရောက်ပါက သတိပေးမည်)
- Supplier status poll (admin UI ကြည့်တာနဲ့ sync scheduler နှစ်ခုလုံး) မှာ balance < threshold ဖြစ်ရင် `telegram-notifier` က admin ကို အကြိမ်လျော့ချုပ်တည်း alert ပို့မယ် (AGENT.md interaction rule: coalesce transient feedback)။
- Ops runbook ကို Memory/README မှာ မှတ်မယ် — balance အလုံးလုံးပြတ်ရင် DigitalCore products က auto-sold-out (stock check + buy INSUFFICIENT_BALANCE error) ဖြစ်သွားမယ်၊ customer ဘက်မှာ graceful "မနေ့လို ပို့မနိုင်တာခာတယ်" flow အတွက် bot result mapping အတည်ပြုရမယ်။

---

## 5. Target Architecture

### 5.1 New workspace package — `packages/suppliers`

AGENT.md §3 အရ shared code က `packages/*` မှာရှိရမယ်။ လက်ရှိ XPro client နှစ်ခုကွာနေတာ (`apps/api` zod-config client vs `apps/bot` raw fetch) ကို ဒီအခွင့်ကောင်းနဲ့ ပေါင်းမယ်:

```
packages/suppliers/
  src/
    types.ts         # ISupplierClient, CommonProduct, SupplierOrderRequest/Result, SupplierHealth, PricingTier
    errors.ts        # SupplierError + canonical SupplierErrorCode map
    xpro.ts          # XProClient — apps/api/src/services/xpro-client.ts ကနေ ရွှေ့ (behavior-identical)
    digitalcore.ts   # DigitalCoreClient — အသစ်
    index.ts         # getSupplierClient(supplier, config) factory
  package.json       # @arena/suppliers
```

**Interface (common format):**

```ts
export type SupplierId = "XPRO" | "DIGITALCORE";

export interface CommonProduct {
  supplier: SupplierId;
  upstreamProductId: string;              // XPro: numeric string; DigitalCore: slug
  name: string;
  description?: string;
  categoryId?: string;                    // DigitalCore: undefined
  stock: number;
  inStock: boolean;
  basePriceUsdCents: number;              // tier-0 price
  pricingTiers?: PricingTier[];           // DigitalCore only
  deliveryTypeHint?: "CREDENTIALS" | "LINK";
}

export interface ISupplierClient {
  readonly supplierId: SupplierId;
  getHealth(timeoutMs?: number): Promise<SupplierHealth>;
  getBalance(timeoutMs?: number): Promise<{ balanceUsdCents: number }>;
  listProducts(): Promise<CommonProduct[]>;              // XPro: paginated internally
  getProduct(id: string): Promise<CommonProduct>;
  /** XPro: externalOrderId လိုအပ်; DigitalCore: param မပို့ (idempotency မရှိ) */
  createOrder(req: SupplierOrderRequest): Promise<SupplierOrderResult>;
  getOrder(upstreamOrderId: string): Promise<SupplierOrderInfo | null>;
  listRecentOrders(page?: number): Promise<SupplierOrderInfo[]>;  // DigitalCore /history; XPro: Unsupported
}

export type SupplierErrorCode =
  | "OUT_OF_STOCK" | "INSUFFICIENT_BALANCE" | "PRODUCT_NOT_FOUND" | "ORDER_NOT_FOUND"
  | "AUTH_FAILED" | "INVALID_REQUEST" | "MAX_COUNT_EXCEEDED"
  | "SUPPLIER_OUTAGE" | "NETWORK_ERROR" | "RETRYABLE_ERROR" | "AMBIGUOUS_TIMEOUT" | "UNSUPPORTED";
```

**`AMBIGUOUS_TIMEOUT`** က error code အသစ် — client က timeout/EOF-after-send ကို ခွဲခြားဖမ်းပြီး caller (bot order service) က reconciliation path ဆင်နွှဲဖို့ အမှီပြုမယ်။ Retry policy: XPro (idempotent) = timeout retry OK; DigitalCore = timeout retry **မလုပ်**၊ retryable 5xx/429/network-refused ပဲ retry လုပ်မယ်။

### 5.2 Config changes

```bash
# .env.example ထည့်ရမယ့်များ (value-free)
DIGITALCORE_BASE_URL="https://digitalcore.top"    # optional, default
DIGITALCORE_API_KEY=""                            # @DCoreStoreBot ကနေ ရယူ
SUPPLIERS_ENABLED="xpro"                          # "xpro" | "xpro,digitalcore" — rollout kill switch
```

- `apps/api/src/config.ts` + `apps/bot/src/config.ts` နှစ်ခုလုံးမှာ zod entries ထည့်မယ်။ Legacy `UPSTREAM_*` aliases (incl. typo `UPTREAM_API_KEY` `config.ts:94-103`) က XPro အတွက်ဆက်အလုပ်လုပ်ရမယ်။
- **Security:** key က `.env` မှာပဲ — source/docs/commit ဘယ်တော့မှ မထည့်ရ။ Chat ထဲ ပြတဲ့ key ဖြစ်နေလို့ **rotation လုပ်ဖို့ အကြံပြုပါတယ်** (နောက်ဆုံး Section 11 Open Questions)။
- `tests/setup/test-env.ts:43-45` + `tests/README.md:26` ရဲ့ safety guard ကို DigitalCore vars ပါ extend ရမယ် (real key ရှိနေရင် tests မချော်ပြေးရ)။

---

## 6. DB Schema နဲ့ Migration Plan

### 6.1 Schema diff summary

| Table | ပြောင်းလဲမှု |
|---|---|
| `products` | + `supplier varchar(16) notNull default 'XPRO'` · `upstreamProductId` integer → `varchar(64)` (USING cast) · drop `products_upstream_product_id_unique` · + `unique(supplier, upstream_product_id)` · index ကိုလည်း composite ပြောင်း |
| `product_supplier_snapshots` | + `supplier varchar(16) notNull default 'XPRO'` · + `pricingTiers jsonb` nullable · drop `productId` unique · + `unique(productId, supplier)` · index composite |
| `order_deliveries` | `upstreamOrderId` integer → `varchar(64)` |
| `orders` | + `supplier varchar(16)` nullable (backfill လုပ်မယ်) |
| `supplier_reconciliations` | **new table** (Section 4-A) |
| `categories` | မထိဘူး — XPro only (Section 4-B) |

### 6.2 Migration — hand-written, `0002_unique_wallet_user_id.sql` precedent လိုက်မယ်

⚠️ `drizzle.config.ts:13` မှာ `strict: false` ဖြစ်ပြီး drizzle-kit က integer→varchar cast အစား **drop+re-add column (data loss)** generate လုပ်နိုင်တယ်။ ထို့ကြောင့် `db:generate` output ကို blind apply မလုပ်ဘဲ **expand → backfill → contract** အစီအစဉ်နဲ့ hand-edit လုပ်ရမယ်။ ထပ်ပြီး `migrations/meta/_journal.json` ထဲ 0002 snapshot ပျောက်နေတာ (`0002_unique_wallet_user_id.sql` က journal မှာ list ဖြစ်ပေမယ့် `meta/` snapshot မရှိ) — `db:generate` ကနေ ထပ်ခါထပ်ခါ diff ဖြစ်နိုင်လို့ migration လက်ဖြင့် စစ်ရမယ်။

```sql
-- 0004_add_supplier_support.sql (hand-written; name က drizzle generate နောက်ကျိုးကျအောင်)
-- STEP 1: EXPAND — nullable columns အသစ်ထည့် (old code နဲ့ compatible)
ALTER TABLE "products" ADD COLUMN "supplier" varchar(16) DEFAULT 'XPRO' NOT NULL;
ALTER TABLE "products" ALTER COLUMN "upstream_product_id" SET DATA TYPE varchar(64)
  USING "upstream_product_id"::text;                      -- cast, data preserved
ALTER TABLE "product_supplier_snapshots" ADD COLUMN "supplier" varchar(16) DEFAULT 'XPRO' NOT NULL;
ALTER TABLE "product_supplier_snapshots" ADD COLUMN "pricing_tiers" jsonb;
ALTER TABLE "order_deliveries" ALTER COLUMN "upstream_order_id" SET DATA TYPE varchar(64)
  USING "upstream_order_id"::text;
ALTER TABLE "orders" ADD COLUMN "supplier" varchar(16);

-- STEP 2: BACKFILL
UPDATE "orders" o SET "supplier" = p."supplier"
  FROM "order_items" oi JOIN "products" p ON p."id" = oi."product_id"
  WHERE oi."order_id" = o."id" AND o."supplier" IS NULL;

-- STEP 3: CONTRACT — unique constraints လဲလှယ် (brief lock; low-traffic window ရွေး)
ALTER TABLE "products" DROP CONSTRAINT "products_upstream_product_id_unique";
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_upstream_id_unique"
  UNIQUE ("supplier", "upstream_product_id");
ALTER TABLE "product_supplier_snapshots" DROP CONSTRAINT "product_supplier_snapshots_product_id_unique";
ALTER TABLE "product_supplier_snapshots" ADD CONSTRAINT "product_supplier_snapshots_product_supplier_unique"
  UNIQUE ("product_id", "supplier");
-- indexes: drop idx_products_upstream_id / idx_snapshots_upstream_id,
--          create composite (supplier, upstream_product_id) equivalents
```

**Note:** constraint name တွေကို apply မလုပ်ခင် `information_schema` နဲ့ အတည်ပြုရမယ် (migration 0000 နဲ့ ကိုက်စစ်)။ Backfill ပြီးမှ contract လုပ်ရမယ် — deploy order က manual ဖြစ်လို့ (reviewer finding H5) စာရင်းစစ်ထားရမယ်။

---

## 7. Sync Engine + Order Flow — File-level changes

### 7.1 Sync (`apps/api/src/services/catalog.service.ts` + `catalog-scheduler.ts`)

1. `syncFullCatalog()` → per-supplier loop: `for (const supplier of enabledSuppliers)` — supplier တစ်ခု failure က အခြား supplier sync ကို မတားရ။
2. ID normalization: `Number()` skip ကို supplier-aware ဖြစ်အောင် ပြင်မယ် — DigitalCore အတွက် string ID အတိအကျ သုံးမယ် (C3)။ Synced/failed counts ကို log + appSettings မှာ per-supplier `catalog_last_synced_at_${supplier}` သိမ်းမယ်။
3. Upsert conflict targets → composite (Section 6)။ Admin overrides (paused, custom MMK price, custom category) — existing invariant အတိုင်း never clobber။
4. XPro `getProducts` pagination loop (offset-based) ထည့်မယ် — `packages/suppliers/src/xpro.ts` ထဲမှာ ပြင်ပြီး catalog service က မသိဘဲ ရ။
5. DigitalCore sync မှာ `pricingTiers` snapshot ထဲ သိမ်း + retail MMK က tier-0 ဈေးနဲ့ `calculateRetailMmk` (`packages/shared/src/money.ts`) တွက်မယ်။
6. Scheduler (`catalog-scheduler.ts:39-89`) — suppliers enabled အားလုံးကို တစ်ပြိုင်နက် (သို့) sequential (ပိုစိတ်ချုံး: sequential) sync မယ်။

### 7.2 Purchase path (`apps/bot/src/services/order.service.ts` + `xpro-order.ts`)

1. `placeUpstreamOrder` duplicate ကို **ဖျက်ပြီး** `@arena/suppliers` factory သုံးမယ် (config inject: `botConfig` ကနေ)။
2. C4 fallback ဖယ်မယ်: `product.upstreamProductId` မရှိရင် order ကို `FAILED` + admin alert — local ID ကို supplier မပို့ရ။
3. Supplier ကို product row ကနေ ဖတ်ပြီး အဲ့ supplier client နဲ့ပဲ ခေါ်မယ် (customer က ဘာ supplier ဆိုတာ မမြင်ရ)။
4. DigitalCore flow:
   - `count` guard: `1 ≤ count ≤ 1000` + existing per-product purchase limits ဆက်ကျင့်။
   - Pre-flight balance estimate: expected total cents က client-side last-known balance ထက် ကျော်ရင် customer ကို ရှင်းပြီးမှ ဆက် (optional v1)။
   - `createOrder` → `SupplierOrderResult { upstreamOrderId, items, totalUsdCents, viewUrl }`။
   - **Total verification** (Section 4-C) — mismatch → review flag။
   - Delivery: `items[]` → v2 encrypted payload + `deliveryType = LINK` (Section 4-D)။ `externalOrderId = DIGITALCORE-${order_id}`။
   - Error mapping (`msg` → `SupplierErrorCode`): `OUT_OF_STOCK`→ bot OUT_OF_STOCK result · `INSUFFICIENT_BALANCE` → admin alert + SUPPLIER_OUTAGE-style customer message (customer က ငွေပြဿနာ မမြင်ရင် ပိုကောင်းတယ် — existing `order.service.ts:657-679` switch ထဲ "SUPPLIER_BUSY" semantics ထည့်ရွေး) · `PRODUCT_NOT_FOUND` → sync ကုန်သွားပြီးသားနားလည်မှုနဲ့ bot message။
   - `AMBIGUOUS_TIMEOUT` → reconciliation (Section 4-A)။
5. XPro path — behavior unchanged (interface ပြောင်းလို့ test အားလုံး green ဖြစ်ရမယ်)။

### 7.3 Admin API (`apps/api/src/routes/admin.ts`)

| Route | ရည်ရွယ်ချက် |
|---|---|
| `GET /api/admin/suppliers/status` | `[{supplier, online, latencyMs, balanceUsdCents, lastSyncedAt, productCount, lastError?}]` — per-supplier health/balance (လက်ရှိ `refreshSupplierStatus()` 79-145 ကို generalize) |
| `POST /api/admin/suppliers/:supplier/sync` | per-supplier sync (legacy `/supplier/sync` → XPro alias အနေနဲ့ ထားမယ်) |
| `GET /api/admin/reconciliations` / `POST /api/admin/reconciliations/:id/resolve` | body `{outcome: "deliver" \| "refund", upstreamOrderId?}` — deliver ဆို items fetch + complete; refund ဆို wallet credit + order REFUNDED |
| `GET /api/admin/suppliers/balance-alert` | threshold get/set (settings permission) |

RBAC: `supplier.view` / `supplier.sync` ဆက်သုံး (`rbac/catalog.ts:30-31`) — page label "XPro Supplier" → **"Suppliers"**၊ audit `entityId` မှာ supplier param ထည့်မယ် (ဒါမှ audit trail မှာဘယ် supplier ကို sync လုပ်တယ်ဆိုတာ သိမယ်)။ `default-deny` principle ဆက်လိုက်မယ်။

---

## 8. Admin UI (apps/admin) — အရင် plan + file-level

1. **`pages/products.vue`** — Supplier Filter Tab (All / XPro / DigitalCore) + row badge (`[XPro]` / `[DigitalCore]`) · category reassign dropdown DigitalCore rows အတွက် enable · tiers display (tooltip/popover ထဲ tier စာရင်း)။ (`upstreamProductId` ကို string အဖြစ် type update — 30, 117, 165, 742 lines)။
2. **Top Bar (`composables/useSupplierStatus.ts` → `useSuppliersStatus.ts` rename/refactor)** — `XPro: $18.06 | DigitalCore: $142.00` live balance + per-supplier online dot။ Hardcoded `paid2.daki.cc` fallback (28, 75 lines) ကို config-driven ဖြစ်အောင် ပြင်မယ်။
3. **`pages/supplier.vue`** → multi-supplier cards (ဒါမှမဟုတ် `pages/suppliers.vue` အသစ် + old route redirect)။ Card တစ်ခုချင်းစီမှာ: connection health (XPro `/health`, DigitalCore `/me` latency)၊ balance + low-balance warning၊ last sync + "Sync Now" (per supplier permission)၊ product count။ **Reconciliation panel** (PENDING items + Deliver/Refund actions) က ဒီ page အောက်မှာပါမယ်။
4. **`components/Sidebar.vue` + `middleware/auth.global.ts` + `rbac/catalog.ts`** — page rename "Suppliers", permission mapping unchanged (`supplier.view`)။
5. Interaction rules (AGENT.md): tab switching မှာ layout shift မဖြစ်ရ၊ sync button နှပ်ထားစဉ် disabled state + spinner၊ balance polling က 10s ticker pattern ရှိပြီးသားကို ပြန်သုံးမယ်။

---

## 9. Security & Ops Checklist

- [ ] `DIGITALCORE_API_KEY` — `.env` တစ်ခုတည်း၊ `.env.example` value-free၊ git မထည့်၊ admin frontend/API response မှ မထုတ် (AGENT.md §2)။
- [ ] **Key rotation** — chat/logs ထဲ key ပြသခဲ့လို့ DigitalCore bot ကနေ ပြန် rotate လုပ်ဖို့ အကြံပြု။
- [ ] Real API ခေါ်မှု စည်းမျဉ်း — read-only `/me` + `/products` ကို user ခွင့်ပြုမှသာ; **`/buy` real call ကို user က explicit ခွင့်မတောင်းမချင်း ဘယ်တော့မှ မခေါ်ရ** (AGENT.md §2 — tests အားလုံး mock)။
- [ ] `tests/README.md` guard — DigitalCore key/url presence စစ်ရမယ်။
- [ ] Timeout/retry defaults — 10s timeout, 2 retries (5xx/429/refused only, DigitalCore အတွက် timeout retry မဟုတ်ဘူး)၊ `/me` health 2.5s။ DigitalCore rate limit docs မှာ မဖော်ပြထားလို့ conservative — scheduler sequential + no client-side parallelism burst။
- [ ] Audit log — supplier field ပါလုပ်မယ်; delivery payload logs တွင် plaintext မဖော် (existing rule)။

---

## 10. Phased Rollout + Test Gates

| Phase | အကြောင်းအရာ | Test Gate | Production မတင်ခင် |
|---|---|---|---|
| **0** | **Safety prerequisites:** composite unique migration (Section 6) + sync non-numeric ID fix + pagination + `||` fallback ဖယ် (C1–C5) | `catalog-sync.integration` — **cross-supplier non-clobber invariant test အသစ်** (XPro mock + DigitalCore mock တစ်ပြိုင်နက်) | ✅ ဒီ phase တင်ပြီး prod မှာ တည်ငြိမ်မှု အတည်ပြုမှ ဆက် |
| **1** | `packages/suppliers` package + XProClient ရွှေ့ + bot duplicate ဖျက် + factory | existing suites အားလုံး green (`pnpm test`) + build clean | behavior change မရှိရ |
| **2** | DigitalCoreClient + config + schema `pricingTiers` + sync integration | `digitalcore-client.test.ts` unit (mirror `xpro-client.test.ts`) + sync integration w/ mock server (slug IDs, tiers, empty array, 401/400/404) | `SUPPLIERS_ENABLED="xpro"` — digitalcore sync off by default |
| **3** | Purchase path (tier cost, buy, delivery v2, error map, **reconciliation worker + table + admin resolve**) | `bot-purchase.integration` DigitalCore cases: success / OUT_OF_STOCK / INSUFFICIENT_BALANCE / **ambiguous timeout → reconciliation → history match → deliver** / total mismatch / MAX_COUNT · `tier-pricing.test.ts` · v1→v2 payload decrypt compat test | still off; internal staging မှာ mock server နဲ့ E2E |
| **4** | Admin UI (tabs/badges/status/suppliers page/reconciliation panel) | `tests/e2e/products-table.spec.ts` extend + manual verify desktop/mobile (AGENT.md interaction checklist) | admin က UI နဲ့ enable |
| **5** | Ops: balance threshold alert + runbook + Memory/docs update | alert unit test (threshold boundary, coalesce) | ✅ full enable |

**Rollback:** `SUPPLIERS_ENABLED` env ဖြင့် supplier တစ်ခုချင်း kill switch။ Migration က default `'XPRO'` backward-compatible ဖြစ်လို့ old code + new schema ဆက်တည်တည်ငြိမ်ရမယ် (Phase 0 ရဲ့ အဓိက gate)။

---

## 11. Open Questions (User ဆုံးဖြတ်ရန်)

1. **Twin-supplier products:** တစ်ပါတည်း product ကို supplier နှစ်ဆူးက ရောင်းရင် dedupe/failover လုပ်မလား? (v1 recommendation: **မလုပ်ပါနဲ့** — rows သီးသန့်၊ failover က future enhancement)။
2. **Retail pricing basis:** Customer MMK ဈေးက tier-0 (`minQty:1`) နဲ့ပဲ တွက်မလား၊ quantity tier အလိုက် retail လည်း ပြောင်းမလား? (v1 rec: tier-0 retail + tier-aware **cost accounting only**)။
3. **API key rotation:** လက်ရှိ key က chat ထဲ ပြခဲ့လို့ rotate လုပ်မလား? (recommend: yes)။
4. **Balance alert threshold:** User မှ **$5.00 USD အောက်** ရောက်ပါက သတိပေးရန် အတည်ပြုထားပြီး (`appSettings.supplier.balanceAlertThresholdUsd = 5`)။
5. **`INSUFFICIENT_BALANCE` customer message:** customer ဘက်ကို "supplier ပြဿနာ" အနေနဲ့ ဖုံးမလား ဒါမှမဟုတ် ရိုးရိုး out-of-stock လို့ ပြောမလား? (recommend: ဖုံးတာ — ငွေအခြေအနေ အတွင်းရေး)။

---

## 12. မှတ်စု — Investigation မှာ တွေ့ရတဲ့ အခြားအချက်

- `apps/api` နဲ့ `apps/bot` မှာ `encryption.ts` + `formatCredentialsText` **identical copy ၂ ခု** ရှိနေတယ် — Phase 1 မှာ `packages/suppliers` (သို့) `packages/shared` ထဲ ပေါင်းရင် ကောင်းမယ် (delivery v2 format နှစ်ဘက်လုံး တစ်ပြိုင်နက် လိုက်နာဖို့ အရေးကြီး)။
- `apps/api/src/server.ts:108-111` ရဲ့ global error envelope `{ok:false, error:<string>}` နဲ့ supplier client envelope `{ok:false, error:{code}}` — နှစ်မျိုးရှိနေတာ normal ဖြစ်ပြီး မပြောင်းလဲပါနဲ့။
- `digitalcore_api_docs.html` file က repo root မှာ untracked ဖြစ်နေတယ် — reference doc အနေနဲ့ `xpro_partner_api_docs.*` လိုမျိုး commit လုပ်ဖို့ အကြံပြုပါတယ်။
- Investigation subagent တစ်ခုရဲ့ output အဆုံးမှာ repo နဲ့ မသက်ဆိုင်တဲ့ injected content (Flask tutorial) ပါလာတာကို တွေ့ပြီး **လျစ်လျူရှုထားပါတယ်** — ဖတ်ရှုချက်များက overlapping evidence (reviewer + scout) နဲ့ cross-checked ပြီးပါပြီ။

# Suppliers နှစ်ခု (XPro + DigitalCore) — Phase-by-Phase Execution Plan

> **ဒီ doc ရဲ့ ရည်ရွယ်ချက်:** အကောင်အထည်ဖော်မယ့် Agent တစ်ဦးက **Phase အလိုက် တစ်ဆင့်ချင်း** လိုက်လုပ်ရင် တစ်ခုမှ မကျန်စေဖို့ ရေးထားတဲ့ **work order** ပါ။ "ဘာကြောင့်" ဆိုတဲ့ ခွဲခြမ်းစိတ်ဖြာချက်အပြည့်အစုံက [add_supplier.md](./add_supplier.md) မှာရှိတယ် — ဒီ doc က "ဘယ်အစီအစဉ်၊ ဘယ် file၊ ဘယ် command၊ ဘယ်လို စစ်မယ်" ကိုပဲ ဦးတည်တယ်။
>
> **စည်းမျဉ်း အမြဲတမ်း:** ဒီ doc ကို လိုက်လုပ်ရင် repo root မှာရှိတဲ့ `AGENT.md` ရဲ့ စည်းမျဉ်းအားလုံး (Memory discipline, secrets, tests, interaction rules) က **အမြဲအမှတ်တမ်း လိုက်နာရမယ်** — ဒီ doc ထဲ မဖော်ပြထားတဲ့ အခြေအနေများအတွက်လည်း AGENT.md က အာဏာရှိတယ်။

---

## A. Progress Tracker & Milestone Grouping

| Milestone / Phase | အကြောင်းအရာ | Status | လုပ်ဆောင်သူ | ရက်စွဲ | မှတ်ချက် |
|---|---|---|---|---|---|
| **Milestone 1** (Phase 0 + 1) | **Foundation & Abstraction:** Schema composite unique, string IDs, fixes (C1–C5), `@arena/suppliers` shared package | ✅ Completed | Antigravity | 2026-10-06 | Multi-supplier core foundation, 0 tsc errors |
| **Milestone 2** (Phase 2 + 4) | **DigitalCore Sync & Admin UI:** DigitalCore client, catalog sync, Admin Products tabs/badges, Multi-balance top bar | ✅ Completed | Antigravity | 2026-10-06 | Full visual visibility, dual balance, filter tabs |
| **Milestone 3** (Phase 3) | **Purchase Engine & Reconciliation:** DigitalCore buy flow, delivery v2, timeout reconciliation | ✅ Completed | Antigravity | 2026-10-06 | Safe non-idempotent buying, live buy smoke test passed |
| **Milestone 4** (Phase 5) | **Ops, $5 Alert & Production Rollout:** $5 threshold alert, settings UI, live rollout | ✅ Completed | Antigravity | 2026-10-06 | $5 balance monitor, settings UI, rollout active |

---

## B. Pre-flight — Phase 0 မစခင် လုပ်ရမယ့်အရာများ

### B1. User ကိုယ်တိုင် လုပ်ရမယ့်အရာများ (Agent က မလုပ်နိုင်ဘူး)

- [ ] DigitalCore API key ကို **rotate** လုပ် (`@DCoreStoreBot` → ⚙️ Reseller API) — key က chat ထဲ ပြခဲ့လို့ လုံခြုံရေးအတွက် အကြံပြုထားတာ။
- [ ] `.env` (root, untracked) မှာ ထည့်ပါ:
  ```bash
  DIGITALCORE_API_KEY="<key အသစ်>"
  SUPPLIERS_ENABLED="xpro"          # Phase 5 မှာ "xpro,digitalcore" ဖြစ်လာမယ်
  ```
  (`DIGITALCORE_BASE_URL` မထည့်လည်းရ — default `https://digitalcore.top` ဖြစ်မယ်။)
- [ ] Real API read-only စစ်ဆေးခွင့် (`/api/user/me`, `/api/user/products` တစ်ခါတည်း) — Agent က တောင်းဆိုတုန်း ခွင့်ပြုရမယ်။ **`/buy` ကိုတော့ ဘယ်အခါမှ ခွင့်မပေးရ** (AGENT.md §2)။

### B2. Implementing Agent က Phase စတင်ချိန် တစ်ခါတည်း လုပ်ရမယ့်အရာများ

- [ ] `AGENT.md` အပြည့်အစုံ ဖတ်။
- [ ] `Memory/` ထဲက သက်ဆိုင်ရာ numbered specs + `Memory/2026-10-05.md` (ဒီ plan ရဲ့ မှတ်တမ်း) ဖတ်။
- [ ] `add_supplier.md` အပြည့်အစုံ ဖတ် (အထူးသဖြင့် §2 blocking gaps, §4 design implications, §6 migration SQL, §10 phases)။
- [ ] `git status` clean ဖြစ်မဖြစ် စစ်; `pnpm install && pnpm build && pnpm test` လက်ရှိအခြေအနေ **အစိမ်း (green)** ဖြစ်မဖြစ် အတည်ပြု — baseline မှန်မှန်သိဖို့။
- [ ] `digitalcore_api_docs.html` ကို reference doc အနေနဲ့ commit လုပ် (xpro docs လိုမျိုး) — user ခွင့်ပြုချက်နဲ့။

### B3. Confirmed Decisions (User အတည်ပြုပြီး ဆုံးဖြတ်ချက်များ — 2026-10-05)

အောက်ပါ Open Questions (၅) ခုကို User နှင့် တိုင်ပင်ဆွေးနွေး အတည်ပြုပြီးဖြစ်သည်:

| # | မေးခွန်း | အတည်ပြု ဆုံးဖြတ်ချက် | အကောင်အထည်ဖော်မည့် ပုံစံ |
|---|---|---|---|
| 1 | တစ် product ကို supplier နှစ်ဦးက ရောင်းရင် dedupe/failover? | **မလုပ်ပါ (v1 သီးသန့်ထားမည်)** | Supplier တစ်ခုချင်းစီ၏ product rows များကို သီးခြားစီထားရှိမည်။ Admin Products Page တွင် Supplier Filter Tab (All / XPro / DigitalCore) ဖြင့် ခွဲခြားကြည့်ရှုစီမံမည်။ Auto-failover ကို v2 တွင်သာ စဉ်းစားမည်။ |
| 2 | Retail MMK ဈေး basis | **Tier-0 (`minQty: 1`) ဈေး** | Customer မြင်ရသည့် Storefront Retail ဈေးနှုန်းကို Tier-0 အခြေခံဖြင့် တွက်မည်။ Wholesale Tier ဈေးနှုန်းများကိုမူ နောက်ကွယ် Order Buy-time Cost Accounting တွင်သာ တိကျစွာ တွက်ချက်မည်။ |
| 3 | API Key Rotation & Category | **Rotate Key + Auto 'uncategorized'** | Chat ထဲတွင် Key ပေါ်သွားခဲ့၍ User က `@DCoreStoreBot` မှတဆင့် Rotate ပြန်လုပ်ပြီး `.env` တွင်သာ လျှို့ဝှက်သိမ်းမည်။ DigitalCore ပစ္စည်းများအတွက် default category ကို `uncategorized` ထားပြီး Admin မှ ပြန်လည်သတ်မှတ်နိုင်မည် (Re-sync clobber မဖြစ်စေရ)။ |
| 4 | Balance alert threshold | **$5.00 USD** | User ၏ တိုက်ရိုက်သတ်မှတ်ချက်အရ DigitalCore/XPro balance **$5** အောက် ရောက်ပါက `telegram-notifier` မှတဆင့် Admin သို့ ချက်ချင်း သတိပေးမည် (`appSettings.supplier.balanceAlertThresholdUsd = 5`)။ |
| 5 | `INSUFFICIENT_BALANCE` ကို customer ကို ဘယ်လိုပြမလဲ | **ဖုံးကွယ်မည် (Mask)** | Customer ဘက်သို့ "ကုန်ပစ္စည်း ပြတ်လပ်နေပါသည် / ခေတ္တ မရနိုင်သေးပါ" (Out of Stock / Unavailable) ပုံစံဖြင့်သာ ပြသမည်။ အတွင်းရေး Supplier Balance ပြတ်လပ်မှုကို မဖော်ပြဘဲ Admin Telegram သို့သာ Alert ပို့မည်။ |

---

## C. Global Rules — Phase တိုင်းမှာ အမြဲလိုက်နာရမယ့်အချက်များ

1. **Phase အစီအစဉ် မဖောက်ရ။** Phase တစ်ခုရဲ့ Definition of Done အားလုံး မပြည့်ဝမခြင်း နောက် phase မစတင်ရ။
2. **Test gate:** တစ် phase ပြီးတိုင်း `pnpm build && pnpm test` (UI ထိရင် `pnpm test:e2e` ပါ) **အားလုံး green ဖြစ်ရမယ်** — fail နေရင် phase ပြီးကြောင်း မသတ်မှတ်ရ။
3. **Commit discipline:** Phase တစ်ခု = commit တစ်ခု (သို့) တစ်ခုထက်မပိုဆိုသလို ရှင်းရှင်းလင်းလင်း ခွဲမယ်။ Conventional message examples:
   - Phase 0: `feat(db): multi-supplier schema — composite unique, string upstream IDs`
   - Phase 1: `refactor(suppliers): shared @arena/suppliers package, dedupe xpro clients`
   - Phase 2: `feat(suppliers): digitalcore client, config, and catalog sync`
   - Phase 3: `feat(orders): digitalcore purchase path, delivery v2, reconciliation`
   - Phase 4: `feat(admin): multi-supplier UI — filters, status page, reconciliation panel`
   - Phase 5: `feat(ops): balance alerts and supplier rollout`
   - ⚠️ Commit ထဲ **secret/env value လုံးဝမပါရ** — `.env` က untracked ဖြစ်နေတာ အမြဲစစ်ပါ။
4. **Memory discipline (AGENT.md §6):** Phase ပြီးတိုင်း `Memory/YYYY-MM-DD.md` ထဲ တစ် entry ထပ် (changed files, decisions, test status, follow-ups)။ ဒါနဲ့ပတ်သက်တဲ့ numbered Memory spec ရှိရင် update လုပ်ပါ။
5. **ဒီ doc update:** Phase ပြီးတိုင်း Section A tracker ကို ✅ လုပ်ပြီး commit တူတူမှာ ပါစေ။
6. **မလုပ်ရမယ့်အရာများ:** real `/buy` call · ရှိပြီးသား XPro behavior ကို plan မမေးဘဲ ပြောင်းလဲမှု · `AGENT.md` ဆန့်ကျင်တဲ့ component library/float money math · tests မပါဘဲ business rule ပြောင်းလဲမှု။
7. **ရပ်တန့်ပြီး user ကို မေးရမယ့်အခြေအနေများ (Stop conditions):**
   - Migration apply လုပ်ရာမှာ constraint name/shape က ဒီ plan နဲ့ မကိုက်တဲ့အခါ (hand-migration လုံခြုံရေးအရ)။
   - DigitalCore live API က docs နဲ့ မတူတဲ့ response ပြန်လာတဲ့အခါ (read-only call ဖြင့် စစ်ပြီး ကွဲလွဲမှုတွေ့ရင်)။
   - Phase 3 ရဲ့ decision defaults တစ်ခုခု ပြောင်းလို့ရင်။
   - Existing test invariant တစ်ခုကို ဖျက်/ပြင်ရမှာ မလွှဲမရှောင်နိုင်တဲ့အခါ။

---

## Phase 0 — Safety Prerequisites (Blocking)

**ရည်ရွယ်ချက်:** Schema ကို multi-supplier ဖြစ်အောင် လုပ်ပြီး လက်ရှိ XPro စီးဆင်းမှု လုံးဝမပျက်အောင် ထားမယ်။ DigitalCore code ဘာမှ မရေးရသေးဘဲ structure က ပြင်ဆင်ပြီးဖြစ်မယ်။

**ဘာကြောင့် အရင်ဆုံး:** `upstreamProductId` ရဲ့ global unique + snapshots ရဲ့ single-row unique တွေက DigitalCore sync ၀င်လာတာနဲ့ **XPro products ကို overwrite ဖျက်ဆီးမယ်** (add_supplier.md §2 C1/C2)။ ဒါကို အရင်တင်မှ နောက် phase တွေ လုံခြုံမယ်။

### 0.1 Schema TS files update (`packages/db/src/schema/`)

- [ ] `products.ts`:
  - `products` table: `supplier: varchar("supplier", { length: 16 }).notNull().default("XPRO")` ထည့်; `upstreamProductId` → `varchar("upstream_product_id", { length: 64 })` (`.notNull()` ဆက်ထား, `.unique()` **ဖယ်**); new composite: `unique("products_supplier_upstream_id_unique").on(table.supplier, table.upstreamProductId)`; index `idx_products_upstream_id` → `idx_products_supplier_upstream_id` composite ပြောင်း။
  - `productSupplierSnapshots`: `supplier` column (default `"XPRO"`, notNull) + `pricingTiers: jsonb("pricing_tiers")` (nullable) ထည့်; `productId` ၏ `.unique()` **ဖယ်**; `unique("product_supplier_snapshots_product_supplier_unique").on(table.productId, table.supplier)`; index composite ပြောင်း။
- [ ] `deliveries.ts`: `upstreamOrderId` integer → `varchar("upstream_order_id", { length: 64 })` (index ဆက်ထား)။
- [ ] `orders.ts`: `supplier: varchar("supplier", { length: 16 })` nullable ထည့်။

### 0.2 Migration generate + hand-fix

- [ ] `pnpm --filter @arena/db db:generate` — generated `0004_*.sql` + meta snapshot ရလာမယ်။
- [ ] Generated SQL ကို **hand-edit** (drizzle-kit က integer→varchar ကို drop+re-add လုပ်နိုင်လို့ — reviewer finding H5):
  - အားလုံးကို **expand → backfill → contract** အစီအစဉ်နဲ့ ပြန်စီ (ပုံစံ: `add_supplier.md` §6.2 SQL)။
  - Cast တွေမှာ `USING "col"::text` ပါရမယ် (data မပျက်ရ)။
  - Backfill: `UPDATE orders SET supplier = (products.supplier via order_items join) WHERE supplier IS NULL`။
  - Constraint name တွေကို `migrations/0000_*.sql` (L30, L42, L51, L145-146) နဲ့ ကိုက်အောင် စစ်။
- [ ] `pnpm --filter @arena/db db:migrate` နဲ့ local DB မှာ apply — `SELECT` တွေနဲ့ column types + constraints အတည်ပြု။
- [ ] `meta/_journal.json` မှာ 0002 snapshot ပျောက်နေတဲ့ ကိစ္စ: `db:generate` output မှာ 0002-era diff ပြန်ပါလာရင် **apply မလုပ်ခင်** stop condition #1 — user ကို ပြပါ။

### 0.3 Sync engine fixes (`apps/api/src/services/catalog.service.ts`)

- [ ] C3 fix: `Number()` skip (`L95-96, 245-246`) ကို supplier-aware လုပ် — လက်ရှိ data အားလုံး `XPRO` (numeric) ဖြစ်လို့ behavior မပြောင်းရ၊ ဒါပေမယ့် non-numeric ID ရောက်ရင် **log + count** ပြမယ် (တိတ်တဆိတ် ချန်မပစ်ရ)။
- [ ] C3 fix: XPro `getProducts({ limit: 100 })` ကနေ **offset pagination loop** ဆွဲမယ် (`xpro-client.getProducts` ကို phase 1 မှာ package ထဲ ရွှေ့ရင်း ထည့်နိုင်; ဒီမှာ catalog service ဘက်က loop လုပ်)။
- [ ] Upsert conflict targets: `products.upstreamProductId` → `[products.supplier, products.upstreamProductId]` (`L131-143, 284-296`); snapshots → `[productSupplierSnapshots.productId, productSupplierSnapshots.supplier]` (`L316-331`)။
- [ ] Per-supplier sync stamp: `appSettings` key `catalog_last_synced_at` → `catalog_last_synced_at_XPRO` (legacy key ကို ဖတ်နိုင်တုန်း ဆက်ထားမယ်)။
- [ ] Admin overrides invariant (paused / custom price / custom category never clobbered) — `L162-177` ရှိပြီးသား logic ကို မထိခိုက်စေရ၊ integration test (0.5) က အတည်ပြုမယ်။

### 0.4 Bot order fallback fix (`apps/bot/src/services/order.service.ts`)

- [ ] C4 fix: `L547` — `const targetUpstreamId = product.upstreamProductId || product.id;` ကို **ဖယ်**။ `upstreamProductId` မရှိရင် order FAILED + clear error (`PRODUCT_NOT_FOUND` semantics) — local `products.id` ကို supplier ကို **ဘယ်တော့မှ မပို့ရ**။
- [ ] Type updates: `upstreamProductId` ကို string အဖြစ် ကိုင်တွယ် (xpro-order.ts `L46, 63` param types အပါအဝင်)။

### 0.5 Fixtures, mocks, tests update

- [ ] `tests/fixtures/seed.ts` (`L22, 38, 44, 58, 72, 99`) — `upstreamProductId: string` + `supplier: "XPRO"` defaults။
- [ ] `tests/mocks/upstream.ts` (`L19, 48`) — string IDs။
- [ ] `tests/integration/catalog-sync.integration.test.ts` (`L54-55, 103-193`) — types fix + **new cross-supplier non-clobber test**: XPro mock sync ပြီးမှ DigitalCore mock sync ဆက်လုပ် → XPro products အားလုံး (name/category/price) **မပြောင်းလဲရ** + DigitalCore products သီးသန့် row ဖြစ်ရ။
- [ ] `tests/integration/bot-purchase.integration.test.ts` (`L48`) + `tests/integration/rbac.integration.test.ts` (`L88, 96`) — type fixes။

### 0.6 Phase 0 Definition of Done

- [ ] `pnpm build` — 0 errors (api, bot, admin, db, shared)
- [ ] `pnpm test` — အားလုံး green (new non-clobber test အပါအဝင်)
- [ ] Local DB မှာ migration applied; `products.supplier='XPRO'` backfill အတည်ပြု
- [ ] Memory log entry + tracker update + commit

---

## Phase 1 — `packages/suppliers` Abstraction (Behavior-preserving)

**ရည်ရွယ်ချက်:** XPro client duplicate ၂ ခု (`apps/api` + `apps/bot`) ကို shared package တစ်ခုတည်း ပေါင်းပြီး behavior **မပြောင်းလဲဘဲ** (identical responses, identical error handling) ရှိနေစေမယ်။

### 1.1 Package skeleton

- [ ] `packages/suppliers/package.json` (`@arena/suppliers`, tsconfig strict, build: `tsc`) + `src/index.ts`
- [ ] `packages/db`, `packages/shared` လုပ်ထုံးလုပ်နည်း အတိုင်း — root `pnpm install` ပြန်ခေါ် (workspace `packages/*` auto-included ဖြစ်ပြီးသား)။
- [ ] Dependency rule: `@arena/suppliers` က **config ကို constructor injection နဲ့သာ** ယူမယ် (`new XProClient({ baseUrl, apiKey, timeoutMs })` — ရှိပြီးသား pattern) — app config module ကို import **မလုပ်ရ** (bot/api နှစ်ခုလုံး သုံးနိုင်ဖို့)။

### 1.2 Types + errors

- [ ] `src/types.ts` — `ISupplierClient`, `CommonProduct`, `SupplierOrderRequest/Result`, `SupplierHealth`, `SupplierOrderInfo`, `PricingTier`, `SupplierId` (အပြည့်အစုံ: `add_supplier.md` §5.1)။
- [ ] `src/errors.ts` — `SupplierError` class + canonical `SupplierErrorCode` (`OUT_OF_STOCK`, `INSUFFICIENT_BALANCE`, `PRODUCT_NOT_FOUND`, `ORDER_NOT_FOUND`, `AUTH_FAILED`, `INVALID_REQUEST`, `MAX_COUNT_EXCEEDED`, `SUPPLIER_OUTAGE`, `NETWORK_ERROR`, `RETRYABLE_ERROR`, `AMBIGUOUS_TIMEOUT`, `UNSUPPORTED`) + `fromXPro(code)` / `fromDigitalCore(msg, status)` mappers။
- [ ] Retry policy in types doc comment: XPro = timeout retry OK (idempotent via externalOrderId); DigitalCore = **timeout retry မရှိ** (Phase 2 က client ထဲ enforce)။

### 1.3 XPro migration

- [ ] `apps/api/src/services/xpro-client.ts` ရဲ့ အကြောင်းအရာ (classes `XProClient`, `XProApiError`, types) → `packages/suppliers/src/xpro.ts` — **logic မပြောင်းဘဲ** ရွှေ့ (error parse `L125-137`, retries `L105-157`, timeouts `L166-175` အတိအကျ လက်ဆင့်)။ Pagination loop (Phase 0.3 က loop) ကို client ထဲ `listProducts()` အဖြစ် ရွှေ့နိုင်တယ်။
- [ ] `apps/api` ကနေ `@arena/suppliers` import လုပ်ပြီး old file ဖျက်; `xproClient` singleton က config inject နဲ့ ဖန်တီး (`apps/api/src/config.ts:94-103` ကနေ)။
- [ ] `apps/bot` — `services/xpro-order.ts` (`placeUpstreamOrder`, `XProOrderError`) + `services/catalog.service.ts` ရဲ့ direct fetches (`L55-114, 162-193`) ကို client သုံးဖို့ ပြင်; duplicate code **ဖျက်**; bot runtime guard (test-env upstream URL check) ဆက်ရှိစေ။
- [ ] Bot error mapping (`order.service.ts:657-679` switch) က `SupplierErrorCode` နဲ့ ကိုက်အောင် ပြင် (behavior တူရမယ်)။

### 1.4 (အကြံပြု) Encryption dedupe

- [ ] `apps/api` + `apps/bot` မှာ identical ဖြစ်နေတဲ့ `encryption.ts` (`encryptPayload/decryptPayload/formatCredentialsText`) → `packages/shared` (သို့) `packages/suppliers` ထဲ ရွှေ့ + key ကို param injection။ **v1 payload format မပြောင်းရ** (v2 က Phase 3 မှာ)။ ရှိပြီးသား delivered data decrypt ဖြစ်နေရမယ် (integration test က အတည်ပြု)။

### 1.5 Phase 1 Definition of Done

- [ ] `grep -rn "paid2.daki.cc\|placeUpstreamOrder" apps/ packages/ --include="*.ts"` → config/hardcoded fallback (`admin.ts:266,283`, `useSupplierStatus.ts:28,75` ကလွဲပြီး Phase 4 မှာ ပြင်မယ်) client logic မကျန်တော့ဘူး
- [ ] `pnpm build && pnpm test` green — **existing test files များ logic မပြောင်းရ** (mock paths ပဲ ပြင်ရမယ်)
- [ ] Memory log + tracker + commit

---

## Phase 2 — DigitalCore Client + Config + Catalog Sync

**ရည်ရွယ်ချက်:** DigitalCore ကနေ catalog sync လုပ်နိုင်ပြီး admin က status/sync ကို API မှတဆင့် ထိန်းနိုင်မယ်။ (ပို့ဆောင်မှု/purchase က ယခုထက်တိုင် off)။

### 2.1 Config

- [ ] `apps/api/src/config.ts` + `apps/bot/src/config.ts`: `DIGITALCORE_BASE_URL` (default `https://digitalcore.top`), `DIGITALCORE_API_KEY` (default `""`), `SUPPLIERS_ENABLED` (default `"xpro"`, parse helper `enabledSuppliers(): SupplierId[]`)။
- [ ] `.env.example` — value-free entries ထည့် (AGENT.md §2)။ `docker-compose.yml` မှာပါ pass (value မပါ)။
- [ ] Test safety: `tests/setup/test-env.ts` + `tests/setup/integration-safety.ts` — `DIGITALCORE_API_KEY` empty + `DIGITALCORE_BASE_URL` local ဖြစ်ဖို့ inject/guard; **runtime guard** (`apps/api` order service guard pattern) ကို DigitalCore URL ပါ extend။

### 2.2 `packages/suppliers/src/digitalcore.ts`

- [ ] Endpoints (docs: `digitalcore_api_docs.html`): `GET /api/user/products` · `GET /api/user/product?id=` · `GET /api/user/me` · `POST /api/user/buy` · `GET /api/user/history?page=` · `GET /api/user/order?id=` — header `Api-Key: <key>`။
- [ ] Timeout/retry: 10s default timeout (AbortController); retries **ပြန်လည်သတ်မှတ်ချက်** — 5xx/429/connection-refused = retry (max 2, backoff); **timeout/EOF-after-send = `AMBIGUOUS_TIMEOUT` throw (retry မလုပ်)**; health (`/me`) 2.5s no-retry။
- [ ] Normalization: `{id, name, stock, price, priceFrom, tiers}` → `CommonProduct` — `upstreamProductId: id` (string အတိုင်း), `basePriceUsdCents: usdToCents(price)`, `pricingTiers` (maxQty null လက်ခံ), `inStock: stock > 0`, `deliveryTypeHint: "LINK"`။
- [ ] Error mapping: `msg` + HTTP status → `SupplierErrorCode` (docs Error Codes Reference §3 ဇယား)။ JSON number ကို cents ပြောင်းတာ `Math.round(n*100)` တစ်လမ်းတည်း။
- [ ] `createOrder`: `{upstreamProductId, quantity}` → `POST /buy` body `{id, count}`; **response total verification** — expected = `effectiveUnitCostUsdCents(tiers, count) × count`; mismatch → `SupplierError("INVALID_REQUEST", "total-mismatch")` + details (Phase 3 မှာ caller က review flag တင်မယ်)။ `listRecentOrders(page)` = `/history` map။ `getUsage()` → `UNSUPPORTED`။

### 2.3 Sync integration

- [ ] `catalog.service.ts` — `syncFullCatalog()` → enabled suppliers sequential loop; supplier တစ်ခု failure က အခြား supplier ကို မတားရ (log + continue)။
- [ ] DigitalCore products → `supplier: "DIGITALCORE"` upsert (composite conflict target — Phase 0 ကနေ ပြင်ပြီးသား); `pricingTiers` snapshot ထဲ သိမ်း; retail MMK = `calculateRetailMmk({ upstreamUsdCost: tier0Price, ... })` (existing rates/margin pipeline)။
- [ ] Default category: `appSettings["digitalcore.defaultCategorySlug"]` (default `"uncategorized"`) — မရှိရင် auto-create; **admin ရွေးထား category ကို re-sync မ overwrite** (existing override invariant)။
- [ ] `catalog-scheduler.ts` — sequential per-supplier sync; per-supplier `catalog_last_synced_at_<SUPPLIER>` stamp။

### 2.4 Admin API

- [ ] `apps/api/src/routes/admin.ts`: `GET /api/admin/suppliers/status` (per-supplier `{supplier, online, latencyMs, balanceUsdCents, lastSyncedAt, productCount, lastError?}` — existing `refreshSupplierStatus()` `L79-145` generalize); `POST /api/admin/suppliers/:supplier/sync` (permission `supplier.sync`; legacy `/supplier/sync` = XPro alias ထား); audit `entityId` = supplier param။
- [ ] RBAC: `rbac/catalog.ts` page label "XPro Supplier" → "Suppliers" (`supplier.view`/`supplier.sync` ကွန်မန့်မပြောင်း)။

### 2.5 Phase 2 Tests

- [ ] `tests/unit/digitalcore-client.test.ts` (mirror `tests/unit/xpro-client.test.ts`): auth header · envelope parse (array/plain object) · error map ဇယားအားလုံး · timeout→`AMBIGUOUS_TIMEOUT` (no retry) · 5xx retry · tier normalization (null maxQty) · total verification pass/mismatch · `/me` health proxy (200/401/timeout)။
- [ ] `tests/unit/supplier-errors.test.ts` — mapper matrix။
- [ ] `tests/integration/catalog-sync.integration.test.ts` — DigitalCore mock: slug IDs sync · tiers သိမ်းမှု · default category assignment + re-sync non-clobber · empty array (0 product, sync အောင်မြင်ကြောင်း မှားမမှတ်ရ) · per-supplier stamps · XPro+DigitalCore တစ်ပြိုင်နက် sync။
- [ ] Mock server အတွက် `tests/mocks/digitalcore.ts` fixtures (docs sample payloads အတိအကျ)။

### 2.6 Phase 2 Definition of Done

- [ ] `SUPPLIERS_ENABLED="xpro"` default နဲ့ deploy လုပ်ရင် behavior အရင်အတိုင်း (DigitalCore မပါ)
- [ ] `SUPPLIERS_ENABLED="xpro,digitalcore"` + mock server နဲ့ integration tests green
- [ ] **User ခွင့်ပြုချက်နဲ့** real read-only check တစ်ခါ: `/api/user/me` + `/api/user/products` — တကယ့် response shape docs နဲ့ တူမတူ မှတ်တမ်း (မတူရင် stop condition #2)။
- [ ] `pnpm build && pnpm test` green · Memory + tracker + commit

---

## Phase 3 — Purchase Path + Delivery v2 + Reconciliation

**ရည်ရွယ်ချက်:** Customer က DigitalCore product ဝယ်နိုင်မယ် (bot မှတဆင့်); idempotency မရှိတဲ့ အန္တရာယ်အတွက် reconciliation system အပြည့်အစုံ အလုပ်လုပ်မယ်။

### 3.1 Tier pricing (shared)

- [ ] `packages/shared/src/money.ts`: `effectiveUnitCostUsdCents(tiers, quantity)` (add_supplier.md §4-C snippet) — boundary tests: qty=1, qty=minQty-1, qty=maxQty, qty=maxQty+1, unsorted tiers, no-cover qty throws, float-safe (`0.55*100` case)။

### 3.2 Bot purchase flow (`apps/bot/src/services/order.service.ts`)

- [ ] Product ရဲ့ `supplier` column ကနေ client ရွေး (factory injection); **customer ဘက်မှာ supplier ကို မပြရ**။
- [ ] Quantity guard: existing per-product limits + `1 ≤ count ≤ 1000` (`MAX_COUNT_EXCEEDED` pre-check)။
- [ ] Wallet debit → upstream call → refund-on-failure flow လက်ရှိအတိုင်း (`L570-655`) — supplier-agnostic ဖြစ်အောင် ပြင်။
- [ ] Error mapping switch (`L657-679`): `OUT_OF_STOCK` → bot OUT_OF_STOCK · `INSUFFICIENT_BALANCE` → customer message ဖုံး (default decision #5) + admin alert · `PRODUCT_NOT_FOUND` · `AMBIGUOUS_TIMEOUT` → **reconciliation** (3.4) · အခြား → UPSTREAM_ERROR။
- [ ] Success: `externalOrderId = DIGITALCORE-${order_id}`; `orders.supplier` မှတ်; items + `view_url` → encrypted payload v2 (3.3); `order_deliveries.deliveryType = "LINK"`။

### 3.3 Delivery payload v2 ( encryption helpers နှစ်ခုလုံး / package ထဲ)

- [ ] `encryptPayload` — v2: `{ v: 2, lines: string[], viewUrl?: string, supplier?: string }`; **`decryptPayload` v1 (string[]) + v2 နှစ်မျိုးလုံး ဖတ်ရမယ်** — backward-compat test မဖြစ်မနေ။
- [ ] `apps/bot/src/formatters/messages.ts` `formatDeliveryMessage` (`L115, 301, 354`): `deliveryType=LINK` ဖြစ်ရင် items ကို numbered list; `viewUrl` ရှိရင် inline button; `stripCustomEmojiPlaceholders()` စည်းမျဉ်းဆက်လိုက်; re-view flow (`order.service.ts:902-919`) v2 ဖတ်နိုင်ရ။

### 3.4 Reconciliation

- [ ] New table `supplier_reconciliations` (add_supplier.md §4-A snippet) — drizzle generate (schema TS အရင်ရေး) + migration apply (ဒီတစ်ခါ plain add — hand-fix မလိုလောက်ဘူး၊ စစ်ပါ)။
- [ ] Bot: `AMBIGUOUS_TIMEOUT` ဖမ်းတာနဲ့ order PROCESSING_SUPPLIER ထား + reconciliation row (status PENDING) + admin alert (`telegram-notifier`) + **customer ကို "ဖိုင်အချိန်ယူနေတယ်" message**။
- [ ] Worker (`apps/api/src/services/reconciliation.service.ts` — new): PENDING rows ကို poll → DigitalCore `/history` page 1–2 → `total_amount`+`quantity`+ts (±5min window) match → `/order?id=` နဲ့ items ရယူ → **auto-deliver မလုပ်ပါနဲ့** — match တွေ့ရင် row ကို `MATCH_FOUND` + upstreamOrderId သိမ်းပြီး admin resolve လုပ်ဖို့ စောင့်မယ် (ငွေသတိထားဆုံးဖြတ်ချက်က admin လက်ထဲ)။ attempts/lastCheckedAt update; N attempts (default 6) ကျော်ရင် alert ထပ်ပို့။
- [ ] Admin routes: `GET /api/admin/reconciliations` (PENDING + MATCH_FOUND list), `POST /api/admin/reconciliations/:id/resolve` body `{outcome: "deliver"|"refund", upstreamOrderId?}` — deliver: items fetch → v2 payload → order DELIVERED; refund: wallet credit + order REFUNDED; နှစ်ခုလုံး audit-logged + idempotent (resolve ပြီးပြီး row ပြန် resolve မလုပ်နိုင်)။

### 3.5 Phase 3 Tests (မဖြစ်မနေ — reviewer rule: supplier client ပြောင်းလဲမှု = matching tests)

- [ ] `tests/integration/bot-purchase.integration.test.ts` — DigitalCore cases: success (items + view_url သိမ်းမှု, deliveryType LINK) · OUT_OF_STOCK refund path · INSUFFICIENT_BALANCE (customer message ဖုံးမှု + admin alert) · total mismatch → review flag, auto-deliver မဖြစ်ရ · **AMBIGUOUS_TIMEOUT → reconciliation row ဖန်တီး → worker finds match → admin resolve deliver → order DELIVERED + customer ရ delivery ရ** · admin resolve refund path · `MAX_COUNT_EXCEEDED` pre-check။
- [ ] v1→v2 payload decrypt compat test (existing seed deliveries ပြန်ဖတ်)။
- [ ] Reconciliation worker unit tests: window match/mismatch, attempt limit, idempotent resolve။
- [ ] `tier-pricing.test.ts` (3.1)။
- [ ] XPro paths — **existing tests အားလုံး unchanged green** (behavior မပြောင်းရ)။

### 3.6 Phase 3 Definition of Done

- [ ] Real `/buy` call — **user က explicit live smoke test မတောင်းမချင်း လုပ်ရမယ်မဟုတ်ဘူး** (stop ပြီး user ကို မေး)။ User ခွင့်ပြုရင်: minimal real buy (quantity 1, အသေးဆုံးဈေး product) → full E2E မှတ်တမ်း။
- [ ] `pnpm build && pnpm test` green · Memory + tracker + commit

---

## Phase 4 — Admin UI

**ရည်ရွယ်ချက်:** Admin က supplier နှစ်ဆူးကို တစ်နေရတည်း မြင်ရ၊ ထိန်းနိုင်မယ်။ (Interaction rules: AGENT.md — calm motion, no layout shift, no dead controls။)

- [ ] `apps/admin/composables/useSupplierStatus.ts` → `useSuppliersStatus.ts`: multi-supplier state (`SuppliersMap`), polling (10s ticker pattern ဆက်), `syncCatalog(supplier)`; hardcoded `paid2.daki.cc` fallback (`L28, 75`) ကို API-provided value ဖြင့် အစားထိုး။
- [ ] `pages/products.vue`: Supplier Filter Tab (All/XPro/DigitalCore — `L30, 117, 165, 742` type/string updates ပါ) · row badge `[XPro]`/`[DigitalCore]` · DigitalCore rows မှာ category reassign dropdown · tiers popover (tier စာရင်း + min/max ဈေး)။
- [ ] `pages/supplier.vue` → multi-supplier cards (နှစ်ဆူးလုံး): per-supplier health + latency, balance + low-balance warning color, last sync, "Sync Now" (per-supplier, `can('supplier.sync')`), product count။ **Reconciliation Panel** — PENDING/MATCH_FOUND rows + Deliver/Refund confirm dialogs (refund မှာ reason input)။
- [ ] Header Top Bar: `XPro: $18.06 | DigitalCore: $142.00` + per-supplier online dot (balance က status API ကနေ)။
- [ ] `components/Sidebar.vue` + `middleware/auth.global.ts` (`PAGE_PERMISSIONS`) — page label/rename နဲ့ ကိုက်အောင် (permission key မပြောင်း)။
- [ ] Loading/empty/error states တစ်ခုချင်း: supplier offline card · sync in-progress (button disabled + spinner, layout shift မဖြစ်) · reconciliation empty state · balance မရနိုင် (401) အခြေအနေ။
- [ ] Tests: `tests/e2e/products-table.spec.ts` — supplier filter tab + badge (mocks/admin-api.ts ထဲ DigitalCore products payload ထည့်)။ `tests/mocks/admin-api.ts` update (multi-supplier status shape)။

**Definition of Done:** `pnpm test` + `pnpm test:e2e` green; manual checklist — desktop+mobile, keyboard access, `prefers-reduced-motion`, tab switching မှာ no layout jump (AGENT.md finish checklist) · Memory + tracker + commit။

---

## Phase 5 — Ops, Alerts, Rollout

- [ ] Balance alert: status poll/scheduler မှာ balance < threshold (`appSettings.supplier.balanceAlertThresholdUsd`, default 5) → `telegram-notifier` admin alert — **coalesced** (state ပြောင်းတဲ့အခါမှ တစ်ကြိမ်; recover → re-arm) + unit test (boundary, coalescing)။
- [ ] Threshold setting UI: Store Settings page (`settings.operations` permission) ထဲ supplier section။
- [ ] Ops runbook: `Memory/` numbered spec (သို့) `docs/` — DigitalCore top-up (via `@DCoreStoreBot`), reconciliation resolve manual, key rotation steps, INSUFFICIENT_BALANCE response playbook။
- [ ] `add_supplier.md` §11 open questions final status မှတ်; numbered Memory spec update (supplier integration spec ရှိရင်)။
- [ ] Rollout (user ဆုံးဖြတ်ချက်ဖြင့်): `.env` → `SUPPLIERS_ENABLED="xpro,digitalcore"` → prod deploy → DigitalCore catalog sync လက်တွေ့ လည်ပတ်မှု ၂၄ နာရီ စောင့်ကြည့် (orders မဝယ်ခင်) → first real purchase ကို user ကိုယ်တိုင် admin မှ စမ်း။
- [ ] Rollback rehearsal: `SUPPLIERS_ENABLED="xpro"` ပြန်လျှော့ → DigitalCore sync/purchase ရပ်, XPro ဆက်လည်ပတ် — ဒါကို staging မှာ အတည်ပြု။

**Definition of Done:** Prod မှာ supplier နှစ်ဆူး လည်ပတ်နေတယ် · alerts အလုပ်လုပ်တယ် · runbook ရှိတယ် · final Memory entry + tracker အပြည့်အစုံ။

---

## D. Phase ကြား Handoff Protocol (Agent ပြောင်းလဲတဲ့အခါ)

နောက် agent က Phase အသစ်စမယ်ဆိုရင် **ဒီအစီအစဉ်** လိုက်လုပ်ရမယ်:

1. `AGENT.md` ဖတ် → `add_supplier.md` (context) → `add_supplier_execution_plan.md` ရဲ့ သက်ဆိုင်ရာ phase + အောက် phases အားလုံး (outcome သိဖို့) ဖတ်။
2. `Memory/` ထဲက ယခင် phases ရဲ့ daily entries အားလုံးဖတ် — အထူးသဖြင့် decisions/follow-ups။
3. Section A tracker က ယခင် phases ✅ အားလုံးဖြစ်နေမှု + `pnpm build && pnpm test` green ဖြစ်မှု အတည်ပြု။
4. Phase တစ်ခုလုံး တစ် session ထဲ ပြီးအောင် မကြိုးစားရ — phase ပြီးရင် commit + Memory + tracker update လုပ်ပြီး ရပ်နိုင်တယ် (နောက် agent က ဆက်)။
5. ဒီ plan နဲ့ ကွဲလွဲရမှာ မလွှဲမရှောင်ဖြစ်လာရင် — ဒီ doc ထဲ မှတ်စု ထည့် + Memory မှတ် + user ကို ပြောပြီးမှ ဆက်။

## E. အမြန် Command ကိုးကားချက်

```bash
pnpm install                                   # package အသစ် ထည့်ပြီးရင်
pnpm build                                     # workspace အားလုံး tsc
pnpm test                                      # unit + integration
pnpm test:unit                                 # Postgres မလို
pnpm test:integration                          # embedded postgres auto-start
pnpm test:e2e                                  # Playwright (ပထမအကြိမ်: playwright install chromium)
pnpm --filter @arena/db db:generate            # drizzle-kit generate (hand-fix မဖြစ်မနေ)
pnpm --filter @arena/db db:migrate             # migrations apply
pnpm --filter @arena/db db:studio              # schema ကြည့်ရန်
```

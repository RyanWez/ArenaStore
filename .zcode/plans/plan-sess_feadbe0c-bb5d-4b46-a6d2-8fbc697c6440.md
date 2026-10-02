# Playwright E2E (Testing Phase 2) + Monitoring Setup — အစီအစဉ်

## Phase A: Playwright E2E — Mocked API UI tests

### ရှာဖွေတွေ့ရှိချက် အရေးကြီး
- **`tests/playwright.config.ts` ဟောင်းက stale** — `next start` (Next.js) ကို ရည်ရွှန်းနေပေမယ့် admin က အခု **Nuxt 3** — config ကို အသစ်ပြန်ရေးရမယ် (`node apps/admin/.output/server/index.mjs` port 3100)။
- Admin page တွေက same-origin `/api/...` ကို ခေါ်တာမို့ **`page.route()` နဲ့ `**/api/admin/**` ကို browser အတွင်း ဖမ်း mock လုပ်လို့ရတယ်** (Nitro proxy ထဲ မရောက်တော့ backend မလို)။
- Auth: cookie `arena_admin_token` + `GET /api/admin/auth/me` mock — login မလုပ်ဘဲ authenticated ဖြစ်နေဟန် စမ်းနိုင်မယ်။ Response envelope: `{ ok: true, ... }`။

### အဆင့်တွေ
1. **`tests/playwright.config.ts` ပြန်ရေး** — Nuxt production build + start (port 3100, upstream env empty ထား၊ `reuseExistingServer: !CI`)၊ desktop + mobile chromium projects ထားမယ်။
2. **Mock helper + fixtures** — `tests/e2e/helpers/mock-admin-api.ts` (route installation + call capture) + `tests/mocks/admin-api.ts` (admin API payload builders: products, slips, stats, settings, supplier status)။
3. **Spec ၃ ခု**:
   - `admin-auth.spec.ts` — unauthenticated → /login redirect; login form → dashboard; wrong password → error; logout
   - `products-table.spec.ts` — table render (names/prices/stock badges), filter, pause toggle → confirm modal → PUT captured → row update, sync button → POST sync
   - `deposits-review.spec.ts` — slips list render, approve → `POST {action:APPROVE}` captured + status update, reject → reason dialog, slip image mock (1px PNG)
4. **CI** — `.github/workflows/ci.yml` မှာ `e2e` job အသစ် (chromium install + desktop project ပဲ run — time ချုံ့ဖို့)
5. Root script `test:e2e` + `tests/README.md` update

**Local run အကြောင်း**: ပထမအကြိမ် `npx playwright install chromium` (~150MB download လိုမယ်)။

## Phase B: Monitoring — Sentry (env-gated scaffold) + uptime hardening

### နည်းလမ်း
Sentry SDK တွေ ထည့်ပြီး **DSN မရှိရင် လုံးဝ အလုပ်မလုပ် (no-op)** — မင်း sentry.io မှာ free account ဖွင့်ပြီး DSN ထည့်တာကို စာရွက်စာတမ်းနဲ့ ချန်ထားပေးမယ်။ UptimeRobot (free: 50 monitors, 5-min interval) က `/health` ကို ping လုပ်မယ်။

### အဆင့်တွေ
1. **API** — `@sentry/node` + `apps/api/src/instrument.ts` (`SENTRY_DSN` ရှိမှ init; empty ဆို skip = zero overhead)။ `index.ts` ရဲ့ **ပထမဆုံး import** အဖြစ် ထည့်ရမယ် (Fastify instrumentation က init ကို ရှေ့ထွက်လို့) — ဒီ invariant ကို comment နဲ့ မှတ်မယ်။ Signal handler မှာ `Sentry.close(2000)` (long-running process event flush)။
2. **Bot** — `@sentry/node` + ထိုက်တန်းတဲ့နေရာမှာ init; `bot.catch` handler မှာ `Sentry.captureException(err.error)`; shutdown မှာ flush။
3. **Admin (Nuxt)** — `@sentry/nuxt` module + `sentry.client.config.ts` / `sentry.server.config.ts` + `NUXT_PUBLIC_SENTRY_DSN` runtime config — DSN မရှိရင် init ချန်လှပ်။
4. **Health hardening** — `/health` မှာ DB ပျက်နေရင် **503 + status:"degraded"** ပြန်အောင် ပြင် (upstream ပြတ်ရင်တော့ 200 + degraded field) — UptimeRobot HTTP monitor က ဒါနဲ့ DB outage ကိုပါ ဖမ်းမယ်။ Health route အတွက် အသေးစား unit test အသစ်။
5. **Env plumbing** — `.env.example` + docker-compose: `SENTRY_DSN`, `NUXT_PUBLIC_SENTRY_DSN` (value-free)။
6. **Deployment plan update** — [Memory/04](/home/zixuan/Projects/Arena Store/Memory/04_FREE_DEPLOYMENT_PLAN.md) မှာ "Monitoring setup" အပိုင်းအသစ်: Sentry account ဖွင့်ပုံ + DSN တွေ ဘယ်မှာထည့်ရမလဲ + UptimeRobot monitor ၃ ခု setup အဆင့်တွေ (API /health HTTP monitor, Admin URL monitor, keyword check)။

## စစ်ဆေးခြင်း + မှတ်တမ်း
- `pnpm test` (unit + integration green), `pnpm build`, local `pnpm test:e2e` (chromium install ပြီး ၃ spec အားလုံး pass), tsc clean
- Memory: daily entry 10 + 04 deployment plan monitoring section + tests/README e2e section update

## ဖိုင်ပမာဏ
Phase A: ~7 ဖိုင် (config rewrite, 4 new e2e/mocks, CI, README) · Phase B: ~10 ဖိုင် (3 apps + env + docs) — Sentry က **DSN မထည့်ခင် ဘာသ不起作用 effect မရှိ** (no-op) ဖြစ်နေမယ်။
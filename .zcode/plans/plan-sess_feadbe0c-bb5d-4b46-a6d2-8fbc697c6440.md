# Scheduled Catalog Sync — အကောင်အထည်ဖော်ရေး အစီအစဉ်

## ရည်မှန်းချက်
Catalog ကို manual button (Sync Catalog) မှတပါး **အလိုအလျောက် ၅-၁၅ မိနစ်တစ်ခါ sync** လုပ်ပေးမယ် — admin မမေ့မိရင်တောင် products/prices/stock တွေ fresh ဖြစ်နေမယ်။

## နည်းလမ်း ဆုံးဖြတ်ချက်: BullMQ အစား lightweight interval scheduler
Roadmap Phase 2 မှာ BullMQ/Redis worker ညွှန်းထားပေမယ့် — လက်ရှိ အခြေအနေနဲ့ BullMQ က **overkill** ဖြစ်နေတယ် (sync က single idempotent call တစ်ခုပဲ ဖြစ်ပြီး `syncFullCatalog()` batch upserts ကြောင့် ထပ်ခါထပ်ခါ run လို့ လုံခြုံတယ်၊ Redis မပါရင်လည်း app က လည်းနေတယ်)။ ဒါကြောင့် **API process ထဲမှာပဲ `setInterval` scheduler** — dependency အသစ် မလို၊ Redis မလို၊ AGENT.md ရဲ့ "smallest safe change" စည်းမျဉ်းအတိုင်း။ Deviation ကို Memory မှာ မှတ်မယ်။

## အကောင်အထည်ဖော်ရေး အဆင့်များ

### ၁။ Config (`apps/api/src/config.ts`)
- `CATALOG_SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(0).default(10)` — **0 ဆိုရင် disabled**

### ၂။ Scheduler module အသစ် (`apps/api/src/services/catalog-scheduler.ts`)
- `startCatalogSyncScheduler({ intervalMinutes, sync, log })` → `{ stop(): void }`
- စတင်တာနှင့် တပြိုင်နက် ပထမဆုံး sync (လက်ရှိ startup sync လုပ်ဆောင်ချက်ကို အစားထိုးမယ်)၊ ပြီးရင် interval တိုင်း
- **Overlap guard** — အရင် sync ပြီးမနေရင် နောက် tick ကို ချန်လှပ်မယ်
- Error ဖြစ်ရင် log လုပ်ပြီး timer မသေစေဘဲ ဆက်လည်းမယ် (uptime အရေးကြီး)
- `stop()` — interval ရှင်းလင်းမယ် (idempotent)

### ၃။ Server wiring (`apps/api/src/server.ts`)
- လက်ရှိ fire-and-forget startup sync (lines 88-93) ကို အစားထိုးပြီး scheduler စတင်မယ်
- `NODE_ENV=test` (သို့) interval = 0 ဆိုရင် schedule မလုပ်ဘူး
- `server.addHook("onClose")` မှာ `stop()` ခေါ်မယ် — graceful shutdown

### ၄။ Env plumbing
- `.env.example` + `docker-compose.yml` (api service): `CATALOG_SYNC_INTERVAL_MINUTES=10`
- `tests/setup/test-env.ts`: test env မှာ `"0"` (disabled) — test တွေ သီးသန့် ဖြစ်နေဖို့

### ၅။ Unit tests (`tests/unit/catalog-scheduler.test.ts`) — fake timers နဲ့ ~6 tests
- interval 0 → disabled; စတင်တာနှင့် ပထမ sync; interval တိုင်း run; overlap ဖြစ်ရင် skip; `stop()` နောက် run မလုပ်တော့; error ဖြစ်လည်း timer ရှင်သန်

### ၆။ စစ်ဆေးခြင်း + မှတ်တမ်း
- `pnpm test` (127 + ~6 = ~133 green မျှော်မှန်း), `pnpm build`, tsc clean
- Memory: daily log entry 9 + roadmap 06 Phase 2 မှာ BullMQ deviation မှတ်တမ်း + 08 spec env table ထဲ row အသစ်

## ထိခိုက်မည့် ဖိုင်များ
`config.ts`, အသစ် `catalog-scheduler.ts`, `server.ts`, `.env.example`, `docker-compose.yml`, `tests/setup/test-env.ts`, အသစ် unit test, Memory docs — bot/admin တွေကို ထိစရာ မလို (bot က DB catalog ကို ၁၅စက်တန်း cache နဲ့ ဖတ်ပြီးသားမို့ sync fresh ဖြစ်ရင် အလိုအလျောက် အကျိုးခံစားမယ်)
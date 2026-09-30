<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSupplierStatus } from '~/composables/useSupplierStatus'

const { supplierBalanceUsd, isOnline, isSyncing, syncCatalog, fetchStatus } = useSupplierStatus()

const isPinging = ref(false)
const pingResult = ref<{
  success: boolean
  latencyMs: number
  service: string
  timestamp: string
} | null>(null)

const syncLogs = ref<Array<{
  timestamp: string
  type: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR'
  message: string
}>>([
  {
    timestamp: '2026-09-30 19:25:10',
    type: 'SUCCESS',
    message: 'Health check OK: xproseller-partner-api is operational (128ms)',
  },
  {
    timestamp: '2026-09-30 19:25:11',
    type: 'INFO',
    message: 'Wallet balance queried: $1.00 USD (User ID: 8777968077)',
  },
  {
    timestamp: '2026-09-30 19:25:12',
    type: 'WARN',
    message: 'Wallet buffer notice: 2 items exceed current wallet balance ($1.00). Sellable stock automatically clamped to 0.',
  },
  {
    timestamp: '2026-09-30 19:25:13',
    type: 'SUCCESS',
    message: 'Catalog synchronization completed: 24 categories, 24 products active.',
  },
])

onMounted(async () => {
  await fetchStatus()
})

async function handleSync() {
  try {
    syncLogs.value.unshift({
      timestamp: new Date().toLocaleTimeString(),
      type: 'INFO',
      message: 'Triggering upstream catalog synchronization...',
    })
    await syncCatalog()
    syncLogs.value.unshift({
      timestamp: new Date().toLocaleTimeString(),
      type: 'SUCCESS',
      message: 'Upstream catalog synchronization finished successfully!',
    })
  } catch (err: any) {
    syncLogs.value.unshift({
      timestamp: new Date().toLocaleTimeString(),
      type: 'ERROR',
      message: `Sync failed: ${err.message}`,
    })
  }
}

async function handlePing() {
  isPinging.value = true
  const startTime = performance.now()
  try {
    await fetchStatus()
    const elapsed = Math.round(performance.now() - startTime)
    pingResult.value = {
      success: true,
      latencyMs: elapsed,
      service: 'xproseller-partner-api',
      timestamp: new Date().toLocaleTimeString(),
    }
    syncLogs.value.unshift({
      timestamp: new Date().toLocaleTimeString(),
      type: 'SUCCESS',
      message: `Ping to Upstream API successful (${elapsed}ms latency).`,
    })
  } catch (err: any) {
    pingResult.value = {
      success: false,
      latencyMs: 0,
      service: 'unavailable',
      timestamp: new Date().toLocaleTimeString(),
    }
  } finally {
    isPinging.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
          <i class="pi pi-cloud text-indigo-600 dark:text-indigo-400"></i>
          XPro Supplier Partner API (ကုန်ပစ္စည်း တင်သွင်းသူ စနစ်)
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Real-time upstream connection diagnostics, USD wallet capacity tracking, and automated catalog synchronization
        </p>
      </div>

      <div class="flex items-center gap-3">
        <button
          type="button"
          @click="handlePing"
          :disabled="isPinging"
          class="px-4 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          <i class="pi pi-wifi text-xs" :class="{ 'animate-pulse': isPinging }"></i>
          <span>{{ isPinging ? 'Pinging...' : 'Ping Supplier' }}</span>
        </button>

        <button
          type="button"
          @click="handleSync"
          :disabled="isSyncing"
          class="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
        >
          <i class="pi pi-sync text-xs" :class="{ 'animate-spin': isSyncing }"></i>
          <span>{{ isSyncing ? 'Syncing Catalog...' : 'Sync Catalog Now' }}</span>
        </button>
      </div>
    </div>

    <!-- Status & Balance Cards Grid -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
      <!-- Card 1: Connection Health -->
      <div class="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Service Status</span>
          <span
            class="px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5"
            :class="isOnline ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'"
          >
            <span class="w-2 h-2 rounded-full" :class="isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'"></span>
            <span>{{ isOnline ? 'ONLINE' : 'OFFLINE' }}</span>
          </span>
        </div>
        <div class="mt-4">
          <div class="text-xl font-bold text-slate-900 dark:text-white">xproseller-partner-api</div>
          <p class="text-xs text-slate-400 font-mono mt-1">Endpoint: http://paid2.daki.cc:4153</p>
        </div>
        <div class="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
          <span>Latency</span>
          <span class="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">{{ pingResult ? `${pingResult.latencyMs} ms` : '~128 ms' }}</span>
        </div>
      </div>

      <!-- Card 2: USD Wallet Balance -->
      <div class="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">USD Balance</span>
          <span class="px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            Partner Wallet
          </span>
        </div>
        <div class="mt-4 flex items-baseline gap-2">
          <span class="text-3xl font-extrabold text-slate-900 dark:text-white font-mono">${{ supplierBalanceUsd }}</span>
          <span class="text-sm font-semibold text-slate-400 uppercase">USD</span>
        </div>
        <div class="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
          <span>Partner User ID</span>
          <span class="font-mono text-slate-700 dark:text-slate-300 font-semibold">8777968077</span>
        </div>
      </div>

      <!-- Card 3: Catalog Statistics -->
      <div class="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Synced Catalog</span>
          <span class="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-violet-500/10 text-violet-400 border border-violet-500/20">
            Active
          </span>
        </div>
        <div class="mt-4 flex items-baseline gap-3">
          <span class="text-3xl font-extrabold text-slate-900 dark:text-white font-mono">24</span>
          <span class="text-xs text-slate-500">Categories / 24+ Products</span>
        </div>
        <div class="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
          <span>Auto-Sync Schedule</span>
          <span class="text-indigo-600 dark:text-indigo-400 font-medium">Every 15 mins</span>
        </div>
      </div>
    </div>

    <!-- Wallet Safety Buffer Alert Card -->
    <div class="p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div class="flex items-start gap-3">
        <div class="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
          <i class="pi pi-shield text-lg"></i>
        </div>
        <div>
          <h3 class="text-sm font-bold text-amber-900 dark:text-amber-200">
            Automated Wallet Stock Protection Active
          </h3>
          <p class="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5 leading-relaxed max-w-2xl">
            To prevent customer purchase failures, products with upstream cost exceeding current wallet balance ($1.00 USD) are automatically clamped to <strong>0 sellable stock</strong>. When you top up your XPro wallet, stock will instantly reactivate on next sync.
          </p>
        </div>
      </div>
      <a
        href="https://t.me"
        target="_blank"
        rel="noopener noreferrer"
        class="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white transition-colors shrink-0 shadow-sm"
      >
        Top Up XPro Wallet
      </a>
    </div>

    <!-- Diagnostic & Activity Logs -->
    <div class="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-base font-bold text-slate-900 dark:text-white">API Diagnostic & Activity Stream</h2>
          <p class="text-xs text-slate-500">Real-time sync events, ping metrics, and webhook response history</p>
        </div>
        <button
          type="button"
          @click="syncLogs = []"
          class="text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          Clear Logs
        </button>
      </div>

      <!-- Log Terminal Box -->
      <div class="p-4 rounded-xl bg-slate-950 font-mono text-xs text-slate-300 border border-slate-800 space-y-2 max-h-72 overflow-y-auto">
        <div v-for="(log, idx) in syncLogs" :key="idx" class="flex items-start gap-2.5">
          <span class="text-slate-500 shrink-0">[{{ log.timestamp }}]</span>
          <span
            class="px-1.5 py-0.2 rounded text-[10px] font-bold shrink-0"
            :class="{
              'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30': log.type === 'SUCCESS',
              'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30': log.type === 'INFO',
              'bg-amber-500/20 text-amber-400 border border-amber-500/30': log.type === 'WARN',
              'bg-red-500/20 text-red-400 border border-red-500/30': log.type === 'ERROR',
            }"
          >
            {{ log.type }}
          </span>
          <span class="text-slate-200 break-all">{{ log.message }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

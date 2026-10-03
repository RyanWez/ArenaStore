<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useSupplierStatus } from '~/composables/useSupplierStatus'
import { usePermission } from '~/composables/usePermission'

const { supplierBalanceUsd, supplierDetails, isOnline, isSyncing, syncCatalog, fetchStatus } = useSupplierStatus()
const { can } = usePermission()
const canSync = computed(() => can('supplier.sync'))

const isPinging = ref(false)
const isTopUpModalOpen = ref(false)
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
}>>([])

onMounted(async () => {
  await fetchStatus()
  const now = new Date().toLocaleTimeString()
  syncLogs.value = [
    {
      timestamp: now,
      type: isOnline.value ? 'SUCCESS' : 'WARN',
      message: `Health check: ${supplierDetails.value.endpoint} is ${isOnline.value ? 'ONLINE' : 'OFFLINE'} (${supplierDetails.value.latencyMs}ms latency).`,
    },
    {
      timestamp: now,
      type: 'INFO',
      message: `Partner wallet balance queried: $${supplierBalanceUsd.value} USD (Partner ID: ${supplierDetails.value.userId}).`,
    },
    {
      timestamp: now,
      type: 'SUCCESS',
      message: `Catalog status: ${supplierDetails.value.categoriesCount} categories and ${supplierDetails.value.productsCount} active products in database.`,
    },
  ]
})

async function handleSync() {
  try {
    syncLogs.value.unshift({
      timestamp: new Date().toLocaleTimeString(),
      type: 'INFO',
      message: 'Triggering upstream catalog synchronization...',
    })
    const res: any = await syncCatalog()
    syncLogs.value.unshift({
      timestamp: new Date().toLocaleTimeString(),
      type: 'SUCCESS',
      message: `Catalog synchronization completed: ${res?.synced?.categories ?? supplierDetails.value.categoriesCount} categories, ${res?.synced?.products ?? supplierDetails.value.productsCount} products active.`,
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
    syncLogs.value.unshift({
      timestamp: new Date().toLocaleTimeString(),
      type: 'ERROR',
      message: `Ping failed: ${err.message}`,
    })
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
          v-if="canSync"
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
          <p class="text-xs text-slate-400 font-mono mt-1">Endpoint: {{ supplierDetails.endpoint }}</p>
        </div>
        <div class="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
          <span>Latency</span>
          <span class="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">{{ pingResult ? `${pingResult.latencyMs} ms` : `${supplierDetails.latencyMs} ms` }}</span>
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
          <span class="font-mono text-slate-700 dark:text-slate-300 font-semibold">{{ supplierDetails.userId }}</span>
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
          <span class="text-3xl font-extrabold text-slate-900 dark:text-white font-mono">{{ supplierDetails.categoriesCount }}</span>
          <span class="text-xs text-slate-500">Categories / {{ supplierDetails.productsCount }} Products</span>
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
            To prevent customer purchase failures, products with upstream cost exceeding current wallet balance (${{ supplierBalanceUsd }} USD) are automatically clamped to <strong>0 sellable stock</strong>. When you top up your XPro wallet, stock will instantly reactivate on next sync.
          </p>
        </div>
      </div>
      <button
        type="button"
        @click="isTopUpModalOpen = true"
        class="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white transition-colors shrink-0 shadow-sm"
      >
        Top Up XPro Wallet
      </button>
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
        <div v-if="syncLogs.length === 0" class="text-slate-600 text-center py-4">
          No diagnostic logs recorded yet. Click "Ping Supplier" to test connection.
        </div>
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

    <!-- Top Up Instructions Modal (Teleported to body) -->
    <Teleport to="body">
      <div
        v-if="isTopUpModalOpen"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
        @click.self="isTopUpModalOpen = false"
      >
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                <i class="pi pi-wallet"></i>
              </div>
              <div>
                <h3 class="font-bold text-slate-900 dark:text-white text-sm">Top Up XPro Partner Wallet</h3>
                <p class="text-xs text-slate-400">Direct Upstream Deposit Instructions</p>
              </div>
            </div>
            <button
              @click="isTopUpModalOpen = false"
              class="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <i class="pi pi-times text-xs"></i>
            </button>
          </div>

          <div class="space-y-3 text-xs">
            <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 space-y-2">
              <div class="flex justify-between items-center">
                <span class="text-slate-500">Your Partner User ID:</span>
                <span class="font-mono font-bold text-slate-900 dark:text-white select-all">{{ supplierDetails.userId }}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-slate-500">Current Balance:</span>
                <span class="font-mono font-bold text-emerald-500">${{ supplierBalanceUsd }} USD</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-slate-500">Upstream Endpoint:</span>
                <span class="font-mono text-slate-400 truncate max-w-[200px]">{{ supplierDetails.endpoint }}</span>
              </div>
            </div>

            <div class="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 space-y-1.5">
              <p class="font-semibold flex items-center gap-1.5">
                <i class="pi pi-info-circle text-xs"></i>
                Deposit Guide:
              </p>
              <p class="text-[11px] leading-relaxed text-amber-800/90 dark:text-amber-300/90">
                To add funds to your XPro API wallet, contact the upstream support with your Partner User ID (<strong>{{ supplierDetails.userId }}</strong>) and transfer USDT (TRC-20) or your preferred payment method.
              </p>
            </div>
          </div>

          <div class="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              @click="isTopUpModalOpen = false"
              class="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Close
            </button>
            <button
              type="button"
              @click="handlePing(); isTopUpModalOpen = false;"
              class="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm flex items-center gap-1.5"
            >
              <i class="pi pi-sync text-xs"></i>
              <span>Refresh Balance</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

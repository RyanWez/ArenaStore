<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useSupplierStatus, type SupplierDetails } from '~/composables/useSupplierStatus'
import { usePermission } from '~/composables/usePermission'
import { formatRelativeTime, formatMyanmarDateTime } from '~/utils/date'

const {
  suppliersList,
  supplierBalanceUsd,
  xproBalanceUsd,
  digitalcoreBalanceUsd,
  aivaulthubBalanceUsd,
  isXProOnline,
  isDigitalcoreOnline,
  isAivaulthubOnline,
  isSyncing,
  syncCatalog,
  fetchStatus,
} = useSupplierStatus()

const { can } = usePermission()
const canSync = computed(() => can('supplier.sync'))

const isPinging = ref(false)
const isTopUpModalOpen = ref(false)
const selectedSupplierForTopUp = ref<SupplierDetails | null>(null)

const syncLogs = ref<Array<{
  timestamp: string
  type: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR'
  message: string
}>>([])

const currentTime = ref(Date.now())
let tickerInterval: any = null
let pollInterval: any = null

function getSupplierHealth(supplierId: string): boolean {
  if (supplierId === 'AIVAULTHUB') return isAivaulthubOnline.value
  if (supplierId === 'DIGITALCORE') return isDigitalcoreOnline.value
  return isXProOnline.value
}

function getSupplierBalance(supplierId: string): string {
  if (supplierId === 'AIVAULTHUB') return aivaulthubBalanceUsd.value
  if (supplierId === 'DIGITALCORE') return digitalcoreBalanceUsd.value
  return xproBalanceUsd.value
}

onMounted(async () => {
  await fetchStatus()

  tickerInterval = setInterval(() => {
    currentTime.value = Date.now()
  }, 10000)

  pollInterval = setInterval(async () => {
    if (typeof document !== 'undefined' && document.hidden) return
    await fetchStatus().catch(() => {})
  }, 30000)

  const now = new Date().toLocaleTimeString()
  syncLogs.value = [
    {
      timestamp: now,
      type: 'INFO',
      message: `Multi-supplier engine loaded: XPro, DigitalCore, and AIVault Hub active.`,
    },
    {
      timestamp: now,
      type: isXProOnline.value ? 'SUCCESS' : 'WARN',
      message: `XPro: ${isXProOnline.value ? 'ONLINE' : 'OFFLINE'} · Balance: $${xproBalanceUsd.value} USD.`,
    },
    {
      timestamp: now,
      type: isDigitalcoreOnline.value ? 'SUCCESS' : 'WARN',
      message: `DigitalCore: ${isDigitalcoreOnline.value ? 'ONLINE' : 'OFFLINE'} · Balance: $${digitalcoreBalanceUsd.value} USD.`,
    },
    {
      timestamp: now,
      type: isAivaulthubOnline.value ? 'SUCCESS' : 'WARN',
      message: `AIVault Hub: ${isAivaulthubOnline.value ? 'ONLINE' : 'OFFLINE'} · Balance: $${aivaulthubBalanceUsd.value} USD.`,
    },
  ]
})

onUnmounted(() => {
  if (tickerInterval) clearInterval(tickerInterval)
  if (pollInterval) clearInterval(pollInterval)
})

async function handleSync(supplier: 'ALL' | 'XPRO' | 'DIGITALCORE' | 'AIVAULTHUB' = 'ALL') {
  try {
    syncLogs.value.unshift({
      timestamp: new Date().toLocaleTimeString(),
      type: 'INFO',
      message: `Triggering catalog synchronization for ${supplier}...`,
    })
    const res: any = await syncCatalog(supplier)
    syncLogs.value.unshift({
      timestamp: new Date().toLocaleTimeString(),
      type: 'SUCCESS',
      message: `Catalog sync completed for ${supplier}.`,
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
    syncLogs.value.unshift({
      timestamp: new Date().toLocaleTimeString(),
      type: 'SUCCESS',
      message: `Ping to Upstream Suppliers successful (${elapsed}ms roundtrip). XPro: $${xproBalanceUsd.value}, DigitalCore: $${digitalcoreBalanceUsd.value}.`,
    })
  } catch (err: any) {
    syncLogs.value.unshift({
      timestamp: new Date().toLocaleTimeString(),
      type: 'ERROR',
      message: `Ping failed: ${err.message}`,
    })
  } finally {
    isPinging.value = false
  }
}

function openTopUp(supplier: SupplierDetails) {
  selectedSupplierForTopUp.value = supplier
  isTopUpModalOpen.value = true
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
          <i class="pi pi-cloud text-indigo-600 dark:text-indigo-400"></i>
          <span>Partner Suppliers & API Hub (ကုန်ပစ္စည်း တင်သွင်းသူများ)</span>
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Multi-supplier status, real-time USD partner wallet tracking, and automated catalog synchronization (XPro & DigitalCore)
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
          <span>{{ isPinging ? 'Pinging...' : 'Ping All Suppliers' }}</span>
        </button>

        <button
          v-if="canSync"
          type="button"
          @click="handleSync('ALL')"
          :disabled="isSyncing"
          class="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
        >
          <i class="pi pi-sync text-xs" :class="{ 'animate-spin': isSyncing }"></i>
          <span>{{ isSyncing ? 'Syncing...' : 'Sync All Catalogs' }}</span>
        </button>
      </div>
    </div>

    <!-- Multi-Supplier Detailed Cards Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div
        v-for="s in suppliersList"
        :key="s.id"
        class="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between gap-5 relative overflow-hidden"
      >
        <!-- Top Row: Name, Status, Tag -->
        <div>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span
                class="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider"
                :class="s.id === 'AIVAULTHUB' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : s.id === 'DIGITALCORE' ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20' : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'"
              >
                {{ s.name }}
              </span>
              <span class="text-xs text-slate-400 font-mono">{{ s.id }}</span>
            </div>

            <span
              class="px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5"
              :class="getSupplierHealth(s.id || '') ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'"
            >
              <span class="w-2 h-2 rounded-full" :class="getSupplierHealth(s.id || '') ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'"></span>
              <span>{{ getSupplierHealth(s.id || '') ? 'ONLINE' : 'OFFLINE' }}</span>
            </span>
          </div>

          <!-- Middle Row: Endpoint & USD Balance -->
          <div class="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
              <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">USD Partner Balance</span>
              <div class="mt-2 flex items-baseline gap-1.5">
                <span class="text-2xl font-extrabold text-slate-900 dark:text-white font-mono">${{ getSupplierBalance(s.id || '') }}</span>
                <span class="text-xs font-semibold text-slate-400">USD</span>
              </div>
              <p class="text-[10px] text-slate-400 mt-1">Partner User: {{ s.userId }}</p>
            </div>

            <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
              <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Catalog Statistics</span>
              <div class="mt-2 flex items-baseline gap-1.5">
                <span class="text-2xl font-extrabold text-slate-900 dark:text-white font-mono">{{ s.productsCount }}</span>
                <span class="text-xs text-slate-400">Products</span>
              </div>
              <p class="text-[10px] text-slate-400 mt-1">
                {{ s.id === 'XPRO' ? `${s.categoriesCount} categories` : 'Direct Digital API' }} · {{ s.latencyMs }}ms latency
              </p>
            </div>
          </div>

          <!-- Details list -->
          <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 space-y-1.5">
            <div class="flex items-center justify-between">
              <span>Endpoint:</span>
              <span class="font-mono text-slate-700 dark:text-slate-300 truncate max-w-[240px]">{{ s.endpoint }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span>Last Synced:</span>
              <span class="font-medium text-slate-700 dark:text-slate-300">
                {{ s.lastSyncedAt ? formatRelativeTime(s.lastSyncedAt) : 'Never' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Card Footer Actions -->
        <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <button
            type="button"
            @click="openTopUp(s)"
            class="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
          >
            <i class="pi pi-wallet text-[11px]"></i>
            <span>Deposit / Top Up Info</span>
          </button>

          <button
            v-if="canSync"
            type="button"
            @click="handleSync(s.id as any)"
            :disabled="isSyncing"
            class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <i class="pi pi-sync text-[10px]" :class="{ 'animate-spin': isSyncing }"></i>
            <span>Sync {{ s.name }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Wallet Safety Buffer Alert Card (Threshold: $5.00 USD) -->
    <div class="p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div class="flex items-start gap-3">
        <div class="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
          <i class="pi pi-shield text-lg"></i>
        </div>
        <div>
          <h3 class="text-sm font-bold text-amber-900 dark:text-amber-200">
            Multi-Supplier Wallet Safety & Stock Protection Active (Alert Threshold: $5.00 USD)
          </h3>
          <p class="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5 leading-relaxed max-w-2xl">
            To eliminate purchase failures, items whose upstream USD cost exceeds their respective supplier's balance are automatically clamped to 0 sellable stock. If either supplier falls below $5.00 USD, an administrative warning is triggered.
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <span class="px-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-amber-500/20 text-amber-800 dark:text-amber-200 border border-amber-500/30">
          Min Buffer: $5.00
        </span>
      </div>
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
          No diagnostic logs recorded yet. Click "Ping All Suppliers" to test connection.
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

    <!-- Top Up Instructions Modal -->
    <Teleport to="body">
      <div
        v-if="isTopUpModalOpen && selectedSupplierForTopUp"
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
                <h3 class="font-bold text-slate-900 dark:text-white text-sm">Top Up {{ selectedSupplierForTopUp.name }} Partner Wallet</h3>
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
                <span class="text-slate-500">Supplier:</span>
                <span class="font-bold text-slate-900 dark:text-white">{{ selectedSupplierForTopUp.name }}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-slate-500">Partner User ID:</span>
                <span class="font-mono font-bold text-slate-900 dark:text-white select-all">{{ selectedSupplierForTopUp.userId }}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-slate-500">Current Balance:</span>
                <span class="font-mono font-bold text-emerald-500">${{ getSupplierBalance(selectedSupplierForTopUp.id || '') }} USD</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-slate-500">Upstream Endpoint:</span>
                <span class="font-mono text-slate-400 truncate max-w-[200px]">{{ selectedSupplierForTopUp.endpoint }}</span>
              </div>
            </div>

            <div class="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 space-y-1.5">
              <p class="font-semibold flex items-center gap-1.5">
                <i class="pi pi-info-circle text-xs"></i>
                Deposit Guide:
              </p>
              <p class="text-[11px] leading-relaxed text-amber-800/90 dark:text-amber-300/90">
                To add funds to your {{ selectedSupplierForTopUp.name }} wallet, log in to the partner console at <strong>{{ selectedSupplierForTopUp.endpoint }}</strong> or contact upstream support with your Partner User ID (<strong>{{ selectedSupplierForTopUp.userId }}</strong>).
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

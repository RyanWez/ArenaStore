<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSupplierStatus } from '~/composables/useSupplierStatus'
import { useToast } from '~/composables/useToast'
import { useAuth } from '~/composables/useAuth'
import { formatMyanmarDateTime } from '~/utils/date'

const router = useRouter()
const { supplierBalanceUsd, isSyncing, syncCatalog, lastSyncMessage, fetchStatus } = useSupplierStatus()
const { getAuthHeaders } = useAuth()
const toast = useToast()

const isLoading = ref(true)
const isRefreshing = ref(false)
const copiedId = ref<string | null>(null)

const stats = ref({
  totalSalesMmk: 0,
  ordersCount: 0,
  fulfilledOrders: 0,
  pendingOrders: 0,
  pendingSlips: 0,
  activeProducts: 0,
})

const recentOrders = ref<any[]>([])
let dashboardPollInterval: ReturnType<typeof setInterval> | null = null
let isFetching = false

async function fetchDashboardData(isSilent = false) {
  if (isFetching) return
  isFetching = true
  if (!isSilent) isLoading.value = true
  try {
    const authHeaders = getAuthHeaders()

    // Trigger non-blocking background supplier status update
    fetchStatus().catch(() => {})

    // Fetch primary database metrics concurrently
    const [statsRes, ordersRes] = (await Promise.all([
      $fetch('/api/admin/stats', { headers: authHeaders }).catch((err) => {
        console.error('Stats fetch error:', err)
        return null
      }),
      $fetch('/api/admin/orders?limit=6', { headers: authHeaders }).catch((err) => {
        console.error('Orders fetch error:', err)
        return null
      }),
    ])) as [any, any]

    if (statsRes?.ok && statsRes.stats) {
      stats.value.totalSalesMmk = statsRes.stats.totalSalesMmk || 0
      stats.value.ordersCount = statsRes.stats.totalOrders || 0
      stats.value.fulfilledOrders = statsRes.stats.fulfilledOrders || 0
      stats.value.pendingOrders = statsRes.stats.pendingOrders || 0
      stats.value.pendingSlips = statsRes.stats.pendingDepositsCount || 0
      stats.value.activeProducts = statsRes.stats.activeProductsCount || 0
    }

    if (ordersRes?.ok && Array.isArray(ordersRes.orders)) {
      recentOrders.value = [...ordersRes.orders]
        .sort((a: any, b: any) => {
          const timeA = a.date ? new Date(a.date).getTime() : 0
          const timeB = b.date ? new Date(b.date).getTime() : 0
          return timeB - timeA
        })
        .slice(0, 6)
        .map((o: any) => ({
          id: o.orderId || o.id,
          publicOrderNo: o.id || o.publicOrderNo,
          productName: o.product || 'Digital Item',
          customer: o.user || 'Customer',
          telegramId: o.telegramId || '',
          amountMmk: o.totalMmk || 0,
          status: o.status === 'COMPLETED' ? 'DELIVERED' : o.status,
          createdAt: formatMyanmarDateTime(o.date),
        }))
    }
  } catch (err: any) {
    console.error('Dashboard data fetch error:', err)
  } finally {
    if (!isSilent) isLoading.value = false
    isRefreshing.value = false
    isFetching = false
  }
}

async function refreshDashboard() {
  isRefreshing.value = true
  await fetchDashboardData(true)
  toast.info('Dashboard metrics updated.', 'Sync Complete')
}

onMounted(() => {
  fetchDashboardData(false)
  dashboardPollInterval = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return
    fetchDashboardData(true)
  }, 10000)
})

onUnmounted(() => {
  if (dashboardPollInterval) clearInterval(dashboardPollInterval)
})

async function handleSync() {
  try {
    await syncCatalog()
    toast.success('XPro Supplier catalog synced successfully!', 'Sync Complete')
    await fetchDashboardData(true)
  } catch (err: any) {
    toast.error(`Sync error: ${err.message}`, 'Sync Failed')
  }
}

function getInitial(name: string): string {
  if (!name) return 'C'
  const clean = name.replace(/^@/, '').trim()
  return clean.charAt(0).toUpperCase() || 'C'
}

function copyToClipboard(text: string, id: string, event?: Event) {
  if (event) event.stopPropagation()
  navigator.clipboard.writeText(text)
  copiedId.value = id
  toast.info(`Copied "${text}" to clipboard.`, 'Copied')
  setTimeout(() => {
    copiedId.value = null
  }, 2000)
}

function navigateToCustomer(telegramId?: string, customerName?: string, event?: Event) {
  if (event) event.stopPropagation()
  const target = telegramId || customerName
  if (target) {
    router.push(`/customers/${target}`)
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Top Header matching design rules -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
          <i class="pi pi-th-large text-indigo-600 dark:text-indigo-400"></i>
          <span>Overview Dashboard</span>
          <span class="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            Real-time Live
          </span>
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Welcome back! Manage products, review customer payment slips, and monitor live XPro supplier status.
        </p>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center gap-2.5 flex-wrap">
        <!-- Live Sync Pill -->
        <div class="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-sm">
          <span class="relative flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span>Live Sync</span>
        </div>

        <!-- Manual Refresh Button -->
        <button
          type="button"
          @click="refreshDashboard"
          :disabled="isRefreshing"
          class="p-2 rounded-xl text-xs border border-slate-200 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all shrink-0"
          title="Manual refresh metrics"
        >
          <i class="pi pi-sync text-xs" :class="{ 'animate-spin': isRefreshing }"></i>
        </button>

        <!-- Sync Catalog Button -->
        <button
          type="button"
          @click="handleSync"
          :disabled="isSyncing"
          class="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 active:scale-95 transition-all disabled:opacity-50"
        >
          <i class="pi pi-cloud-download text-xs" :class="{ 'animate-spin': isSyncing }"></i>
          <span>{{ isSyncing ? 'Syncing...' : 'Sync Catalog' }}</span>
        </button>

        <!-- Review Deposits Button -->
        <NuxtLink
          to="/payments"
          class="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all"
          :class="stats.pendingSlips > 0
            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'"
        >
          <i class="pi pi-wallet"></i>
          <span>Review Deposits ({{ stats.pendingSlips }})</span>
        </NuxtLink>
      </div>
    </div>

    <!-- Sync status alert if present -->
    <div
      v-if="lastSyncMessage"
      class="p-3 rounded-xl text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-2"
    >
      <i class="pi pi-check-circle"></i>
      <span>{{ lastSyncMessage }}</span>
    </div>

    <!-- 4 KPI Stat Cards matching repository design rules -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Total Sales -->
      <NuxtLink
        to="/orders"
        class="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-indigo-500/50 dark:hover:border-indigo-500/50 transition-all group"
      >
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Sales</span>
          <div class="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center text-lg group-hover:scale-105 transition-transform">
            <i class="pi pi-wallet"></i>
          </div>
        </div>
        <div v-if="isLoading" class="mt-2.5 animate-pulse">
          <div class="h-7 w-32 rounded bg-slate-200 dark:bg-slate-800"></div>
          <div class="h-3 w-24 rounded bg-slate-200 dark:bg-slate-800 mt-2"></div>
        </div>
        <template v-else>
          <p class="text-2xl font-bold mt-2 text-slate-900 dark:text-white font-mono">
            {{ stats.totalSalesMmk.toLocaleString() }} <span class="text-xs font-normal text-slate-400">MMK</span>
          </p>
          <p class="text-xs text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1 font-medium">
            <i class="pi pi-check-circle text-[11px]"></i>
            <span>From {{ stats.fulfilledOrders }} completed orders</span>
          </p>
        </template>
      </NuxtLink>

      <!-- Orders Count -->
      <NuxtLink
        to="/orders"
        class="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-blue-500/50 dark:hover:border-blue-500/50 transition-all group"
      >
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Orders Processed</span>
          <div class="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center text-lg group-hover:scale-105 transition-transform">
            <i class="pi pi-shopping-bag"></i>
          </div>
        </div>
        <div v-if="isLoading" class="mt-2.5 animate-pulse">
          <div class="h-7 w-20 rounded bg-slate-200 dark:bg-slate-800"></div>
          <div class="h-3 w-28 rounded bg-slate-200 dark:bg-slate-800 mt-2"></div>
        </div>
        <template v-else>
          <p class="text-2xl font-bold mt-2 text-slate-900 dark:text-white font-mono">
            {{ stats.ordersCount }}
          </p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {{ stats.fulfilledOrders }} fulfilled · {{ stats.pendingOrders }} pending
          </p>
        </template>
      </NuxtLink>

      <!-- Pending Slips Review -->
      <NuxtLink
        to="/payments"
        class="p-5 rounded-2xl bg-white dark:bg-slate-900 border shadow-sm transition-all group"
        :class="stats.pendingSlips > 0 ? 'border-amber-500/40 hover:border-amber-500' : 'border-slate-200 dark:border-slate-800 hover:border-slate-400'"
      >
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium uppercase tracking-wider" :class="stats.pendingSlips > 0 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-slate-500 dark:text-slate-400'">
            Pending Slips
          </span>
          <div class="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center text-lg group-hover:scale-105 transition-transform">
            <i class="pi pi-hourglass" :class="{ 'animate-pulse': stats.pendingSlips > 0 }"></i>
          </div>
        </div>
        <div v-if="isLoading" class="mt-2.5 animate-pulse">
          <div class="h-7 w-16 rounded bg-slate-200 dark:bg-slate-800"></div>
          <div class="h-3 w-24 rounded bg-slate-200 dark:bg-slate-800 mt-2"></div>
        </div>
        <template v-else>
          <p class="text-2xl font-bold mt-2 text-slate-900 dark:text-white font-mono">
            {{ stats.pendingSlips }}
          </p>
          <p class="text-xs mt-1 font-semibold flex items-center gap-1" :class="stats.pendingSlips > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'">
            <span>{{ stats.pendingSlips > 0 ? 'Needs admin verification →' : 'All slips reviewed' }}</span>
          </p>
        </template>
      </NuxtLink>

      <!-- Upstream XPro Balance -->
      <NuxtLink
        to="/supplier"
        class="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-emerald-500/50 dark:hover:border-emerald-500/50 transition-all group"
      >
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">XPro API Wallet</span>
          <div class="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-lg group-hover:scale-105 transition-transform">
            <i class="pi pi-dollar"></i>
          </div>
        </div>
        <div v-if="isLoading" class="mt-2.5 animate-pulse">
          <div class="h-7 w-24 rounded bg-slate-200 dark:bg-slate-800"></div>
          <div class="h-3 w-28 rounded bg-slate-200 dark:bg-slate-800 mt-2"></div>
        </div>
        <template v-else>
          <p class="text-2xl font-bold mt-2 text-emerald-600 dark:text-emerald-400 font-mono">
            ${{ supplierBalanceUsd }} <span class="text-xs font-normal text-slate-400">USD</span>
          </p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Real-time Upstream Balance</span>
          </p>
        </template>
      </NuxtLink>
    </div>

    <!-- Recent Customer Orders Section (Unified Table Card) -->
    <div class="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col overflow-hidden">
      <div class="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between">
        <div>
          <h2 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <i class="pi pi-shopping-bag text-indigo-500"></i>
            <span>Recent Customer Orders</span>
          </h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Latest digital product purchases from storefront Telegram customers
          </p>
        </div>
        <NuxtLink
          to="/orders"
          class="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
        >
          <span>View All Orders</span>
          <i class="pi pi-arrow-right text-[10px]"></i>
        </NuxtLink>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse text-sm">
          <thead class="bg-slate-50 dark:bg-[#0e172a] border-b border-slate-200 dark:border-slate-800">
            <tr class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <th class="py-2.5 px-4">Order ID</th>
              <th class="py-2.5 px-4">Product</th>
              <th class="py-2.5 px-4 w-60 max-w-[240px]">Customer</th>
              <th class="py-2.5 px-4">Total</th>
              <th class="py-2.5 px-4">Status</th>
              <th class="py-2.5 px-4">Time</th>
              <th class="py-2.5 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 text-sm">
            <!-- Skeleton Rows -->
            <template v-if="isLoading">
              <tr v-for="n in 6" :key="'skel-' + n" class="animate-pulse">
                <td class="py-2.5 px-4"><div class="h-4 w-24 rounded bg-slate-200 dark:bg-slate-800"></div></td>
                <td class="py-2.5 px-4"><div class="h-4 w-36 rounded bg-slate-200 dark:bg-slate-800"></div></td>
                <td class="py-2.5 px-4 w-60 max-w-[240px]">
                  <div class="flex items-center gap-2.5">
                    <div class="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-800 shrink-0"></div>
                    <div class="h-3.5 w-24 rounded bg-slate-200 dark:bg-slate-800"></div>
                  </div>
                </td>
                <td class="py-2.5 px-4"><div class="h-4 w-16 rounded bg-slate-200 dark:bg-slate-800"></div></td>
                <td class="py-2.5 px-4"><div class="h-5 w-20 rounded-full bg-slate-200 dark:bg-slate-800"></div></td>
                <td class="py-2.5 px-4"><div class="h-3.5 w-14 rounded bg-slate-200 dark:bg-slate-800"></div></td>
                <td class="py-2.5 px-4 text-right"><div class="h-6 w-14 rounded-xl bg-slate-200 dark:bg-slate-800 ml-auto"></div></td>
              </tr>
            </template>

            <!-- Empty State -->
            <tr v-else-if="recentOrders.length === 0">
              <td colspan="7" class="py-10 text-center text-slate-400">
                <div class="flex flex-col items-center justify-center max-w-sm mx-auto">
                  <div class="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 text-lg mb-2">
                    <i class="pi pi-shopping-bag"></i>
                  </div>
                  <h3 class="text-sm font-semibold text-slate-800 dark:text-slate-200">No Orders Yet</h3>
                  <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    New customer purchases from the Telegram bot will appear here automatically.
                  </p>
                </div>
              </td>
            </tr>

            <!-- Data Rows -->
            <template v-else>
              <tr
                v-for="order in recentOrders"
                :key="order.id"
                @click="router.push('/orders')"
                class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group"
              >
                <!-- Order ID -->
                <td class="py-2.5 px-4 font-mono font-medium text-slate-900 dark:text-slate-100 text-xs">
                  <div class="flex items-center gap-1.5">
                    <span class="text-indigo-600 dark:text-indigo-400 font-semibold">{{ order.publicOrderNo }}</span>
                    <button
                      type="button"
                      @click="copyToClipboard(order.publicOrderNo, 'ov-' + order.id, $event)"
                      class="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                      :title="'Copy: ' + order.publicOrderNo"
                    >
                      <i :class="copiedId === 'ov-' + order.id ? 'pi pi-check text-emerald-500 text-[10px]' : 'pi pi-copy text-[10px]'"></i>
                    </button>
                  </div>
                </td>

                <!-- Product Name -->
                <td class="py-2.5 px-4 text-slate-800 dark:text-slate-200 font-medium">
                  <div class="truncate max-w-[200px]" :title="order.productName">
                    {{ order.productName }}
                  </div>
                </td>

                <!-- Customer (Constrained, avatar with click to customer) -->
                <td class="py-2.5 px-4 w-60 max-w-[240px]">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div
                      @click="navigateToCustomer(order.telegramId, order.customer, $event)"
                      class="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0 cursor-pointer hover:scale-105 transition-transform"
                      :title="'View customer details'"
                    >
                      {{ getInitial(order.customer) }}
                    </div>
                    <div class="min-w-0 flex-1 overflow-hidden">
                      <div
                        @click="navigateToCustomer(order.telegramId, order.customer, $event)"
                        class="font-semibold text-slate-900 dark:text-white truncate max-w-[170px] hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer transition-colors text-xs"
                        :title="order.customer"
                      >
                        {{ order.customer }}
                      </div>
                    </div>
                  </div>
                </td>

                <!-- Total Amount -->
                <td class="py-2.5 px-4 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap text-xs">
                  {{ order.amountMmk.toLocaleString() }} Ks
                </td>

                <!-- Status -->
                <td class="py-2.5 px-4 whitespace-nowrap">
                  <span
                    v-if="order.status === 'DELIVERED'"
                    class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                  >
                    <i class="pi pi-check text-[10px]"></i>
                    <span>Delivered</span>
                  </span>
                  <span
                    v-else-if="order.status === 'REFUNDED'"
                    class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                  >
                    <i class="pi pi-replay text-[10px]"></i>
                    <span>Refunded</span>
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                  >
                    <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                    <span>Processing</span>
                  </span>
                </td>

                <!-- Time -->
                <td class="py-2.5 px-4 text-xs text-slate-400 font-mono whitespace-nowrap">
                  {{ order.createdAt }}
                </td>

                <!-- Action -->
                <td class="py-2.5 px-4 text-right whitespace-nowrap">
                  <NuxtLink
                    to="/orders"
                    class="px-2.5 py-1 rounded-xl text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 border border-indigo-500/20 transition-colors inline-flex items-center gap-1"
                  >
                    <span>View</span>
                    <i class="pi pi-chevron-right text-[10px]"></i>
                  </NuxtLink>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

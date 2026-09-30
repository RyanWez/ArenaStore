<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSupplierStatus } from '~/composables/useSupplierStatus'
import { useToast } from '~/composables/useToast'

const { supplierBalanceUsd, isSyncing, syncCatalog, lastSyncMessage } = useSupplierStatus()
const toast = useToast()
const isLoading = ref(true)

onMounted(() => {
  setTimeout(() => {
    isLoading.value = false
  }, 450)
})

const stats = ref({
  totalSalesMmk: 245000,
  ordersCount: 14,
  pendingSlips: 2,
  activeProducts: 24,
})

const recentOrders = ref([
  {
    id: 'ord-101',
    publicOrderNo: 'ARN-2026-84920',
    productName: 'Gemini AI 18 MONTH',
    customer: '@ryanwez',
    amountMmk: 3900,
    status: 'PAYMENT_SUBMITTED',
    createdAt: '10 mins ago',
  },
  {
    id: 'ord-102',
    publicOrderNo: 'ARN-2026-84919',
    productName: 'Claude $100 API Key',
    customer: '@kyawkyaw_mm',
    amountMmk: 16500,
    status: 'DELIVERED',
    createdAt: '1 hour ago',
  },
  {
    id: 'ord-103',
    publicOrderNo: 'ARN-2026-84918',
    productName: 'Canva Pro 1 Year',
    customer: '@aungsan_99',
    amountMmk: 8500,
    status: 'DELIVERED',
    createdAt: '3 hours ago',
  },
  {
    id: 'ord-104',
    publicOrderNo: 'ARN-2026-84917',
    productName: 'ChatGPT Plus 1 Month',
    customer: '@thant_zin',
    amountMmk: 22000,
    status: 'CANCELLED',
    createdAt: 'Yesterday',
  },
])

async function handleSync() {
  try {
    await syncCatalog()
    toast.success('XPro Supplier catalog synced successfully!', 'Sync Complete')
  } catch (err: any) {
    toast.error(`Sync error: ${err.message}`, 'Sync Failed')
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Top Welcome Banner -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border border-slate-800 shadow-xl">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">Overview Dashboard</h1>
        <p class="text-sm text-slate-300 mt-1">
          Welcome back! Manage products, review customer payment slips, and monitor live XPro supplier status.
        </p>
      </div>
      <div class="flex items-center gap-3">
        <button
          type="button"
          @click="handleSync"
          :disabled="isSyncing"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 text-white shadow-lg shadow-indigo-600/30 transition-all"
        >
          <i class="pi pi-sync" :class="{ 'animate-spin': isSyncing }"></i>
          <span>{{ isSyncing ? 'Syncing...' : 'Sync Catalog' }}</span>
        </button>
        <NuxtLink
          to="/payments"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-all"
        >
          <i class="pi pi-receipt"></i>
          <span>Review Slips ({{ stats.pendingSlips }})</span>
        </NuxtLink>
      </div>
    </div>

    <!-- Sync status message if present -->
    <div
      v-if="lastSyncMessage"
      class="p-3 rounded-xl text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-2"
    >
      <i class="pi pi-check-circle"></i>
      <span>{{ lastSyncMessage }}</span>
    </div>

    <!-- 4 KPI Stat Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Total Sales -->
      <div class="p-5 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800/80 shadow-sm">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-slate-500 dark:text-slate-400">Total Sales</span>
          <div class="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
            <i class="pi pi-wallet text-sm"></i>
          </div>
        </div>
        <Skeleton v-if="isLoading" height="2rem" width="65%" class="mt-2" border-radius="8px" />
        <p v-else class="text-2xl font-bold mt-2 text-slate-900 dark:text-white">
          {{ stats.totalSalesMmk.toLocaleString() }} <span class="text-xs font-normal text-slate-400">MMK</span>
        </p>
        <p class="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
          <i class="pi pi-arrow-up text-[10px]"></i>
          <span>+18% from last week</span>
        </p>
      </div>

      <!-- Orders Count -->
      <div class="p-5 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800/80 shadow-sm">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-slate-500 dark:text-slate-400">Orders Processed</span>
          <div class="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
            <i class="pi pi-shopping-bag text-sm"></i>
          </div>
        </div>
        <Skeleton v-if="isLoading" height="2rem" width="40%" class="mt-2" border-radius="8px" />
        <p v-else class="text-2xl font-bold mt-2 text-slate-900 dark:text-white">
          {{ stats.ordersCount }}
        </p>
        <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
          12 fulfilled · 2 pending
        </p>
      </div>

      <!-- Pending Slips Review -->
      <div class="p-5 rounded-2xl bg-white dark:bg-slate-900/80 border border-amber-500/30 dark:border-amber-500/30 shadow-sm">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-amber-600 dark:text-amber-400">Pending Slips</span>
          <div class="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <i class="pi pi-hourglass text-sm"></i>
          </div>
        </div>
        <Skeleton v-if="isLoading" height="2rem" width="30%" class="mt-2" border-radius="8px" />
        <p v-else class="text-2xl font-bold mt-2 text-slate-900 dark:text-white">
          {{ stats.pendingSlips }}
        </p>
        <NuxtLink to="/payments" class="text-[11px] text-amber-600 dark:text-amber-400 hover:underline mt-1 block">
          Needs admin verification →
        </NuxtLink>
      </div>

      <!-- Upstream XPro Balance -->
      <div class="p-5 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800/80 shadow-sm">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-slate-500 dark:text-slate-400">XPro API Wallet</span>
          <div class="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <i class="pi pi-dollar text-sm"></i>
          </div>
        </div>
        <Skeleton v-if="isLoading" height="2rem" width="55%" class="mt-2" border-radius="8px" />
        <p v-else class="text-2xl font-bold mt-2 text-emerald-600 dark:text-emerald-400 font-mono">
          ${{ supplierBalanceUsd }} <span class="text-xs font-normal text-slate-400">USD</span>
        </p>
        <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
          Real-time Upstream Balance
        </p>
      </div>
    </div>

    <!-- Recent Orders Table Section -->
    <div class="p-6 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800/80 shadow-sm">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-base font-bold text-slate-900 dark:text-white">Recent Customer Orders</h2>
          <p class="text-xs text-slate-500 dark:text-slate-400">Latest storefront purchases from Telegram customers</p>
        </div>
        <NuxtLink
          to="/orders"
          class="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
        >
          <span>View All Orders</span>
          <i class="pi pi-arrow-right text-[10px]"></i>
        </NuxtLink>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse text-sm">
          <thead>
            <tr class="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
              <th class="py-3 px-4">Order ID</th>
              <th class="py-3 px-4">Product</th>
              <th class="py-3 px-4">Customer</th>
              <th class="py-3 px-4">Total</th>
              <th class="py-3 px-4">Status</th>
              <th class="py-3 px-4">Time</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60">
            <!-- Skeleton Rows -->
            <template v-if="isLoading">
              <tr v-for="n in 4" :key="'skel-' + n">
                <td class="py-3.5 px-4"><Skeleton height="1.1rem" width="95px" border-radius="6px" /></td>
                <td class="py-3.5 px-4"><Skeleton height="1.1rem" width="150px" border-radius="6px" /></td>
                <td class="py-3.5 px-4"><Skeleton height="1.1rem" width="80px" border-radius="6px" /></td>
                <td class="py-3.5 px-4"><Skeleton height="1.1rem" width="85px" border-radius="6px" /></td>
                <td class="py-3.5 px-4"><Skeleton height="1.3rem" width="70px" border-radius="9999px" /></td>
                <td class="py-3.5 px-4"><Skeleton height="1.1rem" width="60px" border-radius="6px" /></td>
              </tr>
            </template>
            <template v-else>
              <tr
                v-for="order in recentOrders"
                :key="order.id"
                class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
              >
              <td class="py-3.5 px-4 font-mono font-medium text-slate-900 dark:text-slate-200 text-xs">
                {{ order.publicOrderNo }}
              </td>
              <td class="py-3.5 px-4 text-slate-800 dark:text-slate-200 font-medium">
                {{ order.productName }}
              </td>
              <td class="py-3.5 px-4 text-indigo-600 dark:text-indigo-400">
                {{ order.customer }}
              </td>
              <td class="py-3.5 px-4 font-semibold text-slate-900 dark:text-white">
                {{ order.amountMmk.toLocaleString() }} Ks
              </td>
              <td class="py-3.5 px-4">
                <span
                  v-if="order.status === 'PAYMENT_SUBMITTED'"
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                >
                  Submitted
                </span>
                <span
                  v-else-if="order.status === 'DELIVERED'"
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                >
                  Delivered
                </span>
                <span
                  v-else
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-500 border border-slate-500/20"
                >
                  Cancelled
                </span>
              </td>
              <td class="py-3.5 px-4 text-xs text-slate-400">
                {{ order.createdAt }}
              </td>
            </tr>
          </template>
        </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

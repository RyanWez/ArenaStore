<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { useToast } from '~/composables/useToast'
import { getTodayMyanmarDate, type DateFilterPreset } from '~/utils/date'
import AnalyticsTrendChart from '~/components/analytics/AnalyticsTrendChart.vue'
import AnalyticsCategoryDonut from '~/components/analytics/AnalyticsCategoryDonut.vue'

interface AnalyticsSummary {
  totalRevenueMmk: number
  totalCostMmk: number
  totalCostUsd: number
  grossProfitMmk: number
  profitMarginPct: number
  deliveredOrdersCount: number
  avgOrderValueMmk: number
  refundedOrdersCount: number
  refundedAmountMmk: number
  exchangeRateUsed: number
}

interface AnalyticsData {
  periodLabel: string
  preset: string
  summary: AnalyticsSummary
  trend: any[]
  categories: any[]
  products: any[]
  topProducts: any[]
}

const { getAuthHeaders } = useAuth()
const toast = useToast()

const isInitialLoading = ref(true)
const isFiltering = ref(false)
const isRefreshing = ref(false)
let currentRequestId = 0

// Default date filter preset to TODAY as requested
const selectedDateFilter = ref<DateFilterPreset>('TODAY')
const customDateFilter = ref(getTodayMyanmarDate())

const analytics = ref<AnalyticsData>({
  periodLabel: 'Today',
  preset: 'TODAY',
  summary: {
    totalRevenueMmk: 0,
    totalCostMmk: 0,
    totalCostUsd: 0,
    grossProfitMmk: 0,
    profitMarginPct: 0,
    deliveredOrdersCount: 0,
    avgOrderValueMmk: 0,
    refundedOrdersCount: 0,
    refundedAmountMmk: 0,
    exchangeRateUsed: 4500,
  },
  trend: [],
  categories: [],
  products: [],
  topProducts: [],
})

async function fetchAnalytics(silent = false) {
  const reqId = ++currentRequestId

  if (isInitialLoading.value) {
    // Initial page load
  } else if (!silent) {
    isFiltering.value = true
  }

  try {
    const params = new URLSearchParams()
    params.set('preset', selectedDateFilter.value)
    if (selectedDateFilter.value === 'CUSTOM' && customDateFilter.value) {
      params.set('customDate', customDateFilter.value)
    }

    const res: any = await $fetch(`/api/admin/analytics?${params.toString()}`, {
      headers: getAuthHeaders(),
    })

    // Drop stale responses if a newer request was dispatched
    if (reqId !== currentRequestId) return

    if (res?.ok) {
      analytics.value = {
        periodLabel: res.periodLabel || 'Today',
        preset: res.preset || 'TODAY',
        summary: res.summary || analytics.value.summary,
        trend: Array.isArray(res.trend) ? res.trend : [],
        categories: Array.isArray(res.categories) ? res.categories : [],
        products: Array.isArray(res.products) ? res.products : [],
        topProducts: Array.isArray(res.topProducts) ? res.topProducts : [],
      }
    }
  } catch (err: any) {
    if (reqId !== currentRequestId) return
    console.error('Failed to fetch analytics:', err)
    toast.error(err.data?.message || 'Failed to load financial analytics', 'Data Error')
  } finally {
    if (reqId === currentRequestId) {
      isInitialLoading.value = false
      isFiltering.value = false
      isRefreshing.value = false
    }
  }
}

async function handleRefresh() {
  isRefreshing.value = true
  await fetchAnalytics(true)
  toast.info('Financial analytics refreshed', 'Updated')
}

watch([selectedDateFilter, customDateFilter], () => {
  fetchAnalytics(false)
})

onMounted(() => {
  fetchAnalytics(false)
})

function formatMmk(n: number): string {
  return (n || 0).toLocaleString()
}
</script>

<template>
  <div class="space-y-6">
    <!-- Top Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
          <i class="pi pi-chart-line text-emerald-500"></i>
          <span>Financial Analytics & Profit</span>
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Real-time gross profit, cost of goods, margins, and sales performance
        </p>
      </div>

      <!-- Header Actions -->
      <div class="flex items-center gap-3 flex-wrap">
        <!-- Exchange Rate Badge -->
        <div
          class="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs"
          title="Exchange rate applied to calculate supplier cost in MMK"
        >
          <i class="pi pi-dollar text-emerald-500 text-xs"></i>
          <span class="text-slate-500 dark:text-slate-400 font-medium">USD Rate:</span>
          <span class="font-bold text-slate-900 dark:text-white font-mono">
            {{ formatMmk(analytics.summary.exchangeRateUsed) }} Ks
          </span>
        </div>

        <!-- Refresh Button -->
        <button
          type="button"
          @click="handleRefresh"
          :disabled="isRefreshing"
          class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
        >
          <i class="pi pi-sync text-xs" :class="{ 'animate-spin': isRefreshing }"></i>
          <span>Refresh</span>
        </button>
      </div>
    </div>

    <!-- Date Filter Toolbar (Default: Today in Asia/Yangon) -->
    <div class="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-xs font-semibold text-slate-400 dark:text-slate-500 flex items-center gap-1.5 mr-1">
            <i class="pi pi-calendar text-xs"></i>
            <span>DATE:</span>
          </span>

          <!-- Preset Pills -->
          <div class="flex items-center bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-xl text-xs">
            <button
              type="button"
              @click="selectedDateFilter = 'ALL'"
              class="px-2.5 py-1 rounded-lg transition-all cursor-pointer"
              :class="selectedDateFilter === 'ALL'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-semibold shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'"
            >
              All Time
            </button>
            <button
              type="button"
              @click="selectedDateFilter = 'TODAY'"
              class="px-2.5 py-1 rounded-lg transition-all cursor-pointer"
              :class="selectedDateFilter === 'TODAY'
                ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 font-semibold shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'"
            >
              Today
            </button>
            <button
              type="button"
              @click="selectedDateFilter = 'YESTERDAY'"
              class="px-2.5 py-1 rounded-lg transition-all cursor-pointer"
              :class="selectedDateFilter === 'YESTERDAY'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-semibold shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'"
            >
              Yesterday
            </button>
            <button
              type="button"
              @click="selectedDateFilter = 'LAST_7_DAYS'"
              class="px-2.5 py-1 rounded-lg transition-all cursor-pointer"
              :class="selectedDateFilter === 'LAST_7_DAYS'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-semibold shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'"
            >
              Last 7 Days
            </button>
            <button
              type="button"
              @click="selectedDateFilter = 'THIS_MONTH'"
              class="px-2.5 py-1 rounded-lg transition-all cursor-pointer"
              :class="selectedDateFilter === 'THIS_MONTH'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-semibold shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'"
            >
              This Month
            </button>
          </div>

          <!-- Custom Date Picker -->
          <div class="relative flex items-center">
            <i class="pi pi-calendar absolute left-2.5 text-slate-400 text-xs pointer-events-none"></i>
            <input
              type="date"
              v-model="customDateFilter"
              @change="selectedDateFilter = 'CUSTOM'"
              class="pl-8 pr-2.5 py-1 rounded-xl text-xs bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
              :class="{ 'ring-1 ring-indigo-500 border-indigo-500 font-semibold': selectedDateFilter === 'CUSTOM' }"
              title="Filter by specific date"
            />
          </div>

          <!-- Clear Date Button -->
          <button
            v-if="selectedDateFilter !== 'ALL'"
            type="button"
            @click="selectedDateFilter = 'ALL'"
            class="px-2 py-1 rounded-lg text-[11px] text-slate-400 hover:text-rose-500 border border-dashed border-slate-300 dark:border-slate-700 hover:border-rose-400 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <i class="pi pi-filter-slash text-[10px]"></i>
            <span>Clear Date</span>
          </button>
        </div>

        <!-- Active Period Pill -->
        <div class="text-[11px] text-slate-400 flex items-center gap-1.5">
          <span>Active Period:</span>
          <span class="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
            {{ analytics.periodLabel }}
          </span>
          <span class="text-slate-500 font-medium">
            ({{ analytics.summary.deliveredOrdersCount }} orders)
          </span>
        </div>
      </div>
    </div>

    <!-- Shimmer Indeterminate Progress Line -->
    <div class="h-0.5 w-full bg-slate-100 dark:bg-slate-800/40 overflow-hidden relative rounded-full">
      <div
        v-if="isFiltering || isRefreshing"
        class="h-full bg-emerald-500 animate-indeterminate-bar rounded-full"
      ></div>
    </div>

    <!-- Core Financial KPI Cards (4 Grid) -->
    <div
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 transition-opacity duration-200"
      :class="{ 'opacity-60 pointer-events-none': isFiltering }"
    >
      <!-- 1. Net Gross Profit (Emerald Hero Card) -->
      <div class="relative overflow-hidden bg-gradient-to-br from-white to-emerald-50/40 dark:from-slate-900 dark:to-emerald-950/20 border-2 border-emerald-500/30 dark:border-emerald-500/40 rounded-2xl p-5 shadow-sm">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <i class="pi pi-sparkles text-xs"></i>
            <span>Net Gross Profit</span>
          </span>
          <span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-mono">
            +{{ analytics.summary.profitMarginPct }}% Margin
          </span>
        </div>

        <div class="mt-1">
          <div v-if="isInitialLoading" class="h-8 w-36 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div>
          <div v-else class="text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono tracking-tight">
            +{{ formatMmk(analytics.summary.grossProfitMmk) }} <span class="text-sm font-semibold text-slate-500">Ks</span>
          </div>
        </div>

        <p class="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center justify-between">
          <span>Revenue minus Supplier Cost</span>
          <i class="pi pi-wallet text-emerald-500/60 text-sm"></i>
        </p>
      </div>

      <!-- 2. Gross Revenue (Indigo Card) -->
      <div class="relative overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
            <i class="pi pi-arrow-up-right text-xs"></i>
            <span>Gross Revenue</span>
          </span>
          <span class="px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            Sales
          </span>
        </div>

        <div class="mt-1">
          <div v-if="isInitialLoading" class="h-8 w-32 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div>
          <div v-else class="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight">
            {{ formatMmk(analytics.summary.totalRevenueMmk) }} <span class="text-sm font-semibold text-slate-500">Ks</span>
          </div>
        </div>

        <p class="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center justify-between">
          <span>{{ analytics.summary.deliveredOrdersCount }} delivered sales</span>
          <i class="pi pi-shopping-bag text-indigo-500/60 text-sm"></i>
        </p>
      </div>

      <!-- 3. Cost of Goods Sold / COGS (Rose Card) -->
      <div class="relative overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
            <i class="pi pi-tag text-xs"></i>
            <span>Supplier Cost (COGS)</span>
          </span>
          <span class="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400">
            ${{ analytics.summary.totalCostUsd.toFixed(2) }} USD
          </span>
        </div>

        <div class="mt-1">
          <div v-if="isInitialLoading" class="h-8 w-32 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div>
          <div v-else class="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight">
            {{ formatMmk(analytics.summary.totalCostMmk) }} <span class="text-sm font-semibold text-slate-500">Ks</span>
          </div>
        </div>

        <p class="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center justify-between">
          <span>XPro purchase costs</span>
          <i class="pi pi-box text-rose-500/60 text-sm"></i>
        </p>
      </div>

      <!-- 4. Average Order Value & Volume (Cyan Card) -->
      <div class="relative overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400 flex items-center gap-1.5">
            <i class="pi pi-percentage text-xs"></i>
            <span>Average Order Value</span>
          </span>
          <span
            v-if="analytics.summary.refundedOrdersCount > 0"
            class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400"
            title="Refunded orders are excluded from net profit"
          >
            {{ analytics.summary.refundedOrdersCount }} refunded
          </span>
          <span v-else class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
            AOV
          </span>
        </div>

        <div class="mt-1">
          <div v-if="isInitialLoading" class="h-8 w-28 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div>
          <div v-else class="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight">
            {{ formatMmk(analytics.summary.avgOrderValueMmk) }} <span class="text-sm font-semibold text-slate-500">Ks</span>
          </div>
        </div>

        <p class="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center justify-between">
          <span>{{ analytics.summary.deliveredOrdersCount }} completed orders</span>
          <i class="pi pi-chart-bar text-cyan-500/60 text-sm"></i>
        </p>
      </div>
    </div>

    <!-- Interactive Visual Charts Section (Grid: Left 2 cols, Right 1 col) -->
    <div
      class="grid grid-cols-1 lg:grid-cols-3 gap-6 transition-opacity duration-200"
      :class="{ 'opacity-60 pointer-events-none': isFiltering }"
    >
      <!-- Left: Revenue vs Cost vs Profit Trend Chart -->
      <div class="lg:col-span-2">
        <AnalyticsTrendChart
          :data="analytics.trend"
          :period-label="analytics.periodLabel"
        />
      </div>

      <!-- Right: Profit by Product (Donut / Circle Chart) -->
      <div class="lg:col-span-1">
        <AnalyticsCategoryDonut
          :products="analytics.products"
          :categories="analytics.categories"
          :total-profit-mmk="analytics.summary.grossProfitMmk"
        />
      </div>
    </div>

    <!-- Bottom Section: Top 5 Most Profitable Products Table -->
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
      <!-- Section Header -->
      <div class="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <i class="pi pi-star text-amber-500"></i>
            <span>Top Profitable Products (အမြတ်အများဆုံး ထုတ်ကုန်များ)</span>
          </h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Ranked by total net profit contribution during the selected timeframe
          </p>
        </div>

        <span class="text-xs text-slate-400">
          Showing top {{ analytics.topProducts.length }} items
        </span>
      </div>

      <!-- Table Viewport -->
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse text-sm">
          <thead class="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800">
            <tr class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <th class="py-3 px-4 w-16 text-center">Rank</th>
              <th class="py-3 px-4">Product Name</th>
              <th class="py-3 px-4">Category</th>
              <th class="py-3 px-4 text-center">Units Sold</th>
              <th class="py-3 px-4 text-right">Revenue</th>
              <th class="py-3 px-4 text-right">Supplier Cost</th>
              <th class="py-3 px-4 text-right">Net Profit</th>
              <th class="py-3 px-4 text-right">Margin %</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            <!-- Loading Skeletons -->
            <template v-if="isInitialLoading">
              <tr v-for="n in 5" :key="'skel-' + n" class="animate-pulse">
                <td class="py-3.5 px-4 text-center"><div class="h-4 w-6 mx-auto bg-slate-200 dark:bg-slate-800 rounded"></div></td>
                <td class="py-3.5 px-4"><div class="h-4 w-36 bg-slate-200 dark:bg-slate-800 rounded"></div></td>
                <td class="py-3.5 px-4"><div class="h-4 w-24 bg-slate-200 dark:bg-slate-800 rounded"></div></td>
                <td class="py-3.5 px-4 text-center"><div class="h-4 w-12 mx-auto bg-slate-200 dark:bg-slate-800 rounded"></div></td>
                <td class="py-3.5 px-4 text-right"><div class="h-4 w-20 ml-auto bg-slate-200 dark:bg-slate-800 rounded"></div></td>
                <td class="py-3.5 px-4 text-right"><div class="h-4 w-20 ml-auto bg-slate-200 dark:bg-slate-800 rounded"></div></td>
                <td class="py-3.5 px-4 text-right"><div class="h-4 w-24 ml-auto bg-slate-200 dark:bg-slate-800 rounded"></div></td>
                <td class="py-3.5 px-4 text-right"><div class="h-4 w-16 ml-auto bg-slate-200 dark:bg-slate-800 rounded"></div></td>
              </tr>
            </template>

            <!-- Empty State -->
            <tr v-else-if="analytics.topProducts.length === 0">
              <td colspan="8" class="py-12 text-center text-slate-400">
                <div class="flex flex-col items-center justify-center max-w-sm mx-auto">
                  <div class="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-2">
                    <i class="pi pi-box text-xl"></i>
                  </div>
                  <h4 class="text-sm font-semibold text-slate-700 dark:text-slate-300">No Sales Recorded</h4>
                  <p class="text-xs text-slate-400 mt-1">
                    Products with delivered orders in this timeframe will rank here
                  </p>
                </div>
              </td>
            </tr>

            <!-- Product Rows -->
            <tr
              v-else
              v-for="(prod, idx) in analytics.topProducts"
              :key="'prod-' + prod.productId"
              class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
            >
              <!-- Rank with Gold/Silver/Bronze badges -->
              <td class="py-3 px-4 text-center">
                <span
                  v-if="idx === 0"
                  class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold text-xs ring-1 ring-amber-500/30"
                >
                  🥇
                </span>
                <span
                  v-else-if="idx === 1"
                  class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-400/20 text-slate-600 dark:text-slate-300 font-bold text-xs ring-1 ring-slate-400/30"
                >
                  🥈
                </span>
                <span
                  v-else-if="idx === 2"
                  class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-700/20 text-amber-700 dark:text-amber-500 font-bold text-xs ring-1 ring-amber-700/30"
                >
                  🥉
                </span>
                <span v-else class="text-xs font-semibold text-slate-400 font-mono">
                  #{{ idx + 1 }}
                </span>
              </td>

              <!-- Product Name -->
              <td class="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                {{ prod.productName }}
              </td>

              <!-- Category -->
              <td class="py-3 px-4">
                <span class="px-2 py-0.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  {{ prod.categoryName }}
                </span>
              </td>

              <!-- Units Sold -->
              <td class="py-3 px-4 text-center font-mono font-semibold text-slate-700 dark:text-slate-300">
                {{ prod.unitsSold }}
              </td>

              <!-- Revenue -->
              <td class="py-3 px-4 text-right font-mono font-medium text-slate-700 dark:text-slate-300">
                {{ formatMmk(prod.revenueMmk) }} Ks
              </td>

              <!-- Supplier Cost -->
              <td class="py-3 px-4 text-right font-mono text-slate-500 dark:text-slate-400">
                {{ formatMmk(prod.costMmk) }} Ks
              </td>

              <!-- Net Profit (Emerald) -->
              <td class="py-3 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                +{{ formatMmk(prod.profitMmk) }} Ks
              </td>

              <!-- Margin % Badge -->
              <td class="py-3 px-4 text-right">
                <span
                  class="px-2 py-0.5 rounded-md text-xs font-bold font-mono"
                  :class="prod.marginPct >= 30
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : prod.marginPct >= 15
                    ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400'
                    : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'"
                >
                  {{ prod.marginPct }}%
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from '~/composables/useToast'
import { useAuth } from '~/composables/useAuth'
import { usePermission } from '~/composables/usePermission'
import {
  formatMyanmarDateTime,
  formatMyanmarDate,
  getMyanmarDateString,
  getTodayMyanmarDate,
  matchesMyanmarDateFilter,
  type DateFilterPreset,
} from '~/utils/date'

const router = useRouter()
const toast = useToast()
const { getAuthHeaders } = useAuth()
const { can } = usePermission()
const canRefund = computed(() => can('orders.refund'))
const canResend = computed(() => can('orders.resend'))

const isLoading = ref(true)
const isRefreshing = ref(false)
const isFiltering = ref(false)

interface OrderRecord {
  id: string
  publicOrderNo: string
  externalOrderId: string
  status: 'DELIVERED' | 'PROCESSING_SUPPLIER' | 'CANCELLED' | 'REFUNDED'
  paymentSource: 'WALLET' | 'DIRECT'
  totalAmountMmk: number
  totalCostUsd: string
  createdAt: string
  rawDate: string
  customer: {
    id: number
    telegramId: string
    firstName: string
    username?: string
  }
  items: Array<{
    id: number
    productName: string
    quantity: number
    unitPriceMmk: number
    subtotalMmk: number
    deliveryType: string
  }>
  delivery?: {
    deliveredAt: string
    deliveryType: string
    credentialsText: string
  }
}

const searchQuery = ref('')
const debouncedSearch = ref('')
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

watch(searchQuery, (newVal) => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => {
    debouncedSearch.value = newVal
  }, 250)
})

const selectedStatus = ref('ALL')
const isDetailModalOpen = ref(false)
const selectedOrder = ref<OrderRecord | null>(null)
const copiedId = ref<string | null>(null)
const isRefunding = ref(false)
const isResending = ref(false)

const ordersList = ref<OrderRecord[]>([])
let ordersPollInterval: ReturnType<typeof setInterval> | null = null

function cleanCredentialsText(raw: any): string {
  if (!raw) return ''
  let val = raw
  if (typeof val === 'string') {
    const trimmed = val.trim()
    if (
      (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"'))
    ) {
      try {
        val = JSON.parse(trimmed)
      } catch {}
    }
  }
  if (Array.isArray(val)) {
    return val
      .map((item) => (typeof item === 'string' ? item.replace(/^"+|"+$/g, '').trim() : JSON.stringify(item)))
      .filter(Boolean)
      .join('\n')
  }
  if (typeof val === 'object' && val !== null) {
    return JSON.stringify(val, null, 2)
  }
  let res = String(val).trim()
  if (res.startsWith('"') && res.endsWith('"') && res.length >= 2) {
    try {
      res = JSON.parse(res)
    } catch {
      res = res.slice(1, -1)
    }
  }
  return res
}

async function fetchOrders(isSilent = false) {
  if (!isSilent) {
    if (ordersList.value.length > 0) {
      isFiltering.value = true
    } else {
      isLoading.value = true
    }
  }
  try {
    const res: any = await $fetch('/api/admin/orders', {
      headers: getAuthHeaders(),
    })

    if (res.ok && Array.isArray(res.orders)) {
      ordersList.value = res.orders.map((o: any) => ({
        id: o.orderId || o.id,
        publicOrderNo: o.id || o.publicOrderNo,
        externalOrderId: `XPRO-${o.id}`,
        status: o.status === 'DELIVERED' ? 'DELIVERED' : o.status === 'REFUNDED' ? 'REFUNDED' : 'PROCESSING_SUPPLIER',
        paymentSource: 'WALLET',
        totalAmountMmk: o.totalMmk || 0,
        totalCostUsd: '0.00',
        createdAt: formatMyanmarDateTime(o.date),
        rawDate: o.date || new Date().toISOString(),
        customer: {
          id: o.telegramId ? parseInt(o.telegramId, 10) : 1,
          telegramId: o.telegramId || '',
          firstName: o.user || 'Customer',
          username: o.user?.startsWith('@') ? o.user.replace('@', '') : o.user,
        },
        items: [
          {
            id: 1,
            productName: o.product || 'Digital Product',
            quantity: o.qty || 1,
            unitPriceMmk: o.totalMmk || 0,
            subtotalMmk: o.totalMmk || 0,
            deliveryType: 'CREDENTIALS',
          },
        ],
        delivery: {
          deliveredAt: o.date || 'Instant',
          deliveryType: 'CREDENTIALS',
          credentialsText: cleanCredentialsText(o.delivery),
        },
      }))
    }
  } catch (err: any) {
    if (!isSilent) {
      toast.error('Failed to load orders: ' + (err.message || 'Network error'))
    }
  } finally {
    if (!isSilent) {
      isLoading.value = false
      isFiltering.value = false
    }
    isRefreshing.value = false
  }
}

async function refreshOrders(isSilent = false) {
  isRefreshing.value = true
  await fetchOrders(isSilent)
}

onMounted(() => {
  fetchOrders(false)
  ordersPollInterval = setInterval(() => {
    fetchOrders(true)
  }, 4000)
})

onUnmounted(() => {
  if (ordersPollInterval) clearInterval(ordersPollInterval)
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
})

// Date Filter State
const selectedDateFilter = ref<DateFilterPreset>('ALL')
const customDateFilter = ref(getTodayMyanmarDate())

const dateFilterLabel = computed(() => {
  switch (selectedDateFilter.value) {
    case 'TODAY':
      return 'Today'
    case 'YESTERDAY':
      return 'Yesterday'
    case 'LAST_7_DAYS':
      return 'Last 7 Days'
    case 'THIS_MONTH':
      return 'This Month'
    case 'CUSTOM':
      return customDateFilter.value ? formatMyanmarDate(customDateFilter.value) : 'Custom Date'
    default:
      return 'All Time'
  }
})

// Orders matching the selected date filter (ignoring status tab, to compute period statistics)
const dateFilteredOrders = computed(() => {
  if (selectedDateFilter.value === 'ALL') return ordersList.value
  return ordersList.value.filter((o) =>
    matchesMyanmarDateFilter(o.rawDate, selectedDateFilter.value, customDateFilter.value)
  )
})

// Dynamic metrics for the selected date filter period
const periodDeliveredOrders = computed(() =>
  dateFilteredOrders.value.filter((o) => o.status === 'DELIVERED')
)
const periodDeliveredCount = computed(() => periodDeliveredOrders.value.length)
const periodRevenueMmk = computed(() =>
  periodDeliveredOrders.value.reduce((sum, o) => sum + o.totalAmountMmk, 0)
)
const periodTotalOrdersCount = computed(() => dateFilteredOrders.value.length)

// Global computed statistics
const totalOrdersCount = computed(() => ordersList.value.length)
const deliveredCount = computed(() => ordersList.value.filter((o) => o.status === 'DELIVERED').length)
const processingCount = computed(() => ordersList.value.filter((o) => o.status === 'PROCESSING_SUPPLIER').length)
const refundedCount = computed(() => ordersList.value.filter((o) => o.status === 'REFUNDED').length)
const totalRevenueMmk = computed(() =>
  ordersList.value
    .filter((o) => o.status === 'DELIVERED')
    .reduce((sum, o) => sum + o.totalAmountMmk, 0)
)

// Filtered orders list sorted newest first
const filteredOrders = computed(() => {
  let list = ordersList.value

  // Status filter
  if (selectedStatus.value !== 'ALL') {
    list = list.filter((order) => order.status === selectedStatus.value)
  }

  // Date filter
  if (selectedDateFilter.value !== 'ALL') {
    list = list.filter((order) =>
      matchesMyanmarDateFilter(order.rawDate, selectedDateFilter.value, customDateFilter.value)
    )
  }

  // Search query
  if (debouncedSearch.value.trim()) {
    const q = debouncedSearch.value.toLowerCase().trim()
    list = list.filter((order) => {
      const matchNo = order.publicOrderNo.toLowerCase().includes(q)
      const matchName = order.customer.firstName.toLowerCase().includes(q)
      const matchUser = order.customer.username?.toLowerCase().includes(q)
      const matchTg = order.customer.telegramId?.toLowerCase().includes(q)
      const matchItem = order.items.some((i) => i.productName.toLowerCase().includes(q))
      return matchNo || matchName || matchUser || matchTg || matchItem
    })
  }

  // Newest first sorting
  return [...list].sort((a, b) => {
    const timeA = a.rawDate ? new Date(a.rawDate).getTime() : 0
    const timeB = b.rawDate ? new Date(b.rawDate).getTime() : 0
    if (timeB !== timeA) return timeB - timeA
    return (b.id || '').localeCompare(a.id || '')
  })
})

// Pagination state
const currentPage = ref(1)
const pageSize = ref(10)

watch([debouncedSearch, selectedStatus, selectedDateFilter, customDateFilter, pageSize], () => {
  currentPage.value = 1
})

const totalFilteredCount = computed(() => filteredOrders.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalFilteredCount.value / pageSize.value)))

const paginatedOrders = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredOrders.value.slice(start, start + pageSize.value)
})

const showingRange = computed(() => {
  if (totalFilteredCount.value === 0) return 'Showing 0-0 of 0'
  const start = (currentPage.value - 1) * pageSize.value + 1
  const end = Math.min(start + pageSize.value - 1, totalFilteredCount.value)
  return `Showing ${start}-${end} of ${totalFilteredCount.value}`
})

const displayedPages = computed(() => {
  const total = totalPages.value
  const current = currentPage.value
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  const pages: number[] = []
  if (current <= 4) {
    for (let i = 1; i <= 5; i++) pages.push(i)
    pages.push(-1)
    pages.push(total)
  } else if (current >= total - 3) {
    pages.push(1)
    pages.push(-1)
    for (let i = total - 4; i <= total; i++) pages.push(i)
  } else {
    pages.push(1)
    pages.push(-1)
    pages.push(current - 1)
    pages.push(current)
    pages.push(current + 1)
    pages.push(-1)
    pages.push(total)
  }
  return pages
})

function goToPage(p: number) {
  if (p >= 1 && p <= totalPages.value) {
    currentPage.value = p
  }
}

function openDetailModal(order: OrderRecord, event?: Event) {
  if (event) event.stopPropagation()
  selectedOrder.value = order
  isDetailModalOpen.value = true
}

function navigateToCustomer(telegramId?: string, customerName?: string, event?: Event) {
  if (event) event.stopPropagation()
  const target = telegramId || customerName
  if (target) {
    router.push(`/customers/${target}`)
  }
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

function getInitial(name: string): string {
  if (!name) return 'C'
  const clean = name.replace(/^@/, '').trim()
  return clean.charAt(0).toUpperCase() || 'C'
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US').format(amount) + ' Ks'
}

async function resendCredentials(order: OrderRecord) {
  if (isResending.value || isRefunding.value) return
  isResending.value = true

  try {
    const res: any = await $fetch(`/api/admin/orders/${order.publicOrderNo || order.id}/resend`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })

    if (res && res.ok) {
      toast.success(
        `Digital credentials for ${order.publicOrderNo} successfully re-sent to ${order.customer.username ? '@' + order.customer.username : order.customer.firstName} on Telegram!`,
        'Credentials Re-sent'
      )
    } else {
      toast.error('Re-send failed: ' + (res?.error || 'Server error'))
    }
  } catch (err: any) {
    toast.error('Re-send failed: ' + (err.message || 'Network error'))
  } finally {
    isResending.value = false
  }
}

async function refundToWallet(order: OrderRecord) {
  if (isRefunding.value || isResending.value) return
  isRefunding.value = true

  try {
    const res: any = await $fetch(`/api/admin/orders/${order.publicOrderNo || order.id}/refund`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: {
        reason: 'Customer Support Refund by Admin',
      },
    })

    if (res && res.ok) {
      order.status = 'REFUNDED'
      toast.warn(
        `Order ${order.publicOrderNo} refunded! +${order.totalAmountMmk.toLocaleString()} Ks credited back to ${order.customer.firstName}'s Wallet. Customer notified on Telegram.`,
        'Refund Complete'
      )
      await fetchOrders(true)
    } else {
      toast.error('Refund failed: ' + (res?.error || 'Server error'))
    }
  } catch (err: any) {
    toast.error('Refund failed: ' + (err.message || 'Network error'))
  } finally {
    isRefunding.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Page Header & KPIs -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
          <i class="pi pi-shopping-bag text-indigo-600 dark:text-indigo-400"></i>
          <span>Product Orders & Fulfillment</span>
          <span class="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            1-Click Wallet Purchases
          </span>
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Instant digital product orders purchased with customer Wallet balance. Account credentials and activation keys are delivered automatically in real-time.
        </p>
      </div>

      <!-- Quick Status Badges -->
      <div class="flex flex-wrap items-center gap-2.5">
        <div class="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-sm">
          <span class="relative flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span>Real-time Sync</span>
        </div>

        <div class="px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-2 shadow-sm">
          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Instant Delivery Rate: 100%</span>
        </div>

        <button
          type="button"
          @click="refreshOrders(false)"
          :disabled="isRefreshing"
          class="p-2 rounded-xl text-xs border border-slate-200 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all shrink-0"
          title="Refresh orders manually"
        >
          <i class="pi pi-sync text-xs" :class="{ 'animate-spin': isRefreshing }"></i>
        </button>
      </div>
    </div>

    <!-- Sleek Compact Executive KPI Strip -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <!-- 1. Delivered Orders -->
      <div class="p-3 sm:px-4 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-2xs flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center text-sm shrink-0">
          <i class="pi pi-check-circle"></i>
        </div>
        <div class="min-w-0">
          <div class="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider truncate">
            Delivered ({{ dateFilterLabel }})
          </div>
          <div class="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
            {{ periodDeliveredCount }} <span class="text-xs font-normal text-slate-400">/ {{ periodTotalOrdersCount }} Orders</span>
          </div>
        </div>
      </div>

      <!-- 2. Wallet Sales Revenue -->
      <div class="p-3 sm:px-4 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-2xs flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 dark:text-indigo-400 flex items-center justify-center text-sm shrink-0">
          <i class="pi pi-wallet"></i>
        </div>
        <div class="min-w-0">
          <div class="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider truncate">
            Sales Revenue ({{ dateFilterLabel }})
          </div>
          <div class="text-sm sm:text-base font-bold text-indigo-600 dark:text-indigo-400 font-mono truncate">
            {{ formatCurrency(periodRevenueMmk) }}
          </div>
        </div>
      </div>

      <!-- 3. Total Orders in Period -->
      <div class="p-3 sm:px-4 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-2xs flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center text-sm shrink-0">
          <i class="pi pi-shopping-bag"></i>
        </div>
        <div class="min-w-0">
          <div class="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider truncate">
            Total Orders ({{ dateFilterLabel }})
          </div>
          <div class="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
            {{ periodTotalOrdersCount }} Orders
          </div>
        </div>
      </div>

      <!-- 4. Fulfillment Speed -->
      <div class="p-3 sm:px-4 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-2xs flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-500 flex items-center justify-center text-sm shrink-0">
          <i class="pi pi-bolt"></i>
        </div>
        <div class="min-w-0">
          <div class="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider truncate">Fulfillment Speed</div>
          <div class="text-sm font-semibold text-emerald-500 flex items-center gap-1.5 truncate">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>&lt; 1 sec (Instant)</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Integrated Unified Orders Table Card (No awkward floating detached bar) -->
    <div class="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col overflow-hidden">
      <!-- Integrated Filter & Date Toolbar -->
      <div class="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
        <!-- Row 1: Status Tabs & Search Input -->
        <div class="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <!-- Status Tabs -->
          <div class="flex items-center gap-1.5 overflow-x-auto text-xs font-semibold scrollbar-none">
            <button
              type="button"
              @click="selectedStatus = 'ALL'"
              :class="selectedStatus === 'ALL' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'"
              class="px-3.5 py-1.5 rounded-xl transition-colors duration-150 shrink-0 font-semibold cursor-pointer"
            >
              All Orders ({{ dateFilteredOrders.length }})
            </button>

            <button
              type="button"
              @click="selectedStatus = 'DELIVERED'"
              :class="selectedStatus === 'DELIVERED' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'"
              class="px-3.5 py-1.5 rounded-xl transition-colors duration-150 flex items-center gap-1.5 shrink-0 font-semibold cursor-pointer"
            >
              <i class="pi pi-check text-[10px]"></i>
              <span>Delivered ({{ periodDeliveredCount }})</span>
            </button>

            <button
              type="button"
              @click="selectedStatus = 'PROCESSING_SUPPLIER'"
              :class="selectedStatus === 'PROCESSING_SUPPLIER' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'"
              class="px-3.5 py-1.5 rounded-xl transition-colors duration-150 flex items-center gap-1.5 shrink-0 font-semibold cursor-pointer"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
              <span>Processing ({{ processingCount }})</span>
            </button>

            <button
              type="button"
              @click="selectedStatus = 'REFUNDED'"
              :class="selectedStatus === 'REFUNDED' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'"
              class="px-3.5 py-1.5 rounded-xl transition-colors duration-150 shrink-0 font-semibold cursor-pointer"
            >
              Refunded ({{ refundedCount }})
            </button>
          </div>

          <!-- Search Input -->
          <div class="relative w-full sm:w-64 shrink-0">
            <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search Order #, customer, item..."
              class="w-full pl-8 pr-7 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/70 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            <button
              v-if="searchQuery"
              @click="searchQuery = ''"
              type="button"
              class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <i class="pi pi-times text-[10px]"></i>
            </button>
          </div>
        </div>

        <!-- Row 2: Date Filter Controls (Presets + Custom Date Picker) -->
        <div class="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/60 text-xs">
          <!-- Date Presets & Custom Picker -->
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mr-1 flex items-center gap-1">
              <i class="pi pi-calendar text-[10px]"></i>
              <span>Date:</span>
            </span>

            <div class="flex items-center p-0.5 bg-slate-100 dark:bg-slate-950/70 rounded-xl border border-slate-200/80 dark:border-slate-800">
              <button
                type="button"
                @click="selectedDateFilter = 'ALL'"
                :class="selectedDateFilter === 'ALL' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold shadow-xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'"
                class="px-2.5 py-1 rounded-lg text-xs transition-colors cursor-pointer"
              >
                All Time
              </button>
              <button
                type="button"
                @click="selectedDateFilter = 'TODAY'"
                :class="selectedDateFilter === 'TODAY' ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 font-semibold shadow-xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'"
                class="px-2.5 py-1 rounded-lg text-xs transition-colors cursor-pointer"
              >
                Today
              </button>
              <button
                type="button"
                @click="selectedDateFilter = 'YESTERDAY'"
                :class="selectedDateFilter === 'YESTERDAY' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold shadow-xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'"
                class="px-2.5 py-1 rounded-lg text-xs transition-colors cursor-pointer"
              >
                Yesterday
              </button>
              <button
                type="button"
                @click="selectedDateFilter = 'LAST_7_DAYS'"
                :class="selectedDateFilter === 'LAST_7_DAYS' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold shadow-xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'"
                class="px-2.5 py-1 rounded-lg text-xs transition-colors cursor-pointer"
              >
                Last 7 Days
              </button>
              <button
                type="button"
                @click="selectedDateFilter = 'THIS_MONTH'"
                :class="selectedDateFilter === 'THIS_MONTH' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold shadow-xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'"
                class="px-2.5 py-1 rounded-lg text-xs transition-colors cursor-pointer"
              >
                This Month
              </button>
            </div>

            <!-- Custom Date Picker matching Image 3 -->
            <div class="relative flex items-center">
              <i class="pi pi-calendar absolute left-2.5 text-slate-400 text-xs pointer-events-none"></i>
              <input
                type="date"
                v-model="customDateFilter"
                @change="selectedDateFilter = 'CUSTOM'"
                class="pl-8 pr-2.5 py-1 rounded-xl text-xs bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-700/70 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
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

          <!-- Active Filter Indicator -->
          <div class="text-[11px] text-slate-400 flex items-center gap-1.5">
            <span>Period:</span>
            <span class="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 font-semibold border border-indigo-500/20">
              {{ dateFilterLabel }}
            </span>
            <span v-if="dateFilteredOrders.length !== ordersList.length" class="text-slate-500">
              ({{ dateFilteredOrders.length }} of {{ ordersList.length }} orders)
            </span>
          </div>
        </div>
      </div>

      <!-- Shimmer Loading Bar -->
      <div class="h-0.5 w-full bg-slate-100 dark:bg-slate-800/40 overflow-hidden relative">
        <div
          v-if="isFiltering"
          class="h-full bg-indigo-500 animate-indeterminate-bar rounded-full"
        ></div>
      </div>

      <!-- Scrollable Table Viewport -->
      <div class="overflow-x-auto overflow-y-auto max-h-[calc(100vh-320px)] min-h-[380px] relative scrollbar-thin">
        <table class="w-full text-left border-collapse text-sm">
          <thead class="sticky top-0 z-10 bg-slate-50 dark:bg-[#0e172a] shadow-sm border-b border-slate-200 dark:border-slate-800">
            <tr class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <th class="py-3 px-4">Order ID</th>
              <th class="py-3 px-4 w-60 max-w-[240px]">Customer</th>
              <th class="py-3 px-4">Items / Product</th>
              <th class="py-3 px-4">Payment Method</th>
              <th class="py-3 px-4">Total Amount</th>
              <th class="py-3 px-4">Delivery Status</th>
              <th class="py-3 px-4">Date</th>
              <th class="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody
            class="divide-y divide-slate-100 dark:divide-slate-800/60 text-sm transition-opacity duration-300 ease-in-out"
            :class="{ 'opacity-40 pointer-events-none': isFiltering }"
          >
            <!-- Skeleton Loading State -->
            <template v-if="isLoading">
              <tr v-for="n in 5" :key="'order-skel-' + n" class="animate-pulse">
                <td class="py-3.5 px-4"><div class="h-4 w-24 rounded bg-slate-200 dark:bg-slate-800"></div></td>
                <td class="py-3.5 px-4 w-60 max-w-[240px]">
                  <div class="flex items-center gap-2.5">
                    <div class="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 shrink-0"></div>
                    <div class="space-y-1.5 flex-1">
                      <div class="h-3.5 w-24 rounded bg-slate-200 dark:bg-slate-800"></div>
                      <div class="h-2.5 w-16 rounded bg-slate-200 dark:bg-slate-800"></div>
                    </div>
                  </div>
                </td>
                <td class="py-3.5 px-4"><div class="h-4 w-32 rounded bg-slate-200 dark:bg-slate-800"></div></td>
                <td class="py-3.5 px-4"><div class="h-4 w-20 rounded bg-slate-200 dark:bg-slate-800"></div></td>
                <td class="py-3.5 px-4"><div class="h-4 w-16 rounded bg-slate-200 dark:bg-slate-800"></div></td>
                <td class="py-3.5 px-4"><div class="h-5 w-20 rounded-full bg-slate-200 dark:bg-slate-800"></div></td>
                <td class="py-3.5 px-4"><div class="h-3.5 w-16 rounded bg-slate-200 dark:bg-slate-800"></div></td>
                <td class="py-3.5 px-4 text-right"><div class="h-7 w-20 rounded-xl bg-slate-200 dark:bg-slate-800 ml-auto"></div></td>
              </tr>
            </template>

            <!-- Empty State -->
            <tr v-else-if="paginatedOrders.length === 0">
              <td colspan="8" class="py-14 text-center">
                <div class="flex flex-col items-center justify-center max-w-sm mx-auto">
                  <div class="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 text-2xl mb-3">
                    <i class="pi pi-shopping-bag"></i>
                  </div>
                  <h3 class="text-sm font-semibold text-slate-800 dark:text-slate-200">No Orders Found</h3>
                  <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {{ searchQuery ? 'Try adjusting your search query or clear filters' : 'Purchased orders will appear here in real-time' }}
                  </p>
                  <button
                    v-if="searchQuery || selectedStatus !== 'ALL' || selectedDateFilter !== 'ALL'"
                    type="button"
                    @click="searchQuery = ''; selectedStatus = 'ALL'; selectedDateFilter = 'ALL'"
                    class="mt-4 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm cursor-pointer"
                  >
                    Reset All Filters
                  </button>
                </div>
              </td>
            </tr>

            <!-- Order Rows -->
            <template v-else>
              <tr
                v-for="order in paginatedOrders"
                :key="order.id"
                @click="openDetailModal(order, $event)"
                class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group"
              >
                <!-- Order ID -->
                <td class="py-3 px-4 font-mono font-medium text-slate-900 dark:text-slate-100">
                  <div class="flex items-center gap-1.5">
                    <span class="text-indigo-600 dark:text-indigo-400 font-semibold">{{ order.publicOrderNo }}</span>
                    <button
                      type="button"
                      @click="copyToClipboard(order.publicOrderNo, order.id, $event)"
                      class="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                      :title="'Copy Order No: ' + order.publicOrderNo"
                    >
                      <i :class="copiedId === order.id ? 'pi pi-check text-emerald-500 text-[10px]' : 'pi pi-copy text-[10px]'"></i>
                    </button>
                  </div>
                </td>

                <!-- Customer (Constrained with initial avatar & clean truncation) -->
                <td class="py-3 px-4 w-60 max-w-[240px]">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div
                      @click="navigateToCustomer(order.customer.telegramId, order.customer.firstName, $event)"
                      class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0 cursor-pointer hover:scale-105 transition-transform"
                      :title="'View ' + order.customer.firstName + ' in Customers'"
                    >
                      {{ getInitial(order.customer.firstName) }}
                    </div>
                    <div class="min-w-0 flex-1 overflow-hidden">
                      <div
                        @click="navigateToCustomer(order.customer.telegramId, order.customer.firstName, $event)"
                        class="font-semibold text-slate-900 dark:text-white truncate max-w-[170px] hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer transition-colors"
                        :title="order.customer.firstName"
                      >
                        {{ order.customer.firstName }}
                      </div>
                      <div class="flex items-center gap-1.5 mt-0.5 text-xs text-slate-500 truncate">
                        <span v-if="order.customer.username" class="text-emerald-600 dark:text-emerald-400 font-medium truncate max-w-[80px]" :title="'@' + order.customer.username">
                          @{{ order.customer.username }}
                        </span>
                        <span
                          v-if="order.customer.telegramId"
                          class="inline-flex items-center gap-1 font-mono text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 truncate max-w-[100px]"
                          @click.stop="copyToClipboard(order.customer.telegramId, 'tg-ord-' + order.id, $event)"
                          :title="'Click to copy ID: ' + order.customer.telegramId"
                        >
                          <span class="truncate">ID: {{ order.customer.telegramId }}</span>
                          <i :class="copiedId === 'tg-ord-' + order.id ? 'pi pi-check text-emerald-500' : 'pi pi-copy text-[10px]'"></i>
                        </span>
                      </div>
                    </div>
                  </div>
                </td>

                <!-- Items / Product -->
                <td class="py-3 px-4 max-w-xs">
                  <div v-for="item in order.items" :key="item.id" class="flex items-center gap-1.5 truncate" :title="item.productName">
                    <span class="font-medium text-slate-800 dark:text-slate-200 truncate">{{ item.productName }}</span>
                    <span class="text-xs text-slate-400 font-bold shrink-0">x{{ item.quantity }}</span>
                    <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
                      {{ item.deliveryType }}
                    </span>
                  </div>
                </td>

                <!-- Payment Method -->
                <td class="py-3 px-4 whitespace-nowrap">
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                    <i class="pi pi-wallet text-xs"></i>
                    <span>Wallet Balance</span>
                  </span>
                </td>

                <!-- Total Amount -->
                <td class="py-3 px-4 whitespace-nowrap font-mono font-bold text-slate-900 dark:text-white">
                  {{ formatCurrency(order.totalAmountMmk) }}
                </td>

                <!-- Delivery Status -->
                <td class="py-3 px-4 whitespace-nowrap">
                  <span
                    v-if="order.status === 'DELIVERED'"
                    class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                  >
                    <i class="pi pi-check text-[10px]"></i>
                    <span>Delivered (Instant)</span>
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

                <!-- Date -->
                <td class="py-3 px-4 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400 font-mono">
                  {{ order.createdAt }}
                </td>

                <!-- Actions -->
                <td class="py-3 px-4 text-right whitespace-nowrap">
                  <button
                    type="button"
                    @click="openDetailModal(order, $event)"
                    class="px-3 py-1.5 rounded-xl text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 border border-indigo-500/20 transition-colors inline-flex items-center gap-1.5"
                  >
                    <i class="pi pi-key text-xs"></i>
                    <span>View Keys</span>
                  </button>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <!-- Unified Pagination Footer -->
      <div class="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
        <div>
          <span>{{ showingRange }}</span>
        </div>

        <div class="flex items-center gap-1.5">
          <!-- Prev Button -->
          <button
            type="button"
            @click="goToPage(currentPage - 1)"
            :disabled="currentPage === 1"
            class="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700/80 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors text-slate-700 dark:text-slate-300"
          >
            <i class="pi pi-chevron-left text-[10px]"></i>
          </button>

          <!-- Numbered Pages -->
          <template v-for="(p, idx) in displayedPages" :key="'p-' + idx">
            <span v-if="p === -1" class="px-1 text-slate-400">...</span>
            <button
              v-else
              type="button"
              @click="goToPage(p)"
              :class="currentPage === p ? 'bg-indigo-600 text-white font-bold' : 'border border-slate-200 dark:border-slate-700/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'"
              class="w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-colors"
            >
              {{ p }}
            </button>
          </template>

          <!-- Next Button -->
          <button
            type="button"
            @click="goToPage(currentPage + 1)"
            :disabled="currentPage === totalPages"
            class="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700/80 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors text-slate-700 dark:text-slate-300"
          >
            <i class="pi pi-chevron-right text-[10px]"></i>
          </button>

          <!-- Page Size Selector -->
          <select
            v-model="pageSize"
            class="ml-2 px-2.5 py-1 rounded-lg text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          >
            <option :value="10">10 / page</option>
            <option :value="20">20 / page</option>
            <option :value="50">50 / page</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Order Detail & Keys Modal (Teleported to body for 100% full-screen coverage with no gap!) -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="isDetailModalOpen && selectedOrder"
          class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          @click.self="isDetailModalOpen = false"
        >
          <div class="modal-card bg-white dark:bg-[#0e1726] border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <!-- Modal Header -->
            <div class="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div class="flex items-center gap-2.5">
                  <h3 class="text-lg font-bold text-slate-900 dark:text-white font-mono">
                    {{ selectedOrder.publicOrderNo }}
                  </h3>
                  <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {{ selectedOrder.status }}
                  </span>
                  <span class="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-500/10 text-indigo-400">
                    Paid via Wallet
                  </span>
                </div>
                <p class="text-xs text-slate-500 font-mono mt-0.5">Order Ref: {{ selectedOrder.id }}</p>
              </div>
              <button
                type="button"
                @click="isDetailModalOpen = false"
                class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center text-xs transition-colors"
              >
                <i class="pi pi-times"></i>
              </button>
            </div>

            <!-- Customer & Order Metadata Grid -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 text-xs">
              <div>
                <span class="text-slate-500 dark:text-slate-400 block">Customer:</span>
                <span class="font-semibold text-slate-800 dark:text-slate-200 truncate block">{{ selectedOrder.customer.firstName }}</span>
                <span class="text-slate-400 block font-mono text-[11px] truncate">{{ selectedOrder.customer.username ? `@${selectedOrder.customer.username}` : `TG: ${selectedOrder.customer.telegramId}` }}</span>
              </div>
              <div>
                <span class="text-slate-500 dark:text-slate-400 block">Date & Time:</span>
                <span class="font-semibold text-slate-800 dark:text-slate-200 block">{{ selectedOrder.createdAt }}</span>
              </div>
              <div>
                <span class="text-slate-500 dark:text-slate-400 block">Payment Method:</span>
                <span class="font-bold text-indigo-500 flex items-center gap-1">
                  <i class="pi pi-wallet text-xs"></i>
                  <span>Wallet Balance</span>
                </span>
              </div>
              <div>
                <span class="text-slate-500 dark:text-slate-400 block">Total Deducted:</span>
                <span class="font-bold text-slate-900 dark:text-white text-sm font-mono">{{ formatCurrency(selectedOrder.totalAmountMmk) }}</span>
              </div>
            </div>

            <!-- Items Table -->
            <div>
              <h4 class="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Purchased Digital Item</h4>
              <div class="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <table class="w-full text-left text-xs">
                  <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th class="py-2.5 px-3">Product Name</th>
                      <th class="py-2.5 px-3">Qty</th>
                      <th class="py-2.5 px-3">Unit Price</th>
                      <th class="py-2.5 px-3 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
                    <tr v-for="item in selectedOrder.items" :key="item.id">
                      <td class="py-2.5 px-3 font-medium text-slate-800 dark:text-slate-200">
                        {{ item.productName }}
                      </td>
                      <td class="py-2.5 px-3">{{ item.quantity }}</td>
                      <td class="py-2.5 px-3">{{ formatCurrency(item.unitPriceMmk) }}</td>
                      <td class="py-2.5 px-3 text-right font-semibold">{{ formatCurrency(item.subtotalMmk) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Delivered Credentials Card -->
            <div v-if="selectedOrder.delivery" class="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-2.5">
              <div class="flex items-center justify-between text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <span class="flex items-center gap-1.5">
                  <i class="pi pi-key text-sm"></i>
                  <span>Delivered Digital Goods (Credentials / Invite Link / License)</span>
                </span>
                <span class="text-[11px] font-mono text-emerald-500">{{ selectedOrder.delivery.deliveredAt }}</span>
              </div>
              <div class="relative">
                <pre class="p-3.5 bg-slate-950 text-emerald-400 rounded-xl font-mono text-xs overflow-x-auto select-all leading-relaxed">{{ selectedOrder.delivery.credentialsText }}</pre>
              </div>
              <div class="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                <span>Delivered instantly to customer on Telegram upon Wallet checkout.</span>
                <button
                  type="button"
                  @click="copyToClipboard(selectedOrder.delivery.credentialsText, 'credentials')"
                  class="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 font-semibold transition-colors flex items-center gap-1"
                >
                  <i :class="copiedId === 'credentials' ? 'pi pi-check text-emerald-400' : 'pi pi-copy text-[10px]'"></i>
                  <span>{{ copiedId === 'credentials' ? 'Copied' : 'Copy Credentials' }}</span>
                </button>
              </div>
            </div>

            <!-- Modal Footer Actions -->
            <div class="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                v-if="selectedOrder.status === 'DELIVERED' && canRefund"
                type="button"
                @click="refundToWallet(selectedOrder)"
                :disabled="isRefunding || isResending"
                class="px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <i v-if="isRefunding" class="pi pi-spinner animate-spin"></i>
                <i v-else class="pi pi-replay"></i>
                <span>{{ isRefunding ? 'Refunding to Wallet...' : `Refund ${formatCurrency(selectedOrder.totalAmountMmk)} to Wallet` }}</span>
              </button>
              <div v-else-if="selectedOrder.status === 'REFUNDED'" class="flex items-center gap-1.5 text-xs font-semibold text-rose-500">
                <i class="pi pi-info-circle text-xs"></i>
                <span>Refunded to Wallet</span>
              </div>
              <div v-else></div>

              <div class="flex items-center gap-2.5">
                <button
                  v-if="selectedOrder.delivery && selectedOrder.status === 'DELIVERED' && canResend"
                  type="button"
                  @click="resendCredentials(selectedOrder)"
                  :disabled="isResending || isRefunding"
                  class="px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  <i v-if="isResending" class="pi pi-spinner animate-spin"></i>
                  <i v-else class="pi pi-send"></i>
                  <span>{{ isResending ? 'Sending to Telegram...' : 'Re-send to Telegram' }}</span>
                </button>

                <button
                  type="button"
                  @click="isDetailModalOpen = false"
                  :disabled="isRefunding || isResending"
                  class="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors disabled:opacity-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
@keyframes indeterminate-bar {
  0% {
    transform: translateX(-100%);
    width: 35%;
  }
  50% {
    transform: translateX(100%);
    width: 60%;
  }
  100% {
    transform: translateX(300%);
    width: 35%;
  }
}

.animate-indeterminate-bar {
  animation: indeterminate-bar 1.2s infinite ease-in-out;
}
</style>

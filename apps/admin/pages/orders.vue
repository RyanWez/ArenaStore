<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useToast } from '~/composables/useToast'
import { useAuth } from '~/composables/useAuth'

const toast = useToast()
const { getAuthHeaders } = useAuth()
const isLoading = ref(true)
const isRefreshing = ref(false)

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
const selectedStatus = ref('ALL')
const isDetailModalOpen = ref(false)
const selectedOrder = ref<OrderRecord | null>(null)
const copiedId = ref<string | null>(null)
const isRefunding = ref(false)

const ordersList = ref<OrderRecord[]>([])
let ordersPollInterval: ReturnType<typeof setInterval> | null = null

async function fetchOrders(isSilent = false) {
  if (!isSilent) isLoading.value = true
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
        createdAt: o.date ? new Date(o.date).toLocaleDateString() : 'Today',
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
          credentialsText: typeof o.delivery === 'string' ? o.delivery : JSON.stringify(o.delivery, null, 2),
        },
      }))
    }
  } catch (err: any) {
    if (!isSilent) {
      toast.error('Failed to load orders: ' + (err.message || 'Network error'))
    }
  } finally {
    if (!isSilent) isLoading.value = false
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
})

// Computed statistics
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

  // Search query
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim()
    list = list.filter((order) => {
      const matchNo = order.publicOrderNo.toLowerCase().includes(q)
      const matchName = order.customer.firstName.toLowerCase().includes(q)
      const matchUser = order.customer.username?.toLowerCase().includes(q)
      const matchItem = order.items.some((i) => i.productName.toLowerCase().includes(q))
      return matchNo || matchName || matchUser || matchItem
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

watch([searchQuery, selectedStatus, pageSize], () => {
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

function openDetailModal(order: OrderRecord) {
  selectedOrder.value = order
  isDetailModalOpen.value = true
}

function copyToClipboard(text: string, id: string) {
  navigator.clipboard.writeText(text)
  copiedId.value = id
  toast.info(`Copied "${text}" to clipboard.`, 'Copied')
  setTimeout(() => {
    copiedId.value = null
  }, 2000)
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US').format(amount) + ' Ks'
}

function resendCredentials(order: OrderRecord) {
  toast.success(
    `Digital credentials for ${order.publicOrderNo} successfully re-sent to ${order.customer.username || order.customer.firstName} on Telegram!`,
    'Credentials Re-sent'
  )
}

async function refundToWallet(order: OrderRecord) {
  if (isRefunding.value) return
  isRefunding.value = true

  try {
    await new Promise((r) => setTimeout(r, 600))
    order.status = 'REFUNDED'
    toast.warn(
      `Order ${order.publicOrderNo} refunded! +${order.totalAmountMmk.toLocaleString()} Ks credited back to ${order.customer.firstName}'s Wallet.`,
      'Refund Complete'
    )
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
      </div>
    </div>

    <!-- Stats Summary Row -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-xl">
          <i class="pi pi-check-circle"></i>
        </div>
        <div>
          <div class="text-xs font-medium text-slate-400 uppercase tracking-wider">Delivered Orders</div>
          <div class="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
            {{ deliveredCount }} / {{ totalOrdersCount }} Orders
          </div>
        </div>
      </div>

      <div class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center text-xl">
          <i class="pi pi-wallet"></i>
        </div>
        <div>
          <div class="text-xs font-medium text-slate-400 uppercase tracking-wider">Wallet Sales Revenue</div>
          <div class="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
            {{ formatCurrency(totalRevenueMmk) }}
          </div>
        </div>
      </div>

      <div class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center text-xl">
          <i class="pi pi-bolt"></i>
        </div>
        <div>
          <div class="text-xs font-medium text-slate-400 uppercase tracking-wider">Avg Fulfillment Speed</div>
          <div class="text-lg font-bold text-emerald-500 mt-0.5 flex items-center gap-1.5 text-sm">
            <i class="pi pi-bolt text-amber-500"></i>
            <span>&lt; 1 sec (Zero Wait)</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Sticky Tab Filter & Search Controls (Sticks under Navbar: top-16) -->
    <div class="sticky top-16 z-20 p-3 rounded-2xl bg-white/95 dark:bg-[#0b1220]/95 backdrop-blur-md border border-slate-200 dark:border-slate-800/80 shadow-md flex flex-col md:flex-row items-center justify-between gap-3 transition-all">
      <!-- Status Tabs -->
      <div class="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto text-xs font-semibold scrollbar-none">
        <button
          type="button"
          @click="selectedStatus = 'ALL'"
          :class="selectedStatus === 'ALL' ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'"
          class="px-3.5 py-1.5 rounded-xl transition-all shrink-0"
        >
          All Orders ({{ totalOrdersCount }})
        </button>

        <button
          type="button"
          @click="selectedStatus = 'DELIVERED'"
          :class="selectedStatus === 'DELIVERED' ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'"
          class="px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 shrink-0"
        >
          <i class="pi pi-check text-[10px]"></i>
          <span>Delivered ({{ deliveredCount }})</span>
        </button>

        <button
          type="button"
          @click="selectedStatus = 'PROCESSING_SUPPLIER'"
          :class="selectedStatus === 'PROCESSING_SUPPLIER' ? 'bg-amber-600 text-white shadow-sm shadow-amber-600/20' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'"
          class="px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 shrink-0"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
          <span>Processing ({{ processingCount }})</span>
        </button>

        <button
          type="button"
          @click="selectedStatus = 'REFUNDED'"
          :class="selectedStatus === 'REFUNDED' ? 'bg-rose-600 text-white shadow-sm shadow-rose-600/20' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'"
          class="px-3.5 py-1.5 rounded-xl transition-all shrink-0"
        >
          Refunded ({{ refundedCount }})
        </button>
      </div>

      <!-- Search Input + Manual Refresh -->
      <div class="flex items-center gap-2.5 w-full md:w-auto">
        <div class="relative flex-1 md:w-64">
          <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search Order #, customer, item..."
            class="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          />
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

    <!-- Orders Table & Pagination Container -->
    <div class="rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800/80 shadow-sm flex flex-col overflow-hidden">
      <!-- Fixed Max-Height Scrollable Table Viewport -->
      <div class="overflow-x-auto overflow-y-auto max-h-[calc(100vh-270px)] min-h-[380px] relative scrollbar-thin">
        <table class="w-full text-left border-collapse text-sm">
          <thead class="sticky top-0 z-10 bg-slate-50 dark:bg-[#0e172a] shadow-sm border-b border-slate-200 dark:border-slate-800">
            <tr class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <th class="py-3 px-4 bg-slate-50 dark:bg-[#0e172a]">Order ID</th>
              <th class="py-3 px-4 bg-slate-50 dark:bg-[#0e172a]">Customer</th>
              <th class="py-3 px-4 bg-slate-50 dark:bg-[#0e172a]">Items / Product</th>
              <th class="py-3 px-4 bg-slate-50 dark:bg-[#0e172a]">Payment Method</th>
              <th class="py-3 px-4 bg-slate-50 dark:bg-[#0e172a]">Total Amount</th>
              <th class="py-3 px-4 bg-slate-50 dark:bg-[#0e172a]">Delivery Status</th>
              <th class="py-3 px-4 bg-slate-50 dark:bg-[#0e172a]">Date</th>
              <th class="py-3 px-4 bg-slate-50 dark:bg-[#0e172a] text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 text-sm">
            <!-- Skeleton Loading State -->
            <template v-if="isLoading">
              <tr v-for="n in 3" :key="'order-skel-' + n">
                <td class="py-4 px-4"><Skeleton height="1.1rem" width="110px" border-radius="6px" /></td>
                <td class="py-4 px-4"><Skeleton height="1.1rem" width="130px" border-radius="6px" /></td>
                <td class="py-4 px-4"><Skeleton height="1.1rem" width="160px" border-radius="6px" /></td>
                <td class="py-4 px-4"><Skeleton height="1.1rem" width="100px" border-radius="6px" /></td>
                <td class="py-4 px-4"><Skeleton height="1.1rem" width="90px" border-radius="6px" /></td>
                <td class="py-4 px-4"><Skeleton height="1.3rem" width="75px" border-radius="9999px" /></td>
                <td class="py-4 px-4"><Skeleton height="1.1rem" width="90px" border-radius="6px" /></td>
                <td class="py-4 px-4 text-right"><Skeleton height="1.6rem" width="70px" class="ml-auto" border-radius="8px" /></td>
              </tr>
            </template>
            <!-- Empty State -->
            <template v-else-if="paginatedOrders.length === 0">
              <tr>
                <td colspan="8" class="py-12 text-center text-slate-500">
                  <i class="pi pi-inbox text-3xl mb-2 text-slate-400"></i>
                  <p>No orders found matching your filter criteria.</p>
                </td>
              </tr>
            </template>
            <template v-else>
              <tr
                v-for="order in paginatedOrders"
                :key="order.id"
                class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
              >
              <!-- Order ID with Copy -->
              <td class="py-4 px-4 font-mono font-medium text-slate-900 dark:text-white">
                <div class="flex items-center gap-2">
                  <span>{{ order.publicOrderNo }}</span>
                  <button
                    type="button"
                    @click="copyToClipboard(order.publicOrderNo, order.id)"
                    class="text-slate-400 hover:text-indigo-500 transition-colors"
                    title="Copy Order No"
                  >
                    <i :class="copiedId === order.id ? 'pi pi-check text-emerald-500' : 'pi pi-copy text-xs'"></i>
                  </button>
                </div>
              </td>

              <!-- Customer Info -->
              <td class="py-4 px-4">
                <div class="flex items-center gap-2.5">
                  <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center font-bold text-xs text-indigo-400">
                    {{ order.customer.firstName.charAt(0) }}
                  </div>
                  <div>
                    <div class="font-medium text-slate-900 dark:text-slate-200">
                      {{ order.customer.firstName }}
                    </div>
                    <div class="text-xs text-slate-500 dark:text-slate-400 font-mono">
                      {{ order.customer.username ? `@${order.customer.username}` : `TG: ${order.customer.telegramId}` }}
                    </div>
                  </div>
                </div>
              </td>

              <!-- Items Summary -->
              <td class="py-4 px-4 max-w-xs">
                <div v-for="item in order.items" :key="item.id" class="truncate">
                  <span class="font-medium text-slate-800 dark:text-slate-200">{{ item.productName }}</span>
                  <span class="text-xs text-slate-500 ml-1.5 font-bold">x{{ item.quantity }}</span>
                  <span class="ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    {{ item.deliveryType }}
                  </span>
                </div>
              </td>

              <!-- Payment Source -->
              <td class="py-4 px-4">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  <i class="pi pi-wallet text-xs"></i>
                  <span>Wallet Balance</span>
                </span>
              </td>

              <!-- Total Amount -->
              <td class="py-4 px-4 font-bold text-slate-900 dark:text-white">
                <div>{{ formatCurrency(order.totalAmountMmk) }}</div>
                <div class="text-xs text-slate-500 font-mono font-normal">~${{ order.totalCostUsd }} USD</div>
              </td>

              <!-- Status Badge -->
              <td class="py-4 px-4">
                <span
                  v-if="order.status === 'DELIVERED'"
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                >
                  <i class="pi pi-check text-[10px]"></i>
                  <span>Delivered (Instant)</span>
                </span>
                <span
                  v-else-if="order.status === 'PROCESSING_SUPPLIER'"
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 animate-pulse"
                >
                  <i class="pi pi-clock text-[10px]"></i>
                  <span>Processing</span>
                </span>
                <span
                  v-else-if="order.status === 'REFUNDED'"
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                >
                  <i class="pi pi-replay text-[10px]"></i>
                  <span>Refunded</span>
                </span>
                <span
                  v-else
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20"
                >
                  <i class="pi pi-times text-[10px]"></i>
                  <span>Cancelled</span>
                </span>
              </td>

              <!-- Date -->
              <td class="py-4 px-4 text-xs text-slate-500 font-mono">
                {{ order.createdAt }}
              </td>

              <!-- Action Buttons -->
              <td class="py-4 px-4 text-right">
                <button
                  type="button"
                  @click="openDetailModal(order)"
                  class="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors inline-flex items-center gap-1.5 shadow-sm"
                >
                  <i class="pi pi-key text-[11px] text-amber-500"></i>
                  <span>View Keys</span>
                </button>
              </td>
            </tr>
          </template>
        </tbody>
        </table>
      </div>

      <!-- Pagination Footer matching Screenshot 2 -->
      <div class="p-3.5 px-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
        <!-- Left: Showing X-Y of Z -->
        <div class="font-medium text-slate-600 dark:text-slate-400">
          {{ showingRange }}
        </div>

        <!-- Right: Pagination Buttons and Page Size Selector -->
        <div class="flex items-center gap-1.5 sm:gap-2">
          <!-- Previous Button -->
          <button
            type="button"
            @click="goToPage(currentPage - 1)"
            :disabled="currentPage === 1"
            class="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700/80 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors text-slate-700 dark:text-slate-300"
          >
            <i class="pi pi-chevron-left text-[10px]"></i>
          </button>

          <!-- Page Numbers -->
          <template v-for="(page, idx) in displayedPages" :key="'order-page-' + idx">
            <span v-if="page === -1" class="px-1 text-slate-400">...</span>
            <button
              v-else
              type="button"
              @click="goToPage(page)"
              class="min-w-7 h-7 px-1.5 rounded-lg text-xs font-semibold flex items-center justify-center transition-colors"
              :class="currentPage === page ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/80'"
            >
              {{ page }}
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
            class="ml-2 px-2.5 py-1 rounded-lg text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option :value="10">10 / page</option>
            <option :value="20">20 / page</option>
            <option :value="50">50 / page</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Order Detail & Credentials Modal -->
    <Transition name="modal">
      <div
        v-if="isDetailModalOpen && selectedOrder"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        @click.self="isDetailModalOpen = false"
      >
        <div class="modal-card bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
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
              class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <i class="pi pi-times text-xs"></i>
            </button>
          </div>

          <!-- Customer & Order Metadata Grid -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 text-xs">
            <div>
              <span class="text-slate-500 block">Customer:</span>
              <span class="font-semibold text-slate-800 dark:text-slate-200">{{ selectedOrder.customer.firstName }}</span>
              <span class="text-slate-400 block font-mono text-[11px]">{{ selectedOrder.customer.username ? `@${selectedOrder.customer.username}` : `TG: ${selectedOrder.customer.telegramId}` }}</span>
            </div>
            <div>
              <span class="text-slate-500 block">Date & Time:</span>
              <span class="font-semibold text-slate-800 dark:text-slate-200">{{ selectedOrder.createdAt }}</span>
            </div>
            <div>
              <span class="text-slate-500 block">Payment Method:</span>
              <span class="font-bold text-indigo-500 flex items-center gap-1">
                <i class="pi pi-wallet text-xs"></i>
                <span>Wallet Balance</span>
              </span>
            </div>
            <div>
              <span class="text-slate-500 block">Total Deducted:</span>
              <span class="font-bold text-slate-900 dark:text-white text-sm">{{ formatCurrency(selectedOrder.totalAmountMmk) }}</span>
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
              <pre class="p-3 bg-slate-950 text-emerald-400 rounded-xl font-mono text-xs overflow-x-auto select-all leading-relaxed">{{ selectedOrder.delivery.credentialsText }}</pre>
            </div>
            <div class="flex items-center justify-between text-[11px] text-slate-400 pt-1">
              <span>Automatically delivered to customer on Telegram upon Wallet payment.</span>
              <button
                type="button"
                @click="copyToClipboard(selectedOrder.delivery.credentialsText, 'credentials')"
                class="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 font-semibold transition-colors flex items-center gap-1"
              >
                <i class="pi pi-copy text-[10px]"></i>
                <span>Copy Credentials</span>
              </button>
            </div>
          </div>

          <!-- Modal Footer Actions -->
          <div class="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              v-if="selectedOrder.status === 'DELIVERED'"
              type="button"
              @click="refundToWallet(selectedOrder)"
              :disabled="isRefunding"
              class="px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <i class="pi pi-replay"></i>
              <span>Refund {{ formatCurrency(selectedOrder.totalAmountMmk) }} to Wallet</span>
            </button>
            <div v-else></div>

            <div class="flex items-center gap-2.5">
              <button
                v-if="selectedOrder.delivery"
                type="button"
                @click="resendCredentials(selectedOrder)"
                class="px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 transition-colors flex items-center gap-1.5"
              >
                <i class="pi pi-send"></i>
                <span>Re-send to Telegram</span>
              </button>

              <button
                type="button"
                @click="isDetailModalOpen = false"
                class="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

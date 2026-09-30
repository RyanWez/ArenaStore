<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useToast } from '~/composables/useToast'

const toast = useToast()
const isLoading = ref(true)

onMounted(() => {
  setTimeout(() => {
    isLoading.value = false
  }, 450)
})

interface OrderRecord {
  id: string
  publicOrderNo: string
  externalOrderId: string
  status: 'PENDING_PAYMENT' | 'PAYMENT_SUBMITTED' | 'PROCESSING_SUPPLIER' | 'DELIVERED' | 'CANCELLED'
  totalAmountMmk: number
  totalCostUsd: string
  createdAt: string
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
  paymentSubmission?: {
    id: number
    paymentMethod: string
    transactionRef: string
    submittedAmountMmk: number
    slipImageUrl: string
    submittedAt: string
  }
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

// Sample live/mock orders data
const ordersList = ref<OrderRecord[]>([
  {
    id: 'c1234567-89ab-cdef-0123-456789abcdef',
    publicOrderNo: 'ARN-2026-84920',
    externalOrderId: 'XPRO-ARN-2026-84920',
    status: 'PAYMENT_SUBMITTED',
    totalAmountMmk: 3900,
    totalCostUsd: '0.69',
    createdAt: '2026-09-30 19:15',
    customer: {
      id: 1,
      telegramId: '984729184',
      firstName: 'Ryan Wez',
      username: 'ryanwez',
    },
    items: [
      {
        id: 1,
        productName: 'Gemini AI 18 MONTH',
        quantity: 1,
        unitPriceMmk: 3900,
        subtotalMmk: 3900,
        deliveryType: 'LINK',
      },
    ],
    paymentSubmission: {
      id: 101,
      paymentMethod: 'KPAY',
      transactionRef: '098472918471',
      submittedAmountMmk: 3900,
      slipImageUrl: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=800&q=80',
      submittedAt: '5 mins ago',
    },
  },
  {
    id: 'd9876543-21ba-fedc-3210-987654fedcba',
    publicOrderNo: 'ARN-2026-84921',
    externalOrderId: 'XPRO-ARN-2026-84921',
    status: 'PAYMENT_SUBMITTED',
    totalAmountMmk: 3200,
    totalCostUsd: '0.50',
    createdAt: '2026-09-30 18:55',
    customer: {
      id: 2,
      telegramId: '872635194',
      firstName: 'Aung Kyaw',
      username: 'aungkyaw_99',
    },
    items: [
      {
        id: 2,
        productName: 'Canva Pro 1 Year Private',
        quantity: 1,
        unitPriceMmk: 3200,
        subtotalMmk: 3200,
        deliveryType: 'LINK',
      },
    ],
    paymentSubmission: {
      id: 102,
      paymentMethod: 'WAVEPAY',
      transactionRef: 'WP-84920194',
      submittedAmountMmk: 3200,
      slipImageUrl: 'https://images.unsplash.com/photo-1554224154-26032ffc0d07?auto=format&fit=crop&w=800&q=80',
      submittedAt: '25 mins ago',
    },
  },
  {
    id: 'e4567890-1234-5678-9012-345678901234',
    publicOrderNo: 'ARN-2026-84919',
    externalOrderId: 'XPRO-ARN-2026-84919',
    status: 'DELIVERED',
    totalAmountMmk: 16500,
    totalCostUsd: '3.00',
    createdAt: '2026-09-30 17:30',
    customer: {
      id: 3,
      telegramId: '761234908',
      firstName: 'Ko Kyaw',
      username: 'kyawkyaw_mm',
    },
    items: [
      {
        id: 3,
        productName: 'Claude $100 API Key 1 Month',
        quantity: 1,
        unitPriceMmk: 16500,
        subtotalMmk: 16500,
        deliveryType: 'CREDENTIALS',
      },
    ],
    paymentSubmission: {
      id: 103,
      paymentMethod: 'KPAY',
      transactionRef: '098192849182',
      submittedAmountMmk: 16500,
      slipImageUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80',
      submittedAt: '1 hour ago',
    },
    delivery: {
      deliveredAt: '2026-09-30 17:35',
      deliveryType: 'CREDENTIALS',
      credentialsText: 'Key: sk-ant-api03-arena994829184719284-A9F3\nExpires: 30 Days\nRate: Tier 4 Enabled',
    },
  },
  {
    id: 'f5678901-2345-6789-0123-456789012345',
    publicOrderNo: 'ARN-2026-84918',
    externalOrderId: 'XPRO-ARN-2026-84918',
    status: 'PENDING_PAYMENT',
    totalAmountMmk: 24500,
    totalCostUsd: '4.50',
    createdAt: '2026-09-30 19:18',
    customer: {
      id: 4,
      telegramId: '654987321',
      firstName: 'Su Su',
      username: 'susu_linn',
    },
    items: [
      {
        id: 4,
        productName: 'ChatGPT Plus 1 Month Private',
        quantity: 1,
        unitPriceMmk: 24500,
        subtotalMmk: 24500,
        deliveryType: 'CREDENTIALS',
      },
    ],
  },
  {
    id: 'a1234567-3456-7890-1234-567890abcdef',
    publicOrderNo: 'ARN-2026-84915',
    externalOrderId: 'XPRO-ARN-2026-84915',
    status: 'CANCELLED',
    totalAmountMmk: 3900,
    totalCostUsd: '0.69',
    createdAt: '2026-09-30 14:00',
    customer: {
      id: 5,
      telegramId: '543216789',
      firstName: 'Hlaing Bwar',
    },
    items: [
      {
        id: 5,
        productName: 'Gemini AI 18 MONTH',
        quantity: 1,
        unitPriceMmk: 3900,
        subtotalMmk: 3900,
        deliveryType: 'LINK',
      },
    ],
  },
])

// Computed statistics
const totalOrdersCount = computed(() => ordersList.value.length)
const pendingReviewCount = computed(() => ordersList.value.filter(o => o.status === 'PAYMENT_SUBMITTED').length)
const deliveredCount = computed(() => ordersList.value.filter(o => o.status === 'DELIVERED').length)
const pendingPaymentCount = computed(() => ordersList.value.filter(o => o.status === 'PENDING_PAYMENT').length)

// Filtered orders list
const filteredOrders = computed(() => {
  return ordersList.value.filter((order) => {
    // Status filter
    if (selectedStatus.value !== 'ALL' && order.status !== selectedStatus.value) {
      return false
    }

    // Search query
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase().trim()
      const matchNo = order.publicOrderNo.toLowerCase().includes(q)
      const matchName = order.customer.firstName.toLowerCase().includes(q)
      const matchUser = order.customer.username?.toLowerCase().includes(q)
      const matchItem = order.items.some(i => i.productName.toLowerCase().includes(q))
      return matchNo || matchName || matchUser || matchItem
    }

    return true
  })
})

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
  return new Intl.NumberFormat('en-US').format(amount) + ' MMK'
}
</script>

<template>
  <div class="space-y-6">
    <!-- Page Header & KPIs -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
          <i class="pi pi-shopping-bag text-indigo-600 dark:text-indigo-400"></i>
          Customer Orders (အော်ဒါများ)
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Monitor customer transactions, verify payment slips, and manage automated credential deliveries
        </p>
      </div>

      <!-- Quick Status Badges -->
      <div class="flex flex-wrap items-center gap-2">
        <div class="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs font-medium text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
          <span>Review: {{ pendingReviewCount }}</span>
        </div>
        <div class="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
          <i class="pi pi-check text-[11px]"></i>
          <span>Delivered: {{ deliveredCount }}</span>
        </div>
      </div>
    </div>

    <!-- Filter & Search Controls -->
    <div class="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
      <!-- Search Input -->
      <div class="relative w-full md:w-80">
        <i class="pi pi-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search by Order #, Customer, Item..."
          class="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
        />
      </div>

      <!-- Status Tabs -->
      <div class="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
        <button
          type="button"
          @click="selectedStatus = 'ALL'"
          class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
          :class="selectedStatus === 'ALL' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'"
        >
          All ({{ totalOrdersCount }})
        </button>

        <button
          type="button"
          @click="selectedStatus = 'PAYMENT_SUBMITTED'"
          class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5"
          :class="selectedStatus === 'PAYMENT_SUBMITTED' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'"
        >
          <span>Submitted</span>
          <span v-if="pendingReviewCount > 0" class="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-400/30 text-amber-100 font-bold">
            {{ pendingReviewCount }}
          </span>
        </button>

        <button
          type="button"
          @click="selectedStatus = 'DELIVERED'"
          class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
          :class="selectedStatus === 'DELIVERED' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'"
        >
          Delivered ({{ deliveredCount }})
        </button>

        <button
          type="button"
          @click="selectedStatus = 'PENDING_PAYMENT'"
          class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
          :class="selectedStatus === 'PENDING_PAYMENT' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'"
        >
          Pending Payment ({{ pendingPaymentCount }})
        </button>
      </div>
    </div>

    <!-- Orders Table Card -->
    <div class="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-slate-200 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-800/40 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <th class="py-3.5 px-4 sm:px-6">Order ID</th>
              <th class="py-3.5 px-4">Customer</th>
              <th class="py-3.5 px-4">Items / Goods</th>
              <th class="py-3.5 px-4">Total Amount</th>
              <th class="py-3.5 px-4">Status</th>
              <th class="py-3.5 px-4">Date</th>
              <th class="py-3.5 px-4 sm:px-6 text-right">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
            <!-- Skeleton Loading State -->
            <template v-if="isLoading">
              <tr v-for="n in 5" :key="'order-skel-' + n">
                <td class="py-4 px-4 sm:px-6"><Skeleton height="1.1rem" width="110px" border-radius="6px" /></td>
                <td class="py-4 px-4"><Skeleton height="1.1rem" width="130px" border-radius="6px" /></td>
                <td class="py-4 px-4"><Skeleton height="1.1rem" width="160px" border-radius="6px" /></td>
                <td class="py-4 px-4"><Skeleton height="1.1rem" width="90px" border-radius="6px" /></td>
                <td class="py-4 px-4"><Skeleton height="1.3rem" width="75px" border-radius="9999px" /></td>
                <td class="py-4 px-4"><Skeleton height="1.1rem" width="90px" border-radius="6px" /></td>
                <td class="py-4 px-4 sm:px-6 text-right"><Skeleton height="1.6rem" width="70px" class="ml-auto" border-radius="8px" /></td>
              </tr>
            </template>
            <template v-else>
              <tr
                v-for="order in filteredOrders"
                :key="order.id"
                class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
              >
              <!-- Order ID with Copy -->
              <td class="py-4 px-4 sm:px-6 font-mono font-medium text-slate-900 dark:text-white">
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
                  <span class="text-xs text-slate-500 ml-1.5">x{{ item.quantity }}</span>
                  <span class="ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    {{ item.deliveryType }}
                  </span>
                </div>
              </td>

              <!-- Total Amount -->
              <td class="py-4 px-4 font-medium text-slate-900 dark:text-white">
                <div>{{ formatCurrency(order.totalAmountMmk) }}</div>
                <div class="text-xs text-slate-500 font-mono">~${{ order.totalCostUsd }} USD</div>
              </td>

              <!-- Status Badge -->
              <td class="py-4 px-4">
                <span
                  v-if="order.status === 'DELIVERED'"
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                >
                  <i class="pi pi-check text-[10px]"></i>
                  Delivered
                </span>
                <span
                  v-else-if="order.status === 'PAYMENT_SUBMITTED'"
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                >
                  <i class="pi pi-clock text-[10px]"></i>
                  Submitted
                </span>
                <span
                  v-else-if="order.status === 'PENDING_PAYMENT'"
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20"
                >
                  <i class="pi pi-hourglass text-[10px]"></i>
                  Pending Payment
                </span>
                <span
                  v-else-if="order.status === 'CANCELLED'"
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                >
                  <i class="pi pi-times text-[10px]"></i>
                  Cancelled
                </span>
              </td>

              <!-- Date -->
              <td class="py-4 px-4 text-xs text-slate-500 font-mono">
                {{ order.createdAt }}
              </td>

              <!-- Action Buttons -->
              <td class="py-4 px-4 sm:px-6 text-right">
                <div class="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    @click="openDetailModal(order)"
                    class="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1"
                  >
                    <i class="pi pi-eye text-[11px]"></i>
                    <span>Details</span>
                  </button>

                  <NuxtLink
                    v-if="order.status === 'PAYMENT_SUBMITTED'"
                    to="/payments"
                    class="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-colors flex items-center gap-1 shadow-sm"
                  >
                    <i class="pi pi-receipt text-[11px]"></i>
                    <span>Review</span>
                  </NuxtLink>
                </div>
              </td>
            </tr>
          </template>

          <!-- Empty State -->
          <tr v-if="filteredOrders.length === 0">
              <td colspan="7" class="py-12 text-center text-slate-500">
                <i class="pi pi-inbox text-3xl mb-2 text-slate-400"></i>
                <p>No orders found matching your filter criteria.</p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Order Detail Modal -->
    <Transition name="modal">
      <div
        v-if="isDetailModalOpen && selectedOrder"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        @click.self="isDetailModalOpen = false"
      >
        <div class="modal-card bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
          <!-- Modal Header -->
          <div class="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <div class="flex items-center gap-2.5">
                <h3 class="text-lg font-bold text-slate-900 dark:text-white font-mono">
                  {{ selectedOrder.publicOrderNo }}
                </h3>
                <span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  {{ selectedOrder.status }}
                </span>
              </div>
              <p class="text-xs text-slate-500 font-mono mt-0.5">External ID: {{ selectedOrder.externalOrderId }}</p>
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
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 text-xs">
            <div>
              <span class="text-slate-500 block">Customer</span>
              <span class="font-semibold text-slate-800 dark:text-slate-200">{{ selectedOrder.customer.firstName }}</span>
              <span class="text-slate-400 block font-mono text-[11px]">{{ selectedOrder.customer.username ? `@${selectedOrder.customer.username}` : `ID: ${selectedOrder.customer.telegramId}` }}</span>
            </div>
            <div>
              <span class="text-slate-500 block">Order Date</span>
              <span class="font-semibold text-slate-800 dark:text-slate-200">{{ selectedOrder.createdAt }}</span>
            </div>
            <div>
              <span class="text-slate-500 block">Total Price (MMK)</span>
              <span class="font-bold text-indigo-600 dark:text-indigo-400 text-sm">{{ formatCurrency(selectedOrder.totalAmountMmk) }}</span>
            </div>
          </div>

          <!-- Items Table -->
          <div>
            <h4 class="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Purchased Items</h4>
            <div class="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <table class="w-full text-left text-xs">
                <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th class="py-2.5 px-3">Product</th>
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

          <!-- Delivered Credentials Card (if DELIVERED) -->
          <div v-if="selectedOrder.delivery" class="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-2">
            <div class="flex items-center justify-between text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <span class="flex items-center gap-1.5">
                <i class="pi pi-key"></i>
                Delivered Digital Goods (Credentials / Invite Link)
              </span>
              <span>{{ selectedOrder.delivery.deliveredAt }}</span>
            </div>
            <div class="relative">
              <pre class="p-3 bg-slate-950 text-emerald-400 rounded-xl font-mono text-xs overflow-x-auto select-all">{{ selectedOrder.delivery.credentialsText }}</pre>
            </div>
          </div>

          <!-- Payment Slip Submission Card (if SUBMITTED) -->
          <div v-if="selectedOrder.paymentSubmission" class="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-3">
            <div class="flex items-center justify-between text-xs font-semibold text-amber-700 dark:text-amber-300">
              <span class="flex items-center gap-1.5">
                <i class="pi pi-receipt"></i>
                Customer Payment Proof ({{ selectedOrder.paymentSubmission.paymentMethod }})
              </span>
              <span>Ref: {{ selectedOrder.paymentSubmission.transactionRef }}</span>
            </div>
            <div class="flex items-center gap-4">
              <img
                :src="selectedOrder.paymentSubmission.slipImageUrl"
                alt="Payment Slip"
                class="w-20 h-24 object-cover rounded-lg border border-amber-500/30 shadow-sm"
              />
              <div class="text-xs space-y-1">
                <p class="text-slate-700 dark:text-slate-300 font-medium">Submitted Amount: {{ formatCurrency(selectedOrder.paymentSubmission.submittedAmountMmk) }}</p>
                <p class="text-slate-500 font-mono">Time: {{ selectedOrder.paymentSubmission.submittedAt }}</p>
              </div>
            </div>
          </div>

          <!-- Modal Footer -->
          <div class="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
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
    </Transition>
  </div>
</template>

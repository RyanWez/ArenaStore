<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useToast } from '~/composables/useToast'
import { useAuth } from '~/composables/useAuth'

const toast = useToast()
const { getAuthHeaders } = useAuth()
const isLoading = ref(true)
const isRefreshing = ref(false)

export interface DepositItem {
  id: number
  topUpId: string
  reference: string
  customerName: string
  telegramUsername: string
  telegramId: string
  paymentMethod: 'KPAY' | 'WAVEPAY' | 'UAB_PAY' | 'AYA_PAY'
  depositAmountMmk: number
  transactionRef: string
  slipImageUrl: string
  submittedAt: string
  rawDate: string
  status: 'SUBMITTED' | 'APPROVED' | 'REJECTED'
  intendedProduct?: string
}

const isSlipModalOpen = ref(false)
const isRejectModalOpen = ref(false)
const selectedSlip = ref<DepositItem | null>(null)
const rejectReason = ref('Slip amount does not match requested top-up.')
const isProcessing = ref(false)
const activeTab = ref<'ALL' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'>('ALL')
const searchQuery = ref('')

const slips = ref<DepositItem[]>([])
let pollInterval: ReturnType<typeof setInterval> | null = null

async function fetchSlips(isSilent = false) {
  if (!isSilent) isLoading.value = true
  try {
    const res: any = await $fetch('/api/admin/deposits', {
      headers: getAuthHeaders(),
    })

    if (res.ok && Array.isArray(res.slips)) {
      slips.value = res.slips.map((s: any) => ({
        id: s.id,
        topUpId: s.reference || `TOP-${s.id}`,
        reference: s.reference,
        customerName: s.user || 'Customer',
        telegramUsername: s.user?.startsWith('@') ? s.user : (s.user || '@customer'),
        telegramId: s.telegramId || '',
        paymentMethod: s.method || 'KPAY',
        depositAmountMmk: s.amount || 0,
        transactionRef: s.txnRef || '-',
        slipImageUrl: s.slipUrl
          ? (s.slipUrl.startsWith('http') || s.slipUrl.startsWith('/')
              ? s.slipUrl
              : `/api/admin/telegram-file/${encodeURIComponent(s.slipUrl)}`)
          : `/api/admin/deposits/${s.id}/slip-image`,
        submittedAt: s.date ? new Date(s.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
        rawDate: s.date || new Date().toISOString(),
        status: s.status === 'COMPLETED' ? 'APPROVED' : (s.status as any),
        intendedProduct: s.intendedProduct || 'General Wallet Topup',
      }))
    }
  } catch (err: any) {
    if (!isSilent) {
      toast.error('Failed to load deposit slips: ' + (err.message || 'Network error'))
    }
  } finally {
    if (!isSilent) isLoading.value = false
    isRefreshing.value = false
  }
}

async function refreshSlips(isSilent = false) {
  isRefreshing.value = true
  await fetchSlips(isSilent)
}

onMounted(() => {
  fetchSlips(false)
  // Real-time automatic background polling every 4 seconds
  pollInterval = setInterval(() => {
    fetchSlips(true)
  }, 4000)
})

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval)
})

// Filtered and sorted newest first (Requirement 3: "နောက်ဆုံး ဝင်လာရင် Order ကို အပေါ်ဆုံးမှာ ပြမယ်")
const filteredSlips = computed(() => {
  let list = slips.value

  // Status Tab Filter
  if (activeTab.value !== 'ALL') {
    list = list.filter((s) => s.status === activeTab.value)
  }

  // Search Query Filter
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim()
    list = list.filter((s) => {
      const matchRef = s.topUpId.toLowerCase().includes(q)
      const matchName = s.customerName.toLowerCase().includes(q)
      const matchUser = s.telegramUsername.toLowerCase().includes(q)
      const matchTxn = s.transactionRef.toLowerCase().includes(q)
      const matchAmount = String(s.depositAmountMmk).includes(q)
      const matchMethod = s.paymentMethod.toLowerCase().includes(q)
      return matchRef || matchName || matchUser || matchTxn || matchAmount || matchMethod
    })
  }

  // Sort newest first
  return [...list].sort((a, b) => {
    const timeA = a.rawDate ? new Date(a.rawDate).getTime() : 0
    const timeB = b.rawDate ? new Date(b.rawDate).getTime() : 0
    if (timeB !== timeA) return timeB - timeA
    return b.id - a.id
  })
})

// Pagination state
const currentPage = ref(1)
const pageSize = ref(10)

watch([searchQuery, activeTab, pageSize], () => {
  currentPage.value = 1
})

const totalFilteredCount = computed(() => filteredSlips.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalFilteredCount.value / pageSize.value)))

const paginatedSlips = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredSlips.value.slice(start, start + pageSize.value)
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

const pendingCount = computed(() => slips.value.filter((s) => s.status === 'SUBMITTED').length)
const pendingTotalMmk = computed(() =>
  slips.value
    .filter((s) => s.status === 'SUBMITTED')
    .reduce((sum, s) => sum + s.depositAmountMmk, 0)
)
const approvedTodayMmk = computed(() =>
  slips.value
    .filter((s) => s.status === 'APPROVED')
    .reduce((sum, s) => sum + s.depositAmountMmk, 0)
)

function openSlipPreview(slip: DepositItem) {
  selectedSlip.value = slip
  isSlipModalOpen.value = true
}

async function approveDeposit(slip: DepositItem) {
  if (isProcessing.value) return
  isProcessing.value = true

  try {
    const res: any = await $fetch(`/api/admin/deposits/${slip.id}/review`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: {
        action: 'APPROVE',
      },
    })

    if (res.ok) {
      slip.status = 'APPROVED'
      isSlipModalOpen.value = false
      toast.success(
        `Top-Up ${slip.topUpId} approved! +${slip.depositAmountMmk.toLocaleString()} Ks credited to ${slip.customerName}. Customer received instant Telegram celebration message.`,
        'Wallet Credited'
      )
      await fetchSlips(true)
    } else {
      toast.error('Approval failed: ' + (res.error || 'Server error'))
    }
  } catch (err: any) {
    toast.error('Approval failed: ' + (err.message || 'Network error'))
  } finally {
    isProcessing.value = false
  }
}

function openRejectDialog(slip: DepositItem) {
  selectedSlip.value = slip
  isRejectModalOpen.value = true
}

async function confirmReject() {
  if (!selectedSlip.value || isProcessing.value) return
  isProcessing.value = true

  const topUpId = selectedSlip.value.topUpId
  const user = selectedSlip.value.telegramUsername

  try {
    const res: any = await $fetch(`/api/admin/deposits/${selectedSlip.value.id}/review`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: {
        action: 'REJECT',
        rejectReason: rejectReason.value,
      },
    })

    if (res.ok) {
      selectedSlip.value.status = 'REJECTED'
      isRejectModalOpen.value = false
      isSlipModalOpen.value = false
      toast.warn(
        `Top-Up ${topUpId} rejected for ${user}. Reason: ${rejectReason.value}. Customer was notified on Telegram.`,
        'Deposit Slip Rejected'
      )
      await fetchSlips(true)
    } else {
      toast.error('Rejection failed: ' + (res.error || 'Server error'))
    }
  } catch (err: any) {
    toast.error('Rejection failed: ' + (err.message || 'Network error'))
  } finally {
    isProcessing.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <span>Wallet Deposit Slips & Verification</span>
          <span class="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
            Prepaid Wallet System
          </span>
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Review customer KPay & WavePay screenshot receipts for Wallet Top-Ups. One-click approve credits the customer's wallet balance and triggers instant Telegram Bot notification.
        </p>
      </div>

      <!-- Quick Counter & Live Indicator -->
      <div class="flex items-center gap-2.5">
        <div class="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-sm">
          <span class="relative flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span>Real-time Sync</span>
        </div>

        <span class="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-2 shadow-sm">
          <i class="pi pi-hourglass animate-pulse text-sm"></i>
          <span>{{ pendingCount }} Pending · {{ pendingTotalMmk.toLocaleString() }} Ks</span>
        </span>
      </div>
    </div>

    <!-- Stats Summary Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center text-xl">
          <i class="pi pi-clock"></i>
        </div>
        <div>
          <div class="text-xs font-medium text-slate-400 uppercase tracking-wider">Pending Deposits</div>
          <div class="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
            {{ pendingCount }} Slips <span class="text-xs font-normal text-slate-400">({{ pendingTotalMmk.toLocaleString() }} Ks)</span>
          </div>
        </div>
      </div>

      <div class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-xl">
          <i class="pi pi-check-circle"></i>
        </div>
        <div>
          <div class="text-xs font-medium text-slate-400 uppercase tracking-wider">Approved Today</div>
          <div class="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
            {{ approvedTodayMmk.toLocaleString() }} Ks
          </div>
        </div>
      </div>

      <div class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center text-xl">
          <i class="pi pi-wallet"></i>
        </div>
        <div>
          <div class="text-xs font-medium text-slate-400 uppercase tracking-wider">Auto Bot Crediting</div>
          <div class="text-lg font-bold text-emerald-500 mt-0.5 flex items-center gap-1.5 text-sm">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Real-time Active</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Sticky Tab Filter & Search Controls (Sticks under Navbar: top-16) -->
    <div class="sticky top-16 z-20 p-3 rounded-2xl bg-white/95 dark:bg-[#0b1220]/95 backdrop-blur-md border border-slate-200 dark:border-slate-800/80 shadow-md flex flex-col md:flex-row items-center justify-between gap-3 transition-all">
      <!-- Tabs -->
      <div class="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto text-xs font-semibold scrollbar-none">
        <button
          type="button"
          @click="activeTab = 'ALL'"
          :class="activeTab === 'ALL' ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'"
          class="px-3.5 py-1.5 rounded-xl transition-all shrink-0"
        >
          All Deposits ({{ slips.length }})
        </button>
        <button
          type="button"
          @click="activeTab = 'SUBMITTED'"
          :class="activeTab === 'SUBMITTED' ? 'bg-amber-600 text-white shadow-sm shadow-amber-600/20' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'"
          class="px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 shrink-0"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
          <span>Pending Review ({{ pendingCount }})</span>
        </button>
        <button
          type="button"
          @click="activeTab = 'APPROVED'"
          :class="activeTab === 'APPROVED' ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'"
          class="px-3.5 py-1.5 rounded-xl transition-all shrink-0"
        >
          Approved
        </button>
        <button
          type="button"
          @click="activeTab = 'REJECTED'"
          :class="activeTab === 'REJECTED' ? 'bg-rose-600 text-white shadow-sm shadow-rose-600/20' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'"
          class="px-3.5 py-1.5 rounded-xl transition-all shrink-0"
        >
          Rejected
        </button>
      </div>

      <!-- Search Input + Manual Refresh -->
      <div class="flex items-center gap-2.5 w-full md:w-auto">
        <div class="relative flex-1 md:w-64">
          <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search slip, user, ref..."
            class="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          />
        </div>

        <button
          type="button"
          @click="refreshSlips(false)"
          :disabled="isRefreshing"
          class="p-2 rounded-xl text-xs border border-slate-200 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all shrink-0"
          title="Refresh deposits manually"
        >
          <i class="pi pi-sync text-xs" :class="{ 'animate-spin': isRefreshing }"></i>
        </button>
      </div>
    </div>

    <!-- Slips Table & Pagination Container -->
    <div class="rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800/80 shadow-sm flex flex-col overflow-hidden">
      <!-- Fixed Max-Height Scrollable Table Viewport -->
      <div class="overflow-x-auto overflow-y-auto max-h-[calc(100vh-270px)] min-h-[380px] relative scrollbar-thin">
        <table class="w-full text-left border-collapse text-sm">
          <thead class="sticky top-0 z-10 bg-slate-50 dark:bg-[#0e172a] shadow-sm border-b border-slate-200 dark:border-slate-800">
            <tr class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
              <th class="py-3 px-4 bg-slate-50 dark:bg-[#0e172a]">Receipt</th>
              <th class="py-3 px-4 bg-slate-50 dark:bg-[#0e172a]">Top-Up Ref</th>
              <th class="py-3 px-4 bg-slate-50 dark:bg-[#0e172a]">Customer</th>
              <th class="py-3 px-4 bg-slate-50 dark:bg-[#0e172a]">Method & Ref</th>
              <th class="py-3 px-4 bg-slate-50 dark:bg-[#0e172a]">Deposit Amount</th>
              <th class="py-3 px-4 bg-slate-50 dark:bg-[#0e172a]">Status</th>
              <th class="py-3 px-4 bg-slate-50 dark:bg-[#0e172a] text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60">
            <!-- Skeleton Loading State -->
            <template v-if="isLoading">
              <tr v-for="n in 3" :key="'slip-skel-' + n">
                <td class="py-3.5 px-4"><Skeleton height="3.5rem" width="3rem" border-radius="8px" /></td>
                <td class="py-3.5 px-4"><Skeleton height="1.1rem" width="130px" class="mb-1.5" border-radius="6px" /><Skeleton height="0.9rem" width="90px" border-radius="6px" /></td>
                <td class="py-3.5 px-4"><Skeleton height="1.1rem" width="100px" class="mb-1.5" border-radius="6px" /><Skeleton height="0.9rem" width="80px" border-radius="6px" /></td>
                <td class="py-3.5 px-4"><Skeleton height="1.1rem" width="70px" class="mb-1.5" border-radius="6px" /><Skeleton height="0.9rem" width="110px" border-radius="6px" /></td>
                <td class="py-3.5 px-4"><Skeleton height="1.2rem" width="80px" border-radius="6px" /></td>
                <td class="py-3.5 px-4"><Skeleton height="1.3rem" width="65px" border-radius="9999px" /></td>
                <td class="py-3.5 px-4 text-right"><Skeleton height="2rem" width="75px" class="ml-auto" border-radius="10px" /></td>
              </tr>
            </template>
            <!-- Empty state -->
            <template v-else-if="paginatedSlips.length === 0">
              <tr>
                <td colspan="7" class="py-12 text-center text-slate-400">
                  <i class="pi pi-inbox text-3xl mb-2 text-slate-400"></i>
                  <p class="text-sm">No deposit requests found in this filter.</p>
                </td>
              </tr>
            </template>
            <template v-else>
              <tr
                v-for="slip in paginatedSlips"
                :key="slip.id"
                class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
              >
              <!-- Thumbnail -->
              <td class="py-3.5 px-4">
                <button
                  type="button"
                  @click="openSlipPreview(slip)"
                  class="relative group w-12 h-14 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 block shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  title="Click to zoom slip image"
                >
                  <img
                    :src="slip.slipImageUrl"
                    alt="Slip preview"
                    class="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                  <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                    <i class="pi pi-search-plus text-xs"></i>
                  </div>
                </button>
              </td>

              <!-- Top-Up Ref & Time -->
              <td class="py-3.5 px-4">
                <div class="font-mono font-semibold text-xs text-indigo-600 dark:text-indigo-400">
                  {{ slip.topUpId }}
                </div>
                <div class="text-[11px] text-slate-400 mt-0.5">
                  {{ slip.submittedAt }}
                </div>
                <div v-if="slip.intendedProduct" class="mt-1 text-[11px] text-amber-500 flex items-center gap-1">
                  <i class="pi pi-shopping-cart text-[10px]"></i>
                  <span>For: {{ slip.intendedProduct }}</span>
                </div>
              </td>

              <!-- Customer -->
              <td class="py-3.5 px-4">
                <div class="font-medium text-slate-800 dark:text-slate-200">
                  {{ slip.customerName }}
                </div>
                <div class="text-xs text-slate-400 font-mono">
                  {{ slip.telegramUsername }} · <span class="text-[10px] text-slate-500">{{ slip.telegramId }}</span>
                </div>
              </td>

              <!-- Method & Transaction Ref -->
              <td class="py-3.5 px-4">
                <span
                  class="inline-block px-2 py-0.5 rounded text-[11px] font-bold"
                  :class="slip.paymentMethod === 'KPAY' ? 'bg-blue-500/10 text-blue-600 border border-blue-500/20' : 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border border-yellow-500/20'"
                >
                  {{ slip.paymentMethod }}
                </span>
                <div class="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1">
                  TX: {{ slip.transactionRef }}
                </div>
              </td>

              <!-- Deposit Amount -->
              <td class="py-3.5 px-4 font-bold text-slate-900 dark:text-white text-base">
                +{{ slip.depositAmountMmk.toLocaleString() }} <span class="text-xs font-normal text-slate-400">Ks</span>
              </td>

              <!-- Status -->
              <td class="py-3.5 px-4">
                <span
                  v-if="slip.status === 'SUBMITTED'"
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 animate-pulse"
                >
                  <i class="pi pi-clock text-[10px]"></i>
                  <span>Review</span>
                </span>
                <span
                  v-else-if="slip.status === 'APPROVED'"
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                >
                  <i class="pi pi-check text-[10px]"></i>
                  <span>Credited</span>
                </span>
                <span
                  v-else
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                >
                  <i class="pi pi-times text-[10px]"></i>
                  <span>Rejected</span>
                </span>
              </td>

              <!-- Action Buttons (Requirement 1: Top Approve Green, Bottom Reject Red) -->
              <td class="py-3.5 px-4 text-right">
                <div v-if="slip.status === 'SUBMITTED'" class="flex flex-col items-end gap-1.5">
                  <!-- Top: Approve (Color = Green) -->
                  <button
                    type="button"
                    @click="approveDeposit(slip)"
                    :disabled="isProcessing"
                    class="w-20 inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white shadow-sm shadow-emerald-600/20 transition-all disabled:opacity-50"
                  >
                    <i class="pi pi-check text-[10px]"></i>
                    <span>Approve</span>
                  </button>

                  <!-- Bottom: Reject (Color = Red) -->
                  <button
                    type="button"
                    @click="openRejectDialog(slip)"
                    :disabled="isProcessing"
                    class="w-20 inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 active:scale-95 transition-all disabled:opacity-50"
                  >
                    <i class="pi pi-times text-[10px]"></i>
                    <span>Reject</span>
                  </button>
                </div>

                <!-- Resolved State -->
                <div v-else class="flex flex-col items-end">
                  <span
                    v-if="slip.status === 'APPROVED'"
                    class="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400"
                  >
                    <i class="pi pi-check-circle text-xs"></i>
                    <span>Approved</span>
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400"
                  >
                    <i class="pi pi-times-circle text-xs"></i>
                    <span>Rejected</span>
                  </span>
                </div>
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
          <template v-for="(page, idx) in displayedPages" :key="'page-' + idx">
            <span v-if="page === -1" class="px-1 text-slate-400">...</span>
            <button
              v-else
              type="button"
              @click="goToPage(page)"
              class="min-w-7 h-7 px-1.5 rounded-lg text-xs font-semibold flex items-center justify-center transition-colors"
              :class="currentPage === page ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/80'"
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
            class="ml-2 px-2.5 py-1 rounded-lg text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option :value="10">10 / page</option>
            <option :value="20">20 / page</option>
            <option :value="50">50 / page</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Zoomable Slip Preview Modal -->
    <Transition name="modal">
      <div
        v-if="isSlipModalOpen && selectedSlip"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
        @click.self="isSlipModalOpen = false"
      >
        <div class="modal-card w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 p-5">
          <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h3 class="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <span>Wallet Top-Up Verification — {{ selectedSlip.topUpId }}</span>
              </h3>
              <p class="text-xs text-slate-400 mt-0.5">
                Customer: {{ selectedSlip.customerName }} ({{ selectedSlip.telegramUsername }}) · {{ selectedSlip.paymentMethod }}
              </p>
            </div>
            <button
              type="button"
              @click="isSlipModalOpen = false"
              class="text-slate-400 hover:text-slate-200"
            >
              <i class="pi pi-times text-lg"></i>
            </button>
          </div>

          <!-- High-res Image Preview Area -->
          <div class="relative max-h-[58vh] overflow-auto rounded-xl bg-black/40 border border-slate-800 flex items-center justify-center p-2 group">
            <img
              :src="selectedSlip.slipImageUrl"
              alt="Full Receipt"
              class="max-h-[52vh] object-contain rounded-lg shadow-md"
            />
            <a
              :href="selectedSlip.slipImageUrl"
              target="_blank"
              class="absolute top-4 right-4 px-3 py-1.5 rounded-lg bg-black/70 hover:bg-black/90 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg backdrop-blur-sm opacity-80 hover:opacity-100 transition-all"
              title="Open high-res receipt in new tab"
            >
              <i class="pi pi-external-link text-[11px]"></i>
              <span>Open Original</span>
            </a>
          </div>

          <!-- Transaction Details Row -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
            <div>
              <span class="text-slate-400 block">Deposit Amount:</span>
              <span class="font-bold text-emerald-500 text-sm">+{{ selectedSlip.depositAmountMmk.toLocaleString() }} Ks</span>
            </div>
            <div>
              <span class="text-slate-400 block">Payment Method:</span>
              <span class="font-bold text-slate-900 dark:text-white">{{ selectedSlip.paymentMethod }}</span>
            </div>
            <div>
              <span class="text-slate-400 block">Transaction Ref:</span>
              <span class="font-mono text-slate-800 dark:text-slate-200">{{ selectedSlip.transactionRef }}</span>
            </div>
            <div>
              <span class="text-slate-400 block">Submitted:</span>
              <span class="text-slate-600 dark:text-slate-300">{{ selectedSlip.submittedAt }}</span>
            </div>
          </div>

          <!-- Modal Bottom Actions -->
          <div class="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              v-if="selectedSlip.status === 'SUBMITTED'"
              type="button"
              @click="openRejectDialog(selectedSlip)"
              class="px-4 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              Reject Top-Up
            </button>
            <div v-else></div>

            <div class="flex items-center gap-3">
              <button
                type="button"
                @click="isSlipModalOpen = false"
                class="px-4 py-2 rounded-xl text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Close
              </button>
              <button
                v-if="selectedSlip.status === 'SUBMITTED'"
                type="button"
                @click="approveDeposit(selectedSlip)"
                :disabled="isProcessing"
                class="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 transition-all disabled:opacity-50"
              >
                <i class="pi pi-check"></i>
                <span>Approve & Credit Wallet ({{ selectedSlip.depositAmountMmk.toLocaleString() }} Ks)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Reject Reason Dialog -->
    <Transition name="modal">
      <div
        v-if="isRejectModalOpen && selectedSlip"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        @click.self="isRejectModalOpen = false"
      >
        <div class="modal-card w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
          <h3 class="text-base font-bold text-slate-900 dark:text-white">
            Reject Deposit Slip
          </h3>
          <p class="text-xs text-slate-400">
            State the reason why top-up <span class="font-mono text-white">{{ selectedSlip.topUpId }}</span> was rejected. This explanation will be delivered directly to {{ selectedSlip.customerName }} on Telegram.
          </p>

          <textarea
            v-model="rejectReason"
            rows="3"
            class="w-full p-3 rounded-xl text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
            placeholder="e.g. Transaction reference not found on bank statement..."
          ></textarea>

          <div class="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              @click="isRejectModalOpen = false"
              class="px-4 py-2 rounded-xl text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              @click="confirmReject"
              class="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/30"
            >
              Confirm Rejection
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

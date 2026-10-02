<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from '~/composables/useToast'
import { useAuth } from '~/composables/useAuth'

const router = useRouter()
const toast = useToast()
const { getAuthHeaders } = useAuth()

const isLoading = ref(true)
const isRefreshing = ref(false)
const isFiltering = ref(false)

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
const rejectReason = ref('ပြေစာ လွဲမှားနေပါသည် ခင်ဗျာ။')
const isProcessing = ref(false)
const isRejecting = ref(false)
const approvingSlipId = ref<number | null>(null)
const copiedId = ref<string | null>(null)

// Filters
const activeTab = ref<'ALL' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'>('ALL')
const searchQuery = ref('')
const debouncedSearch = ref('')
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

watch(searchQuery, (newVal) => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => {
    debouncedSearch.value = newVal
  }, 250)
})

const slips = ref<DepositItem[]>([])
let pollInterval: ReturnType<typeof setInterval> | null = null

async function fetchSlips(isSilent = false) {
  if (!isSilent) {
    if (slips.value.length > 0) {
      isFiltering.value = true
    } else {
      isLoading.value = true
    }
  }
  try {
    const res: any = await $fetch('/api/admin/deposits', {
      headers: getAuthHeaders(),
    })

    if (res.ok && Array.isArray(res.slips)) {
      slips.value = res.slips.map((s: any) => {
        const displayName = s.displayName || s.customer?.displayName || (
          [s.customer?.firstName, s.customer?.lastName].filter(Boolean).join(' ').trim() ||
          s.user ||
          'Customer'
        )
        const username = s.username || s.telegramUsername || (s.customer?.username ? `@${s.customer.username}` : (s.user?.startsWith('@') ? s.user : ''))
        return {
          id: s.id,
          topUpId: s.reference || `TOP-${s.id}`,
          reference: s.reference,
          customerName: displayName,
          telegramUsername: username,
          telegramId: s.telegramId || s.customer?.telegramId || '',
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
        }
      })
    }
  } catch (err: any) {
    if (!isSilent) {
      toast.error('Failed to load deposit slips: ' + (err.message || 'Network error'))
    }
  } finally {
    if (!isSilent) {
      isLoading.value = false
      isFiltering.value = false
    }
    isRefreshing.value = false
  }
}

async function refreshSlips(isSilent = false) {
  isRefreshing.value = true
  await fetchSlips(isSilent)
}

onMounted(() => {
  fetchSlips(false)
  pollInterval = setInterval(() => {
    fetchSlips(true)
  }, 4000)
})

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval)
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
})

// Filtered and sorted newest first
const filteredSlips = computed(() => {
  let list = slips.value

  // Status Tab Filter
  if (activeTab.value !== 'ALL') {
    list = list.filter((s) => s.status === activeTab.value)
  }

  // Search Query Filter
  if (debouncedSearch.value.trim()) {
    const q = debouncedSearch.value.toLowerCase().trim()
    list = list.filter((s) => {
      const matchRef = s.topUpId.toLowerCase().includes(q)
      const matchName = s.customerName.toLowerCase().includes(q)
      const matchUser = s.telegramUsername.toLowerCase().includes(q)
      const matchTgId = s.telegramId.toLowerCase().includes(q)
      const matchTxn = s.transactionRef.toLowerCase().includes(q)
      const matchAmount = String(s.depositAmountMmk).includes(q)
      return matchRef || matchName || matchUser || matchTgId || matchTxn || matchAmount
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

watch([debouncedSearch, activeTab, pageSize], () => {
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

function openSlipPreview(slip: DepositItem, event?: Event) {
  if (event) event.stopPropagation()
  selectedSlip.value = slip
  isSlipModalOpen.value = true
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

async function approveDeposit(slip: DepositItem, event?: Event) {
  if (event) event.stopPropagation()
  if (isProcessing.value) return
  isProcessing.value = true
  approvingSlipId.value = slip.id

  try {
    const [res] = await Promise.all([
      $fetch(`/api/admin/deposits/${slip.id}/review`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: {
          action: 'APPROVE',
        },
      }) as Promise<any>,
      new Promise((resolve) => setTimeout(resolve, 350)),
    ])

    if (res && res.ok) {
      slip.status = 'APPROVED'
      isSlipModalOpen.value = false
      toast.success(
        `Top-Up ${slip.topUpId} approved! +${slip.depositAmountMmk.toLocaleString()} Ks credited to ${slip.customerName}. Customer received instant Telegram message.`,
        'Wallet Credited'
      )
      await fetchSlips(true)
    } else {
      toast.error('Approval failed: ' + (res?.error || 'Server error'))
    }
  } catch (err: any) {
    toast.error('Approval failed: ' + (err.message || 'Network error'))
  } finally {
    isProcessing.value = false
    approvingSlipId.value = null
  }
}

function openRejectDialog(slip: DepositItem, event?: Event) {
  if (event) event.stopPropagation()
  selectedSlip.value = slip
  if (!rejectReason.value || rejectReason.value === 'Slip amount does not match requested top-up.') {
    rejectReason.value = 'ပြေစာ လွဲမှားနေပါသည် ခင်ဗျာ။'
  }
  isRejectModalOpen.value = true
}

async function confirmReject() {
  if (!selectedSlip.value || isProcessing.value) return
  isProcessing.value = true
  isRejecting.value = true

  const topUpId = selectedSlip.value.topUpId
  const user = selectedSlip.value.telegramUsername || selectedSlip.value.customerName
  const reasonText = rejectReason.value.trim() || 'ပြေစာ လွဲမှားနေပါသည် ခင်ဗျာ။'

  try {
    const [res] = await Promise.all([
      $fetch(`/api/admin/deposits/${selectedSlip.value.id}/review`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: {
          action: 'REJECT',
          rejectReason: reasonText,
        },
      }) as Promise<any>,
      new Promise((resolve) => setTimeout(resolve, 350)),
    ])

    if (res && res.ok) {
      selectedSlip.value.status = 'REJECTED'
      toast.warn(
        `Top-Up ${topUpId} rejected for ${user}. Reason: ${reasonText}. Customer notified on Telegram.`,
        'Deposit Slip Rejected'
      )
      isRejectModalOpen.value = false
      isSlipModalOpen.value = false
      await fetchSlips(true)
    } else {
      toast.error('Rejection failed: ' + (res?.error || 'Server error'))
    }
  } catch (err: any) {
    toast.error('Rejection failed: ' + (err.message || 'Network error'))
  } finally {
    isProcessing.value = false
    isRejecting.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
          <i class="pi pi-receipt text-indigo-600 dark:text-indigo-400"></i>
          <span>Wallet Deposit Slips & Verification</span>
          <span class="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
            Prepaid Wallet System
          </span>
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Review customer KPay & WavePay screenshot receipts for Wallet Top-Ups. One-click approve credits the customer's wallet balance instantly.
        </p>
      </div>

      <!-- Quick Counter & Live Indicator -->
      <div class="flex flex-wrap items-center gap-2.5">
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
          <div class="text-lg font-bold text-slate-900 dark:text-white mt-0.5 font-mono">
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

    <!-- Integrated Unified Slips Table Card (No awkward floating detached bar) -->
    <div class="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col overflow-hidden">
      <!-- Integrated Filter & Search Toolbar (Smooth, no shaking or twitching) -->
      <div class="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <!-- Status Tabs -->
        <div class="flex items-center gap-1.5 overflow-x-auto text-xs font-semibold scrollbar-none">
          <button
            type="button"
            @click="activeTab = 'ALL'"
            :class="activeTab === 'ALL' ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'"
            class="px-3.5 py-1.5 rounded-xl transition-colors duration-150 shrink-0 font-semibold"
          >
            All Deposits ({{ slips.length }})
          </button>
          <button
            type="button"
            @click="activeTab = 'SUBMITTED'"
            :class="activeTab === 'SUBMITTED' ? 'bg-amber-600 text-white shadow-sm shadow-amber-600/20' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'"
            class="px-3.5 py-1.5 rounded-xl transition-colors duration-150 flex items-center gap-1.5 shrink-0 font-semibold"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
            <span>Pending Review ({{ pendingCount }})</span>
          </button>
          <button
            type="button"
            @click="activeTab = 'APPROVED'"
            :class="activeTab === 'APPROVED' ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'"
            class="px-3.5 py-1.5 rounded-xl transition-colors duration-150 shrink-0 font-semibold"
          >
            Approved
          </button>
          <button
            type="button"
            @click="activeTab = 'REJECTED'"
            :class="activeTab === 'REJECTED' ? 'bg-rose-600 text-white shadow-sm shadow-rose-600/20' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'"
            class="px-3.5 py-1.5 rounded-xl transition-colors duration-150 shrink-0 font-semibold"
          >
            Rejected
          </button>
        </div>

        <!-- Search Filter -->
        <div class="relative w-full sm:w-64 shrink-0">
          <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search slip, user, ref..."
            class="w-full pl-8 pr-7 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/70 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-500 focus:ring-0 transition-colors duration-150"
            style="outline: none !important; box-shadow: none !important;"
          />
          <button
            v-if="searchQuery"
            @click="searchQuery = ''"
            type="button"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <i class="pi pi-times text-[10px]"></i>
          </button>
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
            <tr class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <th class="py-2.5 px-3 w-16 text-center">Receipt</th>
              <th class="py-2.5 px-3 min-w-[140px]">Top-Up Ref</th>
              <th class="py-2.5 px-3 min-w-[170px] max-w-[240px]">Customer</th>
              <th class="py-2.5 px-3 min-w-[130px]">Deposit Amount</th>
              <th class="py-2.5 px-3 w-28">Status</th>
              <th class="py-2.5 px-3 text-right w-36">Actions</th>
            </tr>
          </thead>
          <tbody
            class="divide-y divide-slate-100 dark:divide-slate-800/60 text-sm transition-opacity duration-300 ease-in-out"
            :class="{ 'opacity-40 pointer-events-none': isFiltering }"
          >
            <!-- Skeleton Loading State -->
            <template v-if="isLoading">
              <tr v-for="n in 5" :key="'slip-skel-' + n" class="animate-pulse">
                <td class="py-2.5 px-3 text-center"><div class="h-11 w-8 rounded-lg bg-slate-200 dark:bg-slate-800 mx-auto"></div></td>
                <td class="py-2.5 px-3"><div class="h-4 w-28 rounded bg-slate-200 dark:bg-slate-800"></div></td>
                <td class="py-2.5 px-3 min-w-[170px] max-w-[240px]">
                  <div class="flex items-center gap-2.5">
                    <div class="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-800 shrink-0"></div>
                    <div class="space-y-1.5 flex-1">
                      <div class="h-3.5 w-24 rounded bg-slate-200 dark:bg-slate-800"></div>
                      <div class="h-2.5 w-16 rounded bg-slate-200 dark:bg-slate-800"></div>
                    </div>
                  </div>
                </td>
                <td class="py-2.5 px-3"><div class="h-4 w-20 rounded bg-slate-200 dark:bg-slate-800"></div></td>
                <td class="py-2.5 px-3"><div class="h-5 w-16 rounded-full bg-slate-200 dark:bg-slate-800"></div></td>
                <td class="py-2.5 px-3 text-right"><div class="h-7 w-20 rounded-xl bg-slate-200 dark:bg-slate-800 ml-auto"></div></td>
              </tr>
            </template>

            <!-- Empty State -->
            <tr v-else-if="paginatedSlips.length === 0">
              <td colspan="6" class="py-14 text-center">
                <div class="flex flex-col items-center justify-center max-w-sm mx-auto">
                  <div class="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 text-2xl mb-3">
                    <i class="pi pi-receipt"></i>
                  </div>
                  <h3 class="text-sm font-semibold text-slate-800 dark:text-slate-200">No Deposit Slips Found</h3>
                  <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {{ searchQuery ? 'Try adjusting your search query or clear filters' : 'Submitted screenshot slips will appear here for review' }}
                  </p>
                  <button
                    v-if="searchQuery || activeTab !== 'ALL'"
                    type="button"
                    @click="searchQuery = ''; activeTab = 'ALL'"
                    class="mt-4 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm"
                  >
                    Reset Filters
                  </button>
                </div>
              </td>
            </tr>

            <!-- Data Rows -->
            <template v-else>
              <tr
                v-for="slip in paginatedSlips"
                :key="'slip-' + slip.id"
                @click="openSlipPreview(slip, $event)"
                class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group"
              >
                <!-- Receipt Thumbnail -->
                <td class="py-2.5 px-3 text-center">
                  <button
                    type="button"
                    @click="openSlipPreview(slip, $event)"
                    class="relative w-9 h-12 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700/80 bg-slate-100 dark:bg-slate-800 shadow-sm inline-flex items-center justify-center group-hover:ring-2 group-hover:ring-indigo-500 transition-all shrink-0"
                    title="Click to view slip proof"
                  >
                    <img
                      :src="slip.slipImageUrl"
                      alt="Slip preview"
                      class="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                      <i class="pi pi-search-plus text-[10px]"></i>
                    </div>
                  </button>
                </td>

                <!-- Top-Up Ref & Time -->
                <td class="py-2.5 px-3">
                  <div class="flex items-center gap-1.5">
                    <span class="font-mono font-semibold text-xs text-indigo-600 dark:text-indigo-400">
                      {{ slip.topUpId }}
                    </span>
                    <button
                      type="button"
                      @click="copyToClipboard(slip.topUpId, 'ref-' + slip.id, $event)"
                      class="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                      :title="'Copy: ' + slip.topUpId"
                    >
                      <i :class="copiedId === 'ref-' + slip.id ? 'pi pi-check text-emerald-500 text-[10px]' : 'pi pi-copy text-[10px]'"></i>
                    </button>
                  </div>
                  <div class="text-[11px] text-slate-400 mt-0.5">
                    {{ slip.submittedAt }}
                  </div>
                  <div v-if="slip.intendedProduct" class="mt-1 text-[11px] text-amber-500 flex items-center gap-1 truncate max-w-[170px]" :title="'For: ' + slip.intendedProduct">
                    <i class="pi pi-shopping-cart text-[10px]"></i>
                    <span class="truncate">For: {{ slip.intendedProduct }}</span>
                  </div>
                </td>

                <!-- Customer (Constrained, cleanly truncated with initial avatar) -->
                <td class="py-2.5 px-3 min-w-[170px] max-w-[240px]">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div
                      @click="navigateToCustomer(slip.telegramId, slip.customerName, $event)"
                      class="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0 cursor-pointer hover:scale-105 transition-transform"
                      :title="'View ' + slip.customerName + ' in Customers'"
                    >
                      {{ getInitial(slip.customerName) }}
                    </div>
                    <div class="min-w-0 flex-1 overflow-hidden">
                      <div
                        @click="navigateToCustomer(slip.telegramId, slip.customerName, $event)"
                        class="font-semibold text-xs text-slate-900 dark:text-white truncate max-w-[170px] hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer transition-colors"
                        :title="slip.customerName"
                      >
                        {{ slip.customerName }}
                      </div>
                      <div class="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-500 truncate">
                        <span
                          v-if="slip.telegramUsername && slip.telegramUsername.toLowerCase() !== slip.customerName.toLowerCase()"
                          class="text-emerald-600 dark:text-emerald-400 font-medium truncate max-w-[80px]"
                          :title="slip.telegramUsername"
                        >
                          {{ slip.telegramUsername }}
                        </span>
                        <span
                          v-if="slip.telegramId"
                          class="inline-flex items-center gap-1 font-mono text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 truncate max-w-[95px]"
                          @click.stop="copyToClipboard(slip.telegramId, 'tg-' + slip.id, $event)"
                          :title="'Click to copy ID: ' + slip.telegramId"
                        >
                          <span class="truncate">ID: {{ slip.telegramId }}</span>
                          <i :class="copiedId === 'tg-' + slip.id ? 'pi pi-check text-emerald-500' : 'pi pi-copy text-[10px]'"></i>
                        </span>
                      </div>
                    </div>
                  </div>
                </td>

                <!-- Deposit Amount -->
                <td class="py-2.5 px-3 whitespace-nowrap">
                  <span class="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400">
                    +{{ slip.depositAmountMmk.toLocaleString() }} Ks
                  </span>
                </td>

                <!-- Status -->
                <td class="py-2.5 px-3 whitespace-nowrap">
                  <span
                    v-if="slip.status === 'SUBMITTED'"
                    @click="openSlipPreview(slip, $event)"
                    class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
                  >
                    <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                    <span>Review</span>
                  </span>
                  <span
                    v-else-if="slip.status === 'APPROVED'"
                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                  >
                    <i class="pi pi-check text-[9px]"></i>
                    <span>Approved</span>
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                  >
                    <i class="pi pi-times text-[9px]"></i>
                    <span>Rejected</span>
                  </span>
                </td>

                <!-- Actions -->
                <td class="py-2.5 px-3 text-right whitespace-nowrap">
                  <div v-if="slip.status === 'SUBMITTED'" class="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      @click="approveDeposit(slip, $event)"
                      :disabled="isProcessing"
                      class="px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-sm flex items-center gap-1"
                    >
                      <i v-if="approvingSlipId === slip.id" class="pi pi-spinner animate-spin text-[10px]"></i>
                      <i v-else class="pi pi-check text-[10px]"></i>
                      <span>Approve</span>
                    </button>
                    <button
                      type="button"
                      @click="openRejectDialog(slip, $event)"
                      :disabled="isProcessing"
                      class="px-2 py-1 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-500/10 border border-rose-500/20 transition-colors flex items-center gap-1"
                    >
                      <i class="pi pi-times text-[10px]"></i>
                      <span>Reject</span>
                    </button>
                  </div>
                  <div v-else class="text-xs text-slate-400">
                    <button
                      type="button"
                      @click="openSlipPreview(slip, $event)"
                      class="px-2.5 py-1 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1"
                    >
                      <i class="pi pi-eye text-[10px]"></i>
                      <span>View</span>
                    </button>
                  </div>
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

    <!-- Slip Review Lightbox Modal (Teleported to body for 100% full-screen coverage with no gap!) -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="isSlipModalOpen && selectedSlip"
          class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          @click.self="isSlipModalOpen = false"
        >
          <div class="modal-card relative w-full max-w-2xl bg-white dark:bg-[#0e1726] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 space-y-4">
            <!-- Modal Header -->
            <div class="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center text-lg shrink-0">
                  <i class="pi pi-receipt"></i>
                </div>
                <div>
                  <h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Deposit Slip Proof</span>
                    <span class="font-mono text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {{ selectedSlip.topUpId }}
                    </span>
                  </h3>
                  <p class="text-xs text-slate-500 dark:text-slate-400">
                    {{ selectedSlip.customerName }}
                    <span v-if="selectedSlip.telegramUsername && selectedSlip.telegramUsername.toLowerCase() !== selectedSlip.customerName.toLowerCase()" class="text-slate-400 font-normal">
                      ({{ selectedSlip.telegramUsername }})
                    </span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                @click="isSlipModalOpen = false"
                class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center text-xs transition-colors"
              >
                <i class="pi pi-times"></i>
              </button>
            </div>

            <!-- High-res Image Preview Area -->
            <div class="relative max-h-[55vh] overflow-auto rounded-2xl bg-black/40 border border-slate-200 dark:border-slate-800 flex items-center justify-center p-2 group">
              <img
                :src="selectedSlip.slipImageUrl"
                alt="Full Receipt"
                class="max-h-[50vh] object-contain rounded-xl shadow-md"
              />
              <a
                :href="selectedSlip.slipImageUrl"
                target="_blank"
                class="absolute top-4 right-4 px-3 py-1.5 rounded-xl bg-black/70 hover:bg-black/90 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg backdrop-blur-sm opacity-80 hover:opacity-100 transition-all"
                title="Open high-res receipt in new tab"
              >
                <i class="pi pi-external-link text-[11px]"></i>
                <span>Open Original</span>
              </a>
            </div>

            <!-- Transaction Details Row -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
              <div>
                <span class="text-slate-400 block">Deposit Amount:</span>
                <span class="font-bold text-emerald-500 text-sm font-mono">+{{ selectedSlip.depositAmountMmk.toLocaleString() }} Ks</span>
              </div>
              <div>
                <span class="text-slate-400 block">Payment Method:</span>
                <span class="font-bold text-slate-900 dark:text-white">{{ selectedSlip.paymentMethod }}</span>
              </div>
              <div>
                <span class="text-slate-400 block">Transaction Ref:</span>
                <span class="font-mono text-slate-800 dark:text-slate-200 truncate block">{{ selectedSlip.transactionRef }}</span>
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

              <div class="flex items-center gap-2.5">
                <button
                  type="button"
                  @click="isSlipModalOpen = false"
                  class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Close
                </button>
                <button
                  v-if="selectedSlip.status === 'SUBMITTED'"
                  type="button"
                  @click="approveDeposit(selectedSlip)"
                  :disabled="isProcessing"
                  class="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/30 transition-all disabled:opacity-50"
                >
                  <i v-if="approvingSlipId === selectedSlip.id" class="pi pi-spinner animate-spin"></i>
                  <i v-else class="pi pi-check"></i>
                  <span>{{ approvingSlipId === selectedSlip.id ? 'Approving & Crediting...' : `Approve & Credit (+${selectedSlip.depositAmountMmk.toLocaleString()} Ks)` }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Reject Reason Dialog (Teleported to body) -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="isRejectModalOpen && selectedSlip"
          class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          @click.self="!isProcessing && (isRejectModalOpen = false)"
        >
          <div class="modal-card w-full max-w-md bg-white dark:bg-[#0e1726] rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                <span>Reject Deposit Slip</span>
              </h3>
              <button
                type="button"
                @click="!isProcessing && (isRejectModalOpen = false)"
                :disabled="isProcessing"
                class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-30 transition-colors"
              >
                <i class="pi pi-times text-sm"></i>
              </button>
            </div>

            <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              State the reason why top-up <span class="font-mono text-slate-900 dark:text-white font-semibold">{{ selectedSlip.topUpId }}</span> was rejected. This explanation will be delivered directly to {{ selectedSlip.customerName }} on Telegram.
            </p>

            <textarea
              v-model="rejectReason"
              :disabled="isProcessing"
              rows="3"
              class="w-full p-3.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white focus:outline-none focus:border-rose-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              style="outline: none !important; box-shadow: none !important;"
              placeholder="e.g. ပြေစာ လွဲမှားနေပါသည် ခင်ဗျာ / Transaction reference not found on bank statement..."
            ></textarea>

            <div class="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                @click="isRejectModalOpen = false"
                :disabled="isProcessing"
                class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                @click="confirmReject"
                :disabled="isProcessing"
                class="inline-flex items-center justify-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/30 transition-all disabled:opacity-60"
              >
                <i v-if="isRejecting" class="pi pi-spinner animate-spin text-xs"></i>
                <i v-else class="pi pi-times-circle text-xs"></i>
                <span>{{ isRejecting ? 'Rejecting...' : 'Confirm Rejection' }}</span>
              </button>
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

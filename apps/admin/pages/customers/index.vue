<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from '~/composables/useToast'
import { useAuth } from '~/composables/useAuth'

const router = useRouter()
const toast = useToast()
const { getAuthHeaders } = useAuth()

interface CustomerItem {
  id: number
  telegramId: string | null
  username: string | null
  firstName: string
  lastName: string | null
  displayName: string
  role: string
  status: string
  walletBalanceMmk: number
  totalDepositedMmk: number
  totalSpentMmk: number
  ordersCount: number
  lastActive: string | null
  createdAt: string
}

interface CustomerStats {
  totalCustomers: number
  customersWithBalance: number
  totalWalletBalanceMmk: number
  totalSpentMmk: number
}

// State
const isLoading = ref(true)
const isRefreshing = ref(false)
const isFiltering = ref(false)
const customers = ref<CustomerItem[]>([])
const stats = ref<CustomerStats>({
  totalCustomers: 0,
  customersWithBalance: 0,
  totalWalletBalanceMmk: 0,
  totalSpentMmk: 0,
})

// Search & Filter with Debounce
const searchQuery = ref('')
const debouncedSearch = ref('')
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

watch(searchQuery, (newVal) => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => {
    debouncedSearch.value = newVal
  }, 250)
})

const balanceFilter = ref<'all' | 'has_balance' | 'zero_balance'>('all')
const sortBy = ref<'balance_desc' | 'balance_asc' | 'spent_desc' | 'orders_desc' | 'newest'>('balance_desc')
const statusFilter = ref<'active' | 'deactivated' | 'all'>('active')
const copiedId = ref<string | null>(null)

// Server-driven pagination state
const currentPage = ref(1)
const pageSize = ref(20)
const totalCount = ref(0)

// Quick Adjust Balance Modal
const isAdjustModalOpen = ref(false)
const adjustTargetCustomer = ref<CustomerItem | null>(null)
const adjustAction = ref<'CREDIT' | 'DEBIT'>('CREDIT')
const adjustAmount = ref<number | ''>('')
const adjustNotes = ref('')
const adjustNotifyTelegram = ref(true)
const isSubmittingAdjustment = ref(false)

// Deactivate (soft delete) Dialog
const isDeactivateModalOpen = ref(false)
const deactivateTarget = ref<CustomerItem | null>(null)
const deactivateReason = ref('')
const isDeactivating = ref(false)

// Row in-flight action guard
const actionInProgressId = ref<number | null>(null)

let fetchSeq = 0
let lastListSignature = ''
let pollInterval: ReturnType<typeof setInterval> | null = null

async function fetchCustomers(isSilent = false) {
  const hasData = customers.value.length > 0
  if (!isSilent) {
    if (hasData) {
      isFiltering.value = true
    } else {
      isLoading.value = true
    }
  }

  const seq = ++fetchSeq
  try {
    const params = new URLSearchParams()
    if (debouncedSearch.value.trim()) params.append('search', debouncedSearch.value.trim())
    if (balanceFilter.value !== 'all') params.append('balanceFilter', balanceFilter.value)
    if (sortBy.value) params.append('sortBy', sortBy.value)
    if (statusFilter.value !== 'all') params.append('statusFilter', statusFilter.value)
    params.append('page', String(currentPage.value))
    params.append('pageSize', String(pageSize.value))

    const res: any = await $fetch(`/api/admin/customers?${params.toString()}`, {
      headers: getAuthHeaders(),
    })

    if (seq !== fetchSeq) return

    if (res?.ok) {
      const fresh: CustomerItem[] = res.customers || []
      totalCount.value = typeof res.total === 'number' ? res.total : fresh.length
      if (res.stats) stats.value = res.stats

      const signature = JSON.stringify(fresh)
      if (isSilent && signature === lastListSignature) return
      lastListSignature = signature

      applyCustomerRows(fresh, isSilent)
    }
  } catch (err: any) {
    console.error('Error fetching customers:', err)
    if (!isSilent) {
      toast.error('Failed to load customer list', 'Error')
    }
  } finally {
    if (seq === fetchSeq) {
      isLoading.value = false
      isFiltering.value = false
    }
    isRefreshing.value = false
  }
}

function applyCustomerRows(fresh: CustomerItem[], patchInPlace: boolean) {
  if (patchInPlace) {
    const current = customers.value
    const sameShape = current.length === fresh.length && current.every((c, i) => c.id === fresh[i].id)

    if (sameShape) {
      current.forEach((row, i) => {
        Object.assign(row, fresh[i])
      })
      return
    }
  }
  customers.value = fresh
}

async function refreshCustomers() {
  isRefreshing.value = true
  await fetchCustomers(true)
  toast.info('Customer wallets synced', 'Refreshed')
}

// Watch filters to reset page to 1
watch([debouncedSearch, balanceFilter, sortBy, statusFilter, pageSize], () => {
  currentPage.value = 1
  fetchCustomers(false)
})

watch(currentPage, () => {
  fetchCustomers(false)
})

onMounted(() => {
  fetchCustomers(false)
  pollInterval = setInterval(() => {
    fetchCustomers(true)
  }, 4000)
})

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval)
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
})

// Pagination helpers
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)))

const showingRange = computed(() => {
  if (totalCount.value === 0) return 'Showing 0-0 of 0'
  const start = (currentPage.value - 1) * pageSize.value + 1
  const end = Math.min(start + pageSize.value - 1, totalCount.value)
  return `Showing ${start}-${end} of ${totalCount.value}`
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

// Navigation to customer detail page
function navigateToCustomer(customer: CustomerItem) {
  const targetId = customer.telegramId || customer.id
  router.push(`/customers/${targetId}`)
}

// Open Quick Adjust Balance Modal
function openAdjustModal(customer: CustomerItem, event?: Event) {
  if (event) event.stopPropagation()
  adjustTargetCustomer.value = customer
  adjustAction.value = 'CREDIT'
  adjustAmount.value = ''
  adjustNotes.value = ''
  adjustNotifyTelegram.value = true
  isAdjustModalOpen.value = true
}

function setQuickAdjust(amount: number) {
  adjustAmount.value = amount
}

async function submitBalanceAdjustment() {
  if (!adjustTargetCustomer.value) return
  if (!adjustAmount.value || Number(adjustAmount.value) <= 0) {
    toast.error('Please enter a valid amount greater than 0', 'Invalid Amount')
    return
  }
  if (!adjustNotes.value.trim()) {
    toast.error('Please provide a reason or note for this adjustment', 'Reason Required')
    return
  }

  if (adjustAction.value === 'DEBIT' && adjustTargetCustomer.value.walletBalanceMmk < Number(adjustAmount.value)) {
    toast.error(
      `Cannot debit ${Number(adjustAmount.value).toLocaleString()} MMK. Customer only has ${adjustTargetCustomer.value.walletBalanceMmk.toLocaleString()} MMK.`,
      'Insufficient Balance'
    )
    return
  }

  isSubmittingAdjustment.value = true
  try {
    const res: any = await $fetch(`/api/admin/customers/${adjustTargetCustomer.value.id}/adjust-balance`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: {
        action: adjustAction.value,
        amountMmk: Number(adjustAmount.value),
        notes: adjustNotes.value.trim(),
        notifyTelegram: adjustNotifyTelegram.value,
      },
    })

    if (res?.ok) {
      toast.success(
        res.message || `Wallet balance successfully ${adjustAction.value === 'CREDIT' ? 'credited' : 'debited'}!`,
        'Adjustment Saved'
      )
      isAdjustModalOpen.value = false

      // Update in local state
      const updatedBalance = res.newBalanceMmk
      const targetId = adjustTargetCustomer.value.id
      const found = customers.value.find(c => c.id === targetId)
      if (found) {
        found.walletBalanceMmk = updatedBalance
      }

      fetchCustomers(true)
    } else {
      toast.error(res?.error || 'Failed to adjust balance', 'Adjustment Failed')
    }
  } catch (err: any) {
    const msg = err.data?.error || err.message || 'Error occurred while adjusting balance'
    toast.error(msg, 'Error')
  } finally {
    isSubmittingAdjustment.value = false
  }
}

// Deactivate (soft delete)
function openDeactivateModal(customer: CustomerItem, event?: Event) {
  if (event) event.stopPropagation()
  deactivateTarget.value = customer
  deactivateReason.value = ''
  isDeactivateModalOpen.value = true
}

async function confirmDeactivate() {
  if (!deactivateTarget.value || isDeactivating.value) return

  isDeactivating.value = true
  const target = deactivateTarget.value
  try {
    const res: any = await $fetch(`/api/admin/customers/${target.id}/deactivate`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: { reason: deactivateReason.value.trim() || undefined },
    })

    if (res?.ok) {
      isDeactivateModalOpen.value = false
      if (statusFilter.value !== 'deactivated') {
        customers.value = customers.value.filter(c => c.id !== target.id)
        totalCount.value = Math.max(0, totalCount.value - 1)
      }

      toast.showToast({
        type: 'success',
        title: 'Customer Deactivated',
        message: `${target.displayName} can no longer use the bot. All history is preserved.`,
        duration: 10000,
        action: {
          label: 'Undo',
          handler: () => restoreCustomer(target, true),
        },
      })

      fetchCustomers(true)
    } else {
      toast.error(res?.error || 'Failed to deactivate customer', 'Deactivation Failed')
    }
  } catch (err: any) {
    const msg = err.data?.error || err.message || 'Error occurred while deactivating customer'
    toast.error(msg, 'Error')
  } finally {
    isDeactivating.value = false
  }
}

async function restoreCustomer(customer: CustomerItem, viaUndo = false, event?: Event) {
  if (event) event.stopPropagation()
  if (actionInProgressId.value) return

  actionInProgressId.value = customer.id
  try {
    const res: any = await $fetch(`/api/admin/customers/${customer.id}/restore`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })

    if (res?.ok) {
      if (viaUndo) {
        toast.success(`${customer.displayName} is active again.`, 'Undo Successful')
      } else {
        toast.success(`${customer.displayName} has been restored and can use the bot again.`, 'Customer Restored')
      }

      if (statusFilter.value === 'deactivated') {
        customers.value = customers.value.filter(c => c.id !== customer.id)
        totalCount.value = Math.max(0, totalCount.value - 1)
      }

      fetchCustomers(true)
    } else {
      toast.error(res?.error || 'Failed to restore customer', 'Restore Failed')
    }
  } catch (err: any) {
    const msg = err.data?.error || err.message || 'Error occurred while restoring customer'
    toast.error(msg, 'Error')
  } finally {
    actionInProgressId.value = null
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
</script>

<template>
  <div class="space-y-6">
    <!-- Page Header & KPIs matching orders.vue and payments.vue design -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
          <i class="pi pi-users text-indigo-600 dark:text-indigo-400"></i>
          <span>Customer Wallets & Accounts</span>
          <span class="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            Real-time Balances
          </span>
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Inspect user balances, activity, and manage customer accounts with full audit trails.
        </p>
      </div>

      <!-- Quick Status Badges & Refresh -->
      <div class="flex flex-wrap items-center gap-2.5">
        <div class="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-sm">
          <span class="relative flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span>Live Sync</span>
        </div>

        <button
          type="button"
          @click="refreshCustomers"
          :disabled="isRefreshing"
          class="p-2 rounded-xl text-xs border border-slate-200 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all shrink-0"
          title="Manual refresh"
        >
          <i class="pi pi-sync text-xs" :class="{ 'animate-spin': isRefreshing }"></i>
        </button>
      </div>
    </div>

    <!-- Stats Summary Row matching other pages -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-xl">
          <i class="pi pi-users"></i>
        </div>
        <div>
          <div class="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Customers</div>
          <div class="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
            {{ stats.totalCustomers }} Accounts
          </div>
        </div>
      </div>

      <div class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-teal-500/10 text-teal-500 flex items-center justify-center text-xl">
          <i class="pi pi-wallet"></i>
        </div>
        <div>
          <div class="text-xs font-medium text-slate-400 uppercase tracking-wider">With Balance</div>
          <div class="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
            {{ stats.customersWithBalance }} / {{ stats.totalCustomers }}
          </div>
        </div>
      </div>

      <div class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center text-xl">
          <i class="pi pi-sparkles"></i>
        </div>
        <div>
          <div class="text-xs font-medium text-slate-400 uppercase tracking-wider">In-Wallets Total</div>
          <div class="text-lg font-bold text-indigo-600 dark:text-indigo-400 mt-0.5 font-mono">
            {{ formatCurrency(stats.totalWalletBalanceMmk) }}
          </div>
        </div>
      </div>

      <div class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center text-xl">
          <i class="pi pi-shopping-bag"></i>
        </div>
        <div>
          <div class="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Spent</div>
          <div class="text-lg font-bold text-slate-900 dark:text-white mt-0.5 font-mono">
            {{ formatCurrency(stats.totalSpentMmk) }}
          </div>
        </div>
      </div>
    </div>

    <!-- Integrated Unified Customer Table Card (No awkward sticky overlaps or random middle lines) -->
    <div class="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col overflow-hidden">
      <!-- Integrated Filter & Search Toolbar (Smooth, no shaking or twitching) -->
      <div class="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <!-- Status Tabs: All / Active / Deactivated -->
        <div class="flex items-center gap-1.5 overflow-x-auto text-xs font-semibold scrollbar-none">
          <button
            type="button"
            @click="statusFilter = 'all'"
            :class="statusFilter === 'all' ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'"
            class="px-3.5 py-1.5 rounded-xl transition-colors duration-150 shrink-0 font-semibold"
          >
            All ({{ stats.totalCustomers }})
          </button>

          <button
            type="button"
            @click="statusFilter = 'active'"
            :class="statusFilter === 'active' ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'"
            class="px-3.5 py-1.5 rounded-xl transition-colors duration-150 flex items-center gap-1.5 shrink-0 font-semibold"
          >
            <i class="pi pi-check text-[10px]"></i>
            <span>Active</span>
          </button>

          <button
            type="button"
            @click="statusFilter = 'deactivated'"
            :class="statusFilter === 'deactivated' ? 'bg-rose-600 text-white shadow-sm shadow-rose-600/20' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'"
            class="px-3.5 py-1.5 rounded-xl transition-colors duration-150 flex items-center gap-1.5 shrink-0 font-semibold"
          >
            <i class="pi pi-ban text-[10px]"></i>
            <span>Deactivated</span>
          </button>
        </div>

        <!-- Search, Balances & Sort Controls (Fixed widths, no twitching/jumping) -->
        <div class="flex items-center gap-2 flex-wrap">
          <!-- Search Input (Debounced, smooth border focus, zero white ring) -->
          <div class="relative w-full sm:w-56 shrink-0">
            <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search ID, name, @usern..."
              class="w-full pl-8 pr-7 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/70 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-500 focus:ring-0 transition-colors duration-150"
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

          <!-- Balance Filter Select -->
          <select
            v-model="balanceFilter"
            class="px-3 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/70 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-500 focus:ring-0 transition-colors duration-150 shrink-0 cursor-pointer"
            style="outline: none !important; box-shadow: none !important;"
          >
            <option value="all">All Balances</option>
            <option value="has_balance">Has Balance (> 0)</option>
            <option value="zero_balance">Zero Balance (0)</option>
          </select>

          <!-- Sort Select -->
          <select
            v-model="sortBy"
            class="px-3 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/70 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-500 focus:ring-0 transition-colors duration-150 shrink-0 cursor-pointer"
            style="outline: none !important; box-shadow: none !important;"
          >
            <option value="balance_desc">Balance: High → Low</option>
            <option value="balance_asc">Balance: Low → High</option>
            <option value="spent_desc">Most Spent</option>
            <option value="orders_desc">Most Orders</option>
            <option value="newest">Newest Customers</option>
          </select>
        </div>
      </div>

      <!-- Silky Smooth Shimmer Loading Bar (Appears gently during filter changes) -->
      <div class="h-0.5 w-full bg-slate-100 dark:bg-slate-800/40 overflow-hidden relative">
        <div
          v-if="isFiltering"
          class="h-full bg-emerald-500 animate-indeterminate-bar rounded-full"
        ></div>
      </div>

      <!-- Fixed Max-Height Scrollable Table Viewport -->
      <div class="overflow-x-auto overflow-y-auto max-h-[calc(100vh-320px)] min-h-[380px] relative scrollbar-thin">
        <table class="w-full text-left border-collapse text-sm">
          <thead class="sticky top-0 z-10 bg-slate-50 dark:bg-[#0e172a] shadow-sm border-b border-slate-200 dark:border-slate-800">
            <tr class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <th class="py-3 px-4 w-60 max-w-[240px]">Customer</th>
              <th class="py-3 px-4">Status</th>
              <th class="py-3 px-4">Wallet Balance</th>
              <th class="py-3 px-4">Deposited</th>
              <th class="py-3 px-4">Total Spent</th>
              <th class="py-3 px-4">Orders</th>
              <th class="py-3 px-4">Joined / Active</th>
              <th class="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>

          <tbody
            class="divide-y divide-slate-100 dark:divide-slate-800/60 text-sm transition-opacity duration-300 ease-in-out"
            :class="{ 'opacity-40 pointer-events-none': isFiltering }"
          >
            <!-- Skeleton Loading State (Initial Load only) -->
            <template v-if="isLoading">
              <tr v-for="i in 6" :key="'skel-' + i" class="animate-pulse">
                <td class="py-4 px-4 w-60 max-w-[240px]">
                  <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-800 shrink-0"></div>
                    <div class="space-y-1.5 flex-1">
                      <div class="h-3.5 w-24 rounded bg-slate-200 dark:bg-slate-800"></div>
                      <div class="h-2.5 w-16 rounded bg-slate-200 dark:bg-slate-800"></div>
                    </div>
                  </div>
                </td>
                <td class="py-4 px-4"><div class="h-5 w-16 rounded-full bg-slate-200 dark:bg-slate-800"></div></td>
                <td class="py-4 px-4"><div class="h-4 w-20 rounded bg-slate-200 dark:bg-slate-800"></div></td>
                <td class="py-4 px-4"><div class="h-4 w-16 rounded bg-slate-200 dark:bg-slate-800"></div></td>
                <td class="py-4 px-4"><div class="h-4 w-16 rounded bg-slate-200 dark:bg-slate-800"></div></td>
                <td class="py-4 px-4"><div class="h-4 w-12 rounded bg-slate-200 dark:bg-slate-800"></div></td>
                <td class="py-4 px-4"><div class="h-3.5 w-20 rounded bg-slate-200 dark:bg-slate-800"></div></td>
                <td class="py-4 px-4 text-right"><div class="h-7 w-20 rounded-xl bg-slate-200 dark:bg-slate-800 ml-auto"></div></td>
              </tr>
            </template>

            <!-- Empty State -->
            <tr v-else-if="customers.length === 0">
              <td colspan="8" class="py-14 text-center">
                <div class="flex flex-col items-center justify-center max-w-sm mx-auto">
                  <div class="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 text-2xl mb-3">
                    <i class="pi pi-users"></i>
                  </div>
                  <h3 class="text-sm font-semibold text-slate-800 dark:text-slate-200">No Customers Found</h3>
                  <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {{ searchQuery ? 'Try adjusting your search or clear filters' : 'Customers will appear here once they interact with the bot' }}
                  </p>
                  <button
                    v-if="searchQuery || balanceFilter !== 'all' || statusFilter !== 'active'"
                    type="button"
                    @click="searchQuery = ''; balanceFilter = 'all'; statusFilter = 'active'"
                    class="mt-4 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm"
                  >
                    Reset Filters
                  </button>
                </div>
              </td>
            </tr>

            <!-- Customer Rows with constrained widths & proper ellipsis -->
            <template v-else>
              <tr
                v-for="c in customers"
                :key="'cust-' + c.id"
                @click="navigateToCustomer(c)"
                class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group"
              >
                <!-- Customer info: Constrained width with clean ellipsis -->
                <td class="py-3 px-4 w-60 max-w-[240px]">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                      {{ getInitial(c.displayName) }}
                    </div>
                    <div class="min-w-0 flex-1 overflow-hidden">
                      <div
                        class="font-semibold text-slate-900 dark:text-white truncate max-w-[170px]"
                        :title="c.displayName"
                      >
                        <span class="group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {{ c.displayName }}
                        </span>
                      </div>
                      <div class="flex items-center gap-1.5 mt-0.5 text-xs text-slate-500 truncate">
                        <span v-if="c.username" class="text-emerald-600 dark:text-emerald-400 font-medium truncate max-w-[80px]" :title="'@' + c.username">
                          @{{ c.username }}
                        </span>
                        <span
                          v-if="c.telegramId"
                          class="inline-flex items-center gap-1 font-mono text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 truncate max-w-[110px]"
                          @click.stop="copyToClipboard(c.telegramId, 'id-' + c.id, $event)"
                          :title="'Click to copy ID: ' + c.telegramId"
                        >
                          <span class="truncate">ID: {{ c.telegramId }}</span>
                          <i :class="copiedId === 'id-' + c.id ? 'pi pi-check text-emerald-500' : 'pi pi-copy text-[10px]'"></i>
                        </span>
                      </div>
                    </div>
                  </div>
                </td>

                <!-- Status -->
                <td class="py-3 px-4 whitespace-nowrap">
                  <span
                    v-if="c.status === 'ACTIVE'"
                    class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                  >
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <span>Active</span>
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                  >
                    <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                    <span>Deactivated</span>
                  </span>
                </td>

                <!-- Wallet Balance -->
                <td class="py-3 px-4 whitespace-nowrap">
                  <div class="font-bold text-slate-900 dark:text-white font-mono text-sm" :class="{ 'text-emerald-600 dark:text-emerald-400': c.walletBalanceMmk > 0 }">
                    {{ formatCurrency(c.walletBalanceMmk) }}
                  </div>
                </td>

                <!-- Deposited -->
                <td class="py-3 px-4 text-xs font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                  {{ formatCurrency(c.totalDepositedMmk) }}
                </td>

                <!-- Total Spent -->
                <td class="py-3 px-4 text-xs font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                  {{ formatCurrency(c.totalSpentMmk) }}
                </td>

                <!-- Orders Count -->
                <td class="py-3 px-4 whitespace-nowrap">
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60">
                    <i class="pi pi-shopping-bag text-[10px]"></i>
                    <span>{{ c.ordersCount }} orders</span>
                  </span>
                </td>

                <!-- Joined / Active -->
                <td class="py-3 px-4 text-xs text-slate-500 dark:text-slate-400 font-mono whitespace-nowrap">
                  <div>{{ c.lastActive ? new Date(c.lastActive).toLocaleDateString() : (c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '-') }}</div>
                  <div class="text-[10px] text-slate-400">{{ c.lastActive ? new Date(c.lastActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '' }}</div>
                </td>

                <!-- Actions -->
                <td class="py-3 px-4 text-right whitespace-nowrap">
                  <div class="inline-flex items-center gap-1.5" @click.stop>
                    <button
                      type="button"
                      @click="navigateToCustomer(c)"
                      class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors inline-flex items-center gap-1 shadow-sm"
                      title="View Details"
                    >
                      <i class="pi pi-arrow-right text-[10px]"></i>
                      <span>Details</span>
                    </button>

                    <button
                      type="button"
                      @click="openAdjustModal(c, $event)"
                      class="p-1.5 rounded-xl text-xs border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                      title="Adjust Balance"
                    >
                      <i class="pi pi-wallet text-xs"></i>
                    </button>

                    <button
                      v-if="c.status === 'ACTIVE'"
                      type="button"
                      @click="openDeactivateModal(c, $event)"
                      class="p-1.5 rounded-xl text-xs border border-slate-200 dark:border-slate-700/60 text-slate-500 hover:text-rose-500 hover:border-rose-500/30 dark:hover:border-rose-500/30 transition-colors"
                      title="Deactivate customer"
                    >
                      <i class="pi pi-ban text-xs"></i>
                    </button>
                    <button
                      v-else
                      type="button"
                      @click="restoreCustomer(c, false, $event)"
                      :disabled="actionInProgressId === c.id"
                      class="p-1.5 rounded-xl text-xs border border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 transition-colors"
                      title="Restore customer"
                    >
                      <i v-if="actionInProgressId === c.id" class="pi pi-spinner animate-spin text-xs"></i>
                      <i v-else class="pi pi-check text-xs"></i>
                    </button>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <!-- Pagination Footer -->
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

    <!-- Quick Adjust Balance Modal (Teleported to body for 100% full-screen backdrop coverage with no gap!) -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="isAdjustModalOpen && adjustTargetCustomer"
          class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          @click.self="isAdjustModalOpen = false"
        >
          <div class="modal-card relative w-full max-w-lg bg-white dark:bg-[#0e1726] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 space-y-5">
            <div class="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-lg">
                  <i class="pi pi-wallet"></i>
                </div>
                <div>
                  <h3 class="text-base font-bold text-slate-900 dark:text-white">Adjust Customer Balance</h3>
                  <p class="text-xs text-slate-500 dark:text-slate-400">
                    {{ adjustTargetCustomer.displayName }} (Current: {{ formatCurrency(adjustTargetCustomer.walletBalanceMmk) }})
                  </p>
                </div>
              </div>
              <button
                type="button"
                @click="isAdjustModalOpen = false"
                class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center text-xs transition-colors"
              >
                <i class="pi pi-times"></i>
              </button>
            </div>

            <!-- CREDIT or DEBIT switch -->
            <div class="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-900/80 rounded-xl border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                @click="adjustAction = 'CREDIT'"
                :class="adjustAction === 'CREDIT' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
                class="py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5"
              >
                <i class="pi pi-plus text-[10px]"></i>
                <span>Deposit / Credit (+)</span>
              </button>
              <button
                type="button"
                @click="adjustAction = 'DEBIT'"
                :class="adjustAction === 'DEBIT' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
                class="py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5"
              >
                <i class="pi pi-minus text-[10px]"></i>
                <span>Deduct / Debit (-)</span>
              </button>
            </div>

            <!-- Amount Input & Quick Chips -->
            <div>
              <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Adjustment Amount (MMK)</label>
              <div class="relative">
                <input
                  v-model.number="adjustAmount"
                  type="number"
                  min="1"
                  placeholder="e.g. 10000"
                  class="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white text-sm font-mono focus:outline-none focus:border-emerald-500 focus:ring-0"
                  style="outline: none !important; box-shadow: none !important;"
                />
                <span class="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-semibold">MMK</span>
              </div>
              <!-- Quick Suggestion Chips -->
              <div class="flex items-center gap-1.5 mt-2 flex-wrap">
                <button
                  v-for="amt in [5000, 10000, 20000, 50000, 100000]"
                  :key="'chip-' + amt"
                  type="button"
                  @click="setQuickAdjust(amt)"
                  class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors border border-slate-200 dark:border-slate-700/60"
                >
                  +{{ (amt / 1000).toLocaleString() }}k
                </button>
              </div>
            </div>

            <!-- Note / Reason -->
            <div>
              <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Reason / Audit Note</label>
              <input
                v-model="adjustNotes"
                type="text"
                placeholder="e.g. Manual top-up via KPay direct transfer"
                class="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-emerald-500 focus:ring-0"
                style="outline: none !important; box-shadow: none !important;"
              />
            </div>

            <!-- Telegram Notification Checkbox -->
            <div class="flex items-center gap-2.5">
              <input
                id="notify-tg"
                v-model="adjustNotifyTelegram"
                type="checkbox"
                class="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <label for="notify-tg" class="text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                Notify customer directly via Telegram Bot message
              </label>
            </div>

            <!-- Modal Actions -->
            <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                @click="isAdjustModalOpen = false"
                class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                @click="submitBalanceAdjustment"
                :disabled="isSubmittingAdjustment"
                class="px-5 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-md flex items-center gap-1.5"
                :class="adjustAction === 'CREDIT' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20' : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'"
              >
                <i v-if="isSubmittingAdjustment" class="pi pi-spinner animate-spin text-xs"></i>
                <span>{{ isSubmittingAdjustment ? 'Processing...' : (adjustAction === 'CREDIT' ? 'Apply Credit' : 'Apply Debit') }}</span>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Deactivate Customer Modal (Teleported to body for 100% full-screen backdrop coverage) -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="isDeactivateModalOpen && deactivateTarget"
          class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          @click.self="isDeactivateModalOpen = false"
        >
          <div class="modal-card relative w-full max-w-md bg-white dark:bg-[#0e1726] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 space-y-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center text-lg shrink-0">
                <i class="pi pi-exclamation-triangle"></i>
              </div>
              <div>
                <h3 class="text-base font-bold text-slate-900 dark:text-white">Deactivate Customer?</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  {{ deactivateTarget.displayName }}
                </p>
              </div>
            </div>

            <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Deactivating prevents this customer from buying products or interacting with the bot. All transaction history and wallet balances will be safely preserved and can be restored anytime.
            </p>

            <div>
              <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Reason (Optional)</label>
              <input
                v-model="deactivateReason"
                type="text"
                placeholder="e.g. Chargeback dispute or suspicious activity"
                class="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-rose-500 focus:ring-0"
                style="outline: none !important; box-shadow: none !important;"
              />
            </div>

            <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                @click="isDeactivateModalOpen = false"
                class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                @click="confirmDeactivate"
                :disabled="isDeactivating"
                class="px-5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-all shadow-md shadow-rose-600/20 flex items-center gap-1.5"
              >
                <i v-if="isDeactivating" class="pi pi-spinner animate-spin text-xs"></i>
                <span>{{ isDeactivating ? 'Deactivating...' : 'Deactivate Account' }}</span>
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

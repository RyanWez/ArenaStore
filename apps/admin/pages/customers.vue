<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useToast } from '~/composables/useToast'
import { useAuth } from '~/composables/useAuth'

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
const customers = ref<CustomerItem[]>([])
const stats = ref<CustomerStats>({
  totalCustomers: 0,
  customersWithBalance: 0,
  totalWalletBalanceMmk: 0,
  totalSpentMmk: 0,
})

// Search & Filter
const searchQuery = ref('')
const balanceFilter = ref<'all' | 'has_balance' | 'zero_balance'>('all')
const sortBy = ref<'balance_desc' | 'balance_asc' | 'spent_desc' | 'orders_desc' | 'newest'>('balance_desc')
const copiedId = ref<string | null>(null)

// Detail Drawer / View State
const isDetailOpen = ref(false)
const isLoadingDetail = ref(false)
const selectedCustomer = ref<CustomerItem | null>(null)
const customerDetailData = ref<{
  orders: any[]
  topUps: any[]
  ledger: any[]
}>({
  orders: [],
  topUps: [],
  ledger: [],
})
const detailActiveTab = ref<'orders' | 'topups' | 'ledger'>('orders')

// Slip Modal in Detail
const selectedSlipUrl = ref<string | null>(null)
const isSlipPreviewOpen = ref(false)

// Adjust Balance Modal
const isAdjustModalOpen = ref(false)
const adjustTargetCustomer = ref<CustomerItem | null>(null)
const adjustAction = ref<'CREDIT' | 'DEBIT'>('CREDIT')
const adjustAmount = ref<number | ''>('')
const adjustNotes = ref('')
const adjustNotifyTelegram = ref(true)
const isSubmittingAdjustment = ref(false)

// Fetch customers list
async function fetchCustomers(isSilent = false) {
  if (!isSilent) isLoading.value = true
  try {
    const params = new URLSearchParams()
    if (searchQuery.value.trim()) params.append('search', searchQuery.value.trim())
    if (balanceFilter.value !== 'all') params.append('balanceFilter', balanceFilter.value)
    if (sortBy.value) params.append('sortBy', sortBy.value)

    const res: any = await $fetch(`/api/admin/customers?${params.toString()}`, {
      headers: getAuthHeaders(),
    })

    if (res?.ok) {
      customers.value = res.customers || []
      if (res.stats) {
        stats.value = res.stats
      }
    }
  } catch (err: any) {
    console.error('Error fetching customers:', err)
    if (!isSilent) {
      toast.error('Failed to load customer list', 'Error')
    }
  } finally {
    if (!isSilent) isLoading.value = false
    isRefreshing.value = false
  }
}

// Refresh manually
async function refreshCustomers() {
  isRefreshing.value = true
  await fetchCustomers(true)
  toast.info('Customer wallets synced', 'Refreshed')
}

// Open Detail View
async function openCustomerDetail(customer: CustomerItem) {
  selectedCustomer.value = customer
  isDetailOpen.value = true
  detailActiveTab.value = 'orders'
  isLoadingDetail.value = true

  try {
    const res: any = await $fetch(`/api/admin/customers/${customer.id}`, {
      headers: getAuthHeaders(),
    })

    if (res?.ok) {
      customerDetailData.value = {
        orders: res.orders || [],
        topUps: res.topUps || [],
        ledger: res.ledger || [],
      }
      // Update selected customer with freshest wallet data
      if (res.wallet) {
        selectedCustomer.value = {
          ...customer,
          walletBalanceMmk: res.wallet.balanceMmk,
          totalDepositedMmk: res.wallet.totalDepositedMmk,
          totalSpentMmk: res.wallet.totalSpentMmk,
        }
      }
    }
  } catch (err: any) {
    console.error('Error fetching customer details:', err)
    toast.error('Failed to load full customer history', 'Error')
  } finally {
    isLoadingDetail.value = false
  }
}

function closeDetail() {
  isDetailOpen.value = false
  selectedCustomer.value = null
}

// Open Adjust Balance Modal
function openAdjustModal(customer: CustomerItem) {
  adjustTargetCustomer.value = customer
  adjustAction.value = 'CREDIT'
  adjustAmount.value = ''
  adjustNotes.value = ''
  adjustNotifyTelegram.value = true
  isAdjustModalOpen.value = true
}

// Quick amount buttons
function addQuickAmount(amt: number) {
  const current = Number(adjustAmount.value) || 0
  adjustAmount.value = current + amt
}

function setQuickAmount(amt: number) {
  adjustAmount.value = amt
}

// Projected balance
const projectedBalance = computed(() => {
  if (!adjustTargetCustomer.value) return 0
  const current = adjustTargetCustomer.value.walletBalanceMmk || 0
  const amt = Number(adjustAmount.value) || 0
  if (adjustAction.value === 'CREDIT') {
    return current + amt
  } else {
    return Math.max(0, current - amt)
  }
})

// Submit Balance Adjustment
async function submitAdjustment() {
  if (!adjustTargetCustomer.value || !adjustAmount.value || Number(adjustAmount.value) <= 0) {
    toast.warn('Please enter a valid amount', 'Invalid Amount')
    return
  }

  if (!adjustNotes.value.trim()) {
    toast.warn('Please enter a reason or note for this adjustment', 'Reason Required')
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

      if (selectedCustomer.value && selectedCustomer.value.id === targetId) {
        selectedCustomer.value.walletBalanceMmk = updatedBalance
        // Re-fetch detail to refresh ledger
        openCustomerDetail(selectedCustomer.value)
      }

      // Re-fetch silent
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

// Copy helper
function copyToClipboard(text: string, id: string) {
  navigator.clipboard.writeText(text)
  copiedId.value = id
  toast.info(`Copied "${text}" to clipboard.`, 'Copied')
  setTimeout(() => {
    copiedId.value = null
  }, 2000)
}

// Avatar color palette based on name/ID hash
function getAvatarColorClass(id: number | string): string {
  const colors = [
    'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    'bg-indigo-500/20 text-indigo-400 border-indigo-500/40',
    'bg-blue-500/20 text-blue-400 border-blue-500/40',
    'bg-purple-500/20 text-purple-400 border-purple-500/40',
    'bg-rose-500/20 text-rose-400 border-rose-500/40',
    'bg-amber-500/20 text-amber-400 border-amber-500/40',
    'bg-teal-500/20 text-teal-400 border-teal-500/40',
    'bg-cyan-500/20 text-cyan-400 border-cyan-500/40',
  ]
  const num = typeof id === 'number' ? id : id.charCodeAt(0) || 0
  return colors[num % colors.length]
}

function getInitial(name: string): string {
  if (!name) return '?'
  const clean = name.trim().replace(/^@/, '')
  return (clean.charAt(0) || '?').toUpperCase()
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  const date = new Date(d)
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(d: string | null): string {
  if (!d) return '—'
  const date = new Date(d)
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Watch filters to trigger fetch
let debounceTimeout: any = null
watch([searchQuery, balanceFilter, sortBy], () => {
  clearTimeout(debounceTimeout)
  debounceTimeout = setTimeout(() => {
    fetchCustomers(false)
  }, 300)
})

let autoPollInterval: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  fetchCustomers(false)
  autoPollInterval = setInterval(() => {
    fetchCustomers(true)
  }, 10000)
})

onUnmounted(() => {
  if (autoPollInterval) clearInterval(autoPollInterval)
})
</script>

<template>
  <div class="space-y-6 pb-16">
    <!-- Top Header -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-3">
          <h1 class="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <i class="pi pi-users text-emerald-400 text-xl"></i>
            <span>Customer Wallets</span>
          </h1>
          <div class="flex items-center gap-2 px-3 py-1 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm">
            <span class="relative flex h-2 w-2">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>Live Sync</span>
          </div>
        </div>
        <p class="text-sm text-slate-400 mt-1">
          Inspect user balances, activity, and perform administrative adjustments
        </p>
      </div>

      <div class="flex items-center gap-2.5">
        <button
          type="button"
          @click="refreshCustomers"
          :disabled="isRefreshing"
          class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800/80 hover:bg-slate-800 active:scale-95 text-slate-200 border border-slate-700 shadow-sm transition-all disabled:opacity-50"
          title="Manual refresh"
        >
          <i class="pi pi-refresh text-xs" :class="{ 'animate-spin': isRefreshing }"></i>
          <span>{{ isRefreshing ? 'Syncing...' : 'Refresh' }}</span>
        </button>
      </div>
    </div>

    <!-- KPI Summary Row (Matching Reference Screenshot 1) -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <!-- Left Metric Pills -->
      <div class="flex flex-wrap items-center gap-2.5">
        <!-- Total Users Pill -->
        <div class="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900/90 border border-emerald-500/30 text-slate-200 text-xs font-semibold shadow-sm">
          <i class="pi pi-users text-emerald-400 text-sm"></i>
          <span class="text-emerald-400 font-bold text-sm">{{ stats.totalCustomers }}</span>
          <span class="text-slate-400 font-normal">Total</span>
        </div>

        <!-- Has Balance Pill -->
        <div class="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900/90 border border-teal-500/30 text-slate-200 text-xs font-semibold shadow-sm">
          <i class="pi pi-wallet text-teal-400 text-sm"></i>
          <span class="text-teal-400 font-bold text-sm">{{ stats.customersWithBalance }}</span>
          <span class="text-slate-400 font-normal">Has Balance</span>
        </div>

        <!-- In-Wallets Total Pill -->
        <div class="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900/90 border border-indigo-500/30 text-slate-200 text-xs font-semibold shadow-sm">
          <i class="pi pi-sparkles text-indigo-400 text-sm"></i>
          <span class="text-indigo-400 font-bold text-sm">{{ stats.totalWalletBalanceMmk.toLocaleString() }} MMK</span>
          <span class="text-slate-400 font-normal">Total Balance</span>
        </div>
      </div>

      <!-- Right Total Spent Pill -->
      <div class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs font-semibold shadow-sm">
        <i class="pi pi-money-bill text-emerald-400 text-sm"></i>
        <span class="text-emerald-300 font-bold text-sm">{{ stats.totalSpentMmk.toLocaleString() }} MMK</span>
        <span class="text-slate-400 font-normal">Total Spent</span>
      </div>
    </div>

    <!-- Search & Filter Bar (Sticky under navbar) -->
    <div class="sticky top-16 z-20 p-3.5 rounded-2xl bg-[#0b1220]/95 backdrop-blur-md border border-slate-800/80 shadow-lg space-y-2.5">
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <!-- Search Input -->
        <div class="relative flex-1">
          <i class="pi pi-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm"></i>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search by Chat ID, name, or @username..."
            class="w-full pl-10 pr-9 py-2 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-200 text-xs placeholder-slate-500 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/60 transition-all"
          />
          <button
            v-if="searchQuery"
            @click="searchQuery = ''"
            type="button"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
          >
            <i class="pi pi-times text-xs"></i>
          </button>
        </div>

        <!-- Balances Filter Dropdown -->
        <div class="shrink-0">
          <select
            v-model="balanceFilter"
            class="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 text-xs font-medium focus:outline-none focus:border-emerald-500/60 transition-all cursor-pointer"
          >
            <option value="all">All Balances</option>
            <option value="has_balance">Has Balance (> 0)</option>
            <option value="zero_balance">Zero Balance (0 MMK)</option>
          </select>
        </div>

        <!-- Sorting Dropdown -->
        <div class="shrink-0">
          <select
            v-model="sortBy"
            class="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 text-xs font-medium focus:outline-none focus:border-emerald-500/60 transition-all cursor-pointer"
          >
            <option value="balance_desc">Balance: High → Low</option>
            <option value="balance_asc">Balance: Low → High</option>
            <option value="spent_desc">Total Spent: High → Low</option>
            <option value="orders_desc">Orders: High → Low</option>
            <option value="newest">Newest Customers</option>
          </select>
        </div>
      </div>

      <!-- Quick Count & Total Active Balance Preview -->
      <div class="flex items-center justify-between text-xs text-slate-400 px-1 pt-1">
        <div class="flex items-center gap-2">
          <i class="pi pi-users text-slate-500 text-xs"></i>
          <span>{{ customers.length }} customers displayed</span>
        </div>
        <div>
          <span class="text-emerald-400 font-medium">
            {{ customers.reduce((sum, c) => sum + c.walletBalanceMmk, 0).toLocaleString() }} MMK
          </span>
          <span class="text-slate-500 ml-1">listed balance</span>
        </div>
      </div>
    </div>

    <!-- Customers Main Table Card -->
    <div class="rounded-2xl bg-[#0b1220] border border-slate-800/80 overflow-hidden shadow-xl">
      <!-- Loading Skeleton -->
      <div v-if="isLoading" class="p-6 space-y-4">
        <div v-for="i in 6" :key="i" class="flex items-center justify-between gap-4 animate-pulse">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-slate-800"></div>
            <div class="space-y-1.5">
              <div class="w-32 h-3.5 bg-slate-800 rounded"></div>
              <div class="w-20 h-2.5 bg-slate-800/60 rounded"></div>
            </div>
          </div>
          <div class="w-24 h-4 bg-slate-800 rounded"></div>
          <div class="w-24 h-4 bg-slate-800 rounded"></div>
          <div class="w-16 h-4 bg-slate-800 rounded"></div>
          <div class="w-20 h-8 bg-slate-800 rounded-lg"></div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else-if="customers.length === 0" class="py-16 text-center text-slate-400">
        <div class="w-16 h-16 mx-auto mb-3 rounded-full bg-slate-800/60 flex items-center justify-center text-slate-500 text-2xl">
          <i class="pi pi-users"></i>
        </div>
        <p class="text-sm font-semibold text-slate-300">No customers found</p>
        <p class="text-xs text-slate-500 mt-1">Try adjusting your search query or balance filter.</p>
      </div>

      <!-- Table View -->
      <div v-else class="overflow-x-auto">
        <table class="w-full text-left text-xs border-collapse">
          <thead>
            <tr class="border-b border-slate-800/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-900/60">
              <th class="py-3.5 px-4">CUSTOMER</th>
              <th class="py-3.5 px-4">USER ID</th>
              <th class="py-3.5 px-4">WALLET BALANCE</th>
              <th class="py-3.5 px-4">TOTAL SPENT</th>
              <th class="py-3.5 px-4">ORDERS</th>
              <th class="py-3.5 px-4">LAST ACTIVE</th>
              <th class="py-3.5 px-4 text-right">ACTIONS</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/50">
            <tr
              v-for="customer in customers"
              :key="customer.id"
              class="hover:bg-slate-800/30 transition-colors group cursor-pointer"
              @click="openCustomerDetail(customer)"
            >
              <!-- Customer Info (Avatar, Name, Handle) -->
              <td class="py-3.5 px-4">
                <div class="flex items-center gap-3">
                  <div
                    class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border shrink-0 transition-transform group-hover:scale-105"
                    :class="getAvatarColorClass(customer.telegramId || customer.id)"
                  >
                    {{ getInitial(customer.displayName) }}
                  </div>
                  <div class="min-w-0">
                    <div class="font-semibold text-slate-100 truncate group-hover:text-emerald-400 transition-colors">
                      {{ customer.displayName }}
                    </div>
                    <div class="text-[11px] text-slate-400 truncate flex items-center gap-1">
                      <span v-if="customer.username">@{{ customer.username }}</span>
                      <span v-else class="text-slate-500">ID #{{ customer.id }}</span>
                    </div>
                  </div>
                </div>
              </td>

              <!-- Telegram User ID (Copyable Badge) -->
              <td class="py-3.5 px-4" @click.stop>
                <div
                  v-if="customer.telegramId"
                  @click="copyToClipboard(customer.telegramId, 'user-' + customer.id)"
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 font-mono text-[11px] cursor-pointer transition-all hover:bg-slate-800"
                  title="Click to copy Telegram ID"
                >
                  <span>{{ customer.telegramId }}</span>
                  <i
                    class="text-[10px]"
                    :class="copiedId === 'user-' + customer.id ? 'pi pi-check text-emerald-400' : 'pi pi-copy text-slate-500'"
                  ></i>
                </div>
                <span v-else class="text-slate-500">—</span>
              </td>

              <!-- Wallet Balance (Green MMK) -->
              <td class="py-3.5 px-4 font-mono">
                <span
                  class="font-bold text-sm"
                  :class="customer.walletBalanceMmk > 0 ? 'text-emerald-400' : 'text-slate-500'"
                >
                  {{ customer.walletBalanceMmk.toLocaleString() }}
                </span>
                <span class="text-[10px] text-slate-500 ml-1">MMK</span>
              </td>

              <!-- Total Spent (Rose/Slate MMK) -->
              <td class="py-3.5 px-4 font-mono">
                <span
                  class="font-semibold text-sm"
                  :class="customer.totalSpentMmk > 0 ? 'text-rose-400' : 'text-slate-500'"
                >
                  {{ customer.totalSpentMmk.toLocaleString() }}
                </span>
                <span class="text-[10px] text-slate-500 ml-1">MMK</span>
              </td>

              <!-- Orders Count -->
              <td class="py-3.5 px-4">
                <div
                  v-if="customer.ordersCount > 0"
                  class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] font-semibold"
                >
                  <i class="pi pi-shopping-bag text-[10px]"></i>
                  <span>{{ customer.ordersCount }}</span>
                </div>
                <span v-else class="text-slate-500 font-mono">0</span>
              </td>

              <!-- Last Active -->
              <td class="py-3.5 px-4 text-slate-400 text-[11px]">
                {{ formatDate(customer.lastActive) }}
              </td>

              <!-- Actions (Adjust & Details Chevron) -->
              <td class="py-3.5 px-4 text-right" @click.stop>
                <div class="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    @click="openAdjustModal(customer)"
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-95 text-emerald-400 border border-emerald-500/30 text-xs font-semibold shadow-sm transition-all"
                    title="Adjust Wallet Balance"
                  >
                    <i class="pi pi-money-bill text-xs"></i>
                    <span>Adjust</span>
                  </button>

                  <button
                    type="button"
                    @click="openCustomerDetail(customer)"
                    class="w-8 h-8 rounded-xl bg-slate-800/80 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white border border-slate-700/80 flex items-center justify-center transition-all"
                    title="View Customer Profile"
                  >
                    <i class="pi pi-chevron-right text-xs"></i>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- CUSTOMER DETAIL DRAWER / VIEW (Matching Reference Screenshot 2) -->
    <div
      v-if="isDetailOpen && selectedCustomer"
      class="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6"
    >
      <div class="relative w-full max-w-6xl max-h-[92vh] flex flex-col bg-[#0b1220] border border-slate-800 rounded-3xl shadow-2xl overflow-hidden">
        <!-- Top Navigation Bar in Modal -->
        <div class="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/60 shrink-0">
          <button
            type="button"
            @click="closeDetail"
            class="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
          >
            <i class="pi pi-arrow-left text-xs"></i>
            <span>Back to Customers</span>
          </button>

          <button
            type="button"
            @click="closeDetail"
            class="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-xs transition-colors"
          >
            <i class="pi pi-times"></i>
          </button>
        </div>

        <!-- Modal Body: 2-Column Layout -->
        <div class="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <!-- LEFT COLUMN: Profile & Wallet Summary Card (matching Screenshot 2) -->
          <div class="lg:col-span-4 space-y-4">
            <div class="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col items-center text-center relative overflow-hidden">
              <!-- Glow background -->
              <div class="absolute -top-12 -left-12 w-32 h-32 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none"></div>

              <!-- Avatar -->
              <div
                class="w-20 h-20 rounded-full flex items-center justify-center font-bold text-2xl border-2 mb-3 shadow-lg"
                :class="getAvatarColorClass(selectedCustomer.telegramId || selectedCustomer.id)"
              >
                {{ getInitial(selectedCustomer.displayName) }}
              </div>

              <!-- Customer Name & Handle -->
              <h2 class="text-lg font-bold text-white">{{ selectedCustomer.displayName }}</h2>
              <p v-if="selectedCustomer.username" class="text-xs text-slate-400 mt-0.5">
                @{{ selectedCustomer.username }}
              </p>

              <!-- Telegram ID Chip -->
              <div
                v-if="selectedCustomer.telegramId"
                @click="copyToClipboard(selectedCustomer.telegramId, 'detail-id')"
                class="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-mono text-xs cursor-pointer hover:bg-slate-700/80 transition-all"
                title="Click to copy"
              >
                <span>ID {{ selectedCustomer.telegramId }}</span>
                <i
                  class="text-[10px]"
                  :class="copiedId === 'detail-id' ? 'pi pi-check text-emerald-400' : 'pi pi-copy text-slate-400'"
                ></i>
              </div>

              <!-- Customer Badge -->
              <div class="mt-2.5 inline-flex items-center px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-semibold text-emerald-400">
                Customer
              </div>

              <!-- Total Balance Display (Large) -->
              <div class="w-full mt-6 pt-5 border-t border-slate-800/80">
                <div class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  TOTAL BALANCE
                </div>
                <div class="text-3xl font-extrabold text-emerald-400 font-mono mt-1">
                  {{ selectedCustomer.walletBalanceMmk.toLocaleString() }}
                  <span class="text-xs font-normal text-slate-400">MMK</span>
                </div>

                <!-- Sub-balances / Deposited vs Spent -->
                <div class="grid grid-cols-2 gap-2 mt-4">
                  <div class="p-2.5 rounded-xl bg-slate-800/60 border border-slate-800">
                    <div class="text-[10px] text-slate-400">Deposited</div>
                    <div class="text-xs font-bold text-slate-200 font-mono mt-0.5">
                      {{ selectedCustomer.totalDepositedMmk.toLocaleString() }} Ks
                    </div>
                  </div>
                  <div class="p-2.5 rounded-xl bg-slate-800/60 border border-slate-800">
                    <div class="text-[10px] text-slate-400">Total Spent</div>
                    <div class="text-xs font-bold text-rose-400 font-mono mt-0.5">
                      {{ selectedCustomer.totalSpentMmk.toLocaleString() }} Ks
                    </div>
                  </div>
                </div>
              </div>

              <!-- Quick Info List -->
              <div class="w-full mt-6 pt-4 border-t border-slate-800/80 space-y-2 text-xs text-left">
                <div class="flex items-center justify-between text-slate-400">
                  <span class="flex items-center gap-1.5"><i class="pi pi-shopping-bag text-slate-500"></i> Orders:</span>
                  <span class="text-slate-200 font-semibold">{{ selectedCustomer.ordersCount }}</span>
                </div>
                <div class="flex items-center justify-between text-slate-400">
                  <span class="flex items-center gap-1.5"><i class="pi pi-calendar text-slate-500"></i> First Seen:</span>
                  <span class="text-slate-200">{{ formatDate(selectedCustomer.createdAt) }}</span>
                </div>
                <div class="flex items-center justify-between text-slate-400">
                  <span class="flex items-center gap-1.5"><i class="pi pi-clock text-slate-500"></i> Last Active:</span>
                  <span class="text-slate-200">{{ formatDateTime(selectedCustomer.lastActive) }}</span>
                </div>
              </div>

              <!-- Adjust Balance Button -->
              <div class="w-full mt-6">
                <button
                  type="button"
                  @click="openAdjustModal(selectedCustomer)"
                  class="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <i class="pi pi-money-bill"></i>
                  <span>Adjust Balance</span>
                </button>
              </div>
            </div>
          </div>

          <!-- RIGHT COLUMN: Tabs (Purchases, Payment Slips, Ledger) -->
          <div class="lg:col-span-8 flex flex-col min-w-0">
            <!-- Tabs Bar -->
            <div class="flex items-center gap-2 border-b border-slate-800 pb-3 mb-4 overflow-x-auto scrollbar-none">
              <button
                type="button"
                @click="detailActiveTab = 'orders'"
                :class="detailActiveTab === 'orders' ? 'text-emerald-400 border-b-2 border-emerald-400 pb-1 font-bold' : 'text-slate-400 hover:text-slate-200 pb-1 font-semibold'"
                class="px-3 text-xs transition-colors shrink-0"
              >
                Purchases ({{ customerDetailData.orders.length }})
              </button>
              <button
                type="button"
                @click="detailActiveTab = 'topups'"
                :class="detailActiveTab === 'topups' ? 'text-emerald-400 border-b-2 border-emerald-400 pb-1 font-bold' : 'text-slate-400 hover:text-slate-200 pb-1 font-semibold'"
                class="px-3 text-xs transition-colors shrink-0"
              >
                Payment Slips ({{ customerDetailData.topUps.length }})
              </button>
              <button
                type="button"
                @click="detailActiveTab = 'ledger'"
                :class="detailActiveTab === 'ledger' ? 'text-emerald-400 border-b-2 border-emerald-400 pb-1 font-bold' : 'text-slate-400 hover:text-slate-200 pb-1 font-semibold'"
                class="px-3 text-xs transition-colors shrink-0"
              >
                Wallet Ledger ({{ customerDetailData.ledger.length }})
              </button>
            </div>

            <!-- Tab Content Loading Skeleton -->
            <div v-if="isLoadingDetail" class="py-12 space-y-3">
              <div v-for="i in 3" :key="i" class="h-12 bg-slate-900 rounded-xl animate-pulse"></div>
            </div>

            <!-- TAB 1: PURCHASES / ORDERS -->
            <div v-else-if="detailActiveTab === 'orders'" class="space-y-3">
              <div v-if="customerDetailData.orders.length === 0" class="py-12 text-center text-slate-500 text-xs">
                No orders placed by this customer yet.
              </div>

              <div
                v-for="ord in customerDetailData.orders"
                :key="ord.id"
                class="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2.5"
              >
                <div class="flex items-center justify-between flex-wrap gap-2">
                  <div class="flex items-center gap-2">
                    <span class="font-mono font-bold text-xs text-slate-200">{{ ord.publicOrderNo }}</span>
                    <span
                      class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                      :class="{
                        'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30': ord.status === 'DELIVERED',
                        'bg-amber-500/10 text-amber-400 border border-amber-500/30': ord.status === 'PROCESSING' || ord.status === 'PENDING',
                        'bg-rose-500/10 text-rose-400 border border-rose-500/30': ord.status === 'REFUNDED' || ord.status === 'FAILED',
                        'bg-slate-800 text-slate-400': !['DELIVERED', 'PROCESSING', 'PENDING', 'REFUNDED', 'FAILED'].includes(ord.status)
                      }"
                    >
                      {{ ord.status }}
                    </span>
                  </div>
                  <div class="text-xs font-mono font-bold text-emerald-400">
                    {{ ord.totalAmountMmk.toLocaleString() }} MMK
                  </div>
                </div>

                <!-- Order Items -->
                <div class="text-xs text-slate-300 space-y-1">
                  <div v-for="item in ord.items" :key="item.id" class="flex items-center justify-between text-slate-400 text-[11px]">
                    <span>• {{ item.productName }} (x{{ item.quantity }})</span>
                    <span>{{ item.subtotalMmk.toLocaleString() }} MMK</span>
                  </div>
                </div>

                <!-- Digital Delivered Key / Credentials box if delivered -->
                <div
                  v-if="ord.deliveries && ord.deliveries.length > 0 && ord.deliveries[0].credentials"
                  class="mt-2 p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px]"
                >
                  <div class="text-slate-500 font-semibold mb-1 flex items-center justify-between">
                    <span>Delivered Credentials:</span>
                    <button
                      type="button"
                      @click="copyToClipboard(ord.deliveries[0].credentials, 'ord-cred-' + ord.id)"
                      class="text-emerald-400 hover:text-emerald-300"
                    >
                      <i class="pi pi-copy mr-1 text-[10px]"></i>Copy
                    </button>
                  </div>
                  <pre class="font-mono text-emerald-300 whitespace-pre-wrap break-all text-[11px]">{{ ord.deliveries[0].credentials }}</pre>
                </div>

                <div class="text-[10px] text-slate-500 flex items-center justify-between pt-1">
                  <span>{{ formatDateTime(ord.createdAt) }}</span>
                  <NuxtLink :to="`/orders`" class="text-indigo-400 hover:underline">
                    View in Orders →
                  </NuxtLink>
                </div>
              </div>
            </div>

            <!-- TAB 2: PAYMENT SLIPS / TOP-UPS -->
            <div v-else-if="detailActiveTab === 'topups'" class="space-y-3">
              <div v-if="customerDetailData.topUps.length === 0" class="py-12 text-center text-slate-500 text-xs">
                No deposit slips submitted by this customer yet.
              </div>

              <div
                v-for="slip in customerDetailData.topUps"
                :key="slip.id"
                class="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between gap-4"
              >
                <!-- Info -->
                <div class="space-y-1 min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="font-mono font-bold text-xs text-slate-200">{{ slip.reference }}</span>
                    <span
                      class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                      :class="{
                        'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30': slip.status === 'APPROVED',
                        'bg-amber-500/10 text-amber-400 border border-amber-500/30': slip.status === 'SUBMITTED',
                        'bg-rose-500/10 text-rose-400 border border-rose-500/30': slip.status === 'REJECTED'
                      }"
                    >
                      {{ slip.status }}
                    </span>
                  </div>

                  <div class="text-xs text-slate-300 font-semibold">
                    {{ slip.paymentMethod }} · <span class="text-emerald-400">+{{ slip.amountMmk.toLocaleString() }} MMK</span>
                  </div>

                  <div v-if="slip.transactionRef" class="text-[10px] text-slate-500 font-mono">
                    Txn Ref: {{ slip.transactionRef }}
                  </div>

                  <div v-if="slip.rejectReason" class="text-[10px] text-rose-400 italic">
                    Reason: {{ slip.rejectReason }}
                  </div>

                  <div class="text-[10px] text-slate-500">
                    {{ formatDateTime(slip.createdAt) }}
                  </div>
                </div>

                <!-- Slip Thumbnail -->
                <div v-if="slip.slipUrl" class="shrink-0">
                  <button
                    type="button"
                    @click="selectedSlipUrl = slip.slipUrl; isSlipPreviewOpen = true"
                    class="w-14 h-14 rounded-lg bg-slate-950 border border-slate-700/80 overflow-hidden relative group"
                    title="Click to view full receipt"
                  >
                    <img :src="slip.slipUrl" alt="Slip" class="w-full h-full object-cover group-hover:opacity-75 transition-opacity" />
                    <div class="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs">
                      <i class="pi pi-eye"></i>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            <!-- TAB 3: WALLET LEDGER / AUDIT LOG -->
            <div v-else-if="detailActiveTab === 'ledger'" class="space-y-3">
              <div v-if="customerDetailData.ledger.length === 0" class="py-12 text-center text-slate-500 text-xs">
                No ledger records found for this wallet.
              </div>

              <div class="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60">
                <table class="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr class="border-b border-slate-800 text-[10px] font-semibold text-slate-400 uppercase bg-slate-950/40">
                      <th class="py-2.5 px-3">TYPE</th>
                      <th class="py-2.5 px-3">AMOUNT</th>
                      <th class="py-2.5 px-3">REFERENCE</th>
                      <th class="py-2.5 px-3">NOTES</th>
                      <th class="py-2.5 px-3 text-right">DATE</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-800/60">
                    <tr v-for="entry in customerDetailData.ledger" :key="entry.id" class="hover:bg-slate-800/30">
                      <!-- Type -->
                      <td class="py-2.5 px-3">
                        <span
                          class="px-2 py-0.5 rounded-full text-[10px] font-bold"
                          :class="{
                            'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30': entry.type.includes('CREDIT'),
                            'bg-rose-500/10 text-rose-400 border border-rose-500/30': entry.type.includes('DEBIT'),
                            'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30': entry.type === 'ADMIN_ADJUSTMENT'
                          }"
                        >
                          {{ entry.type }}
                        </span>
                      </td>

                      <!-- Amount -->
                      <td class="py-2.5 px-3 font-mono font-bold">
                        <span :class="entry.amountMmk >= 0 ? 'text-emerald-400' : 'text-rose-400'">
                          {{ entry.amountMmk >= 0 ? '+' : '' }}{{ entry.amountMmk.toLocaleString() }}
                        </span>
                        <span class="text-[10px] text-slate-500 ml-1">Ks</span>
                      </td>

                      <!-- Reference -->
                      <td class="py-2.5 px-3 text-[11px] font-mono text-slate-400">
                        {{ entry.referenceId || '—' }}
                      </td>

                      <!-- Notes -->
                      <td class="py-2.5 px-3 text-[11px] text-slate-300 max-w-xs truncate">
                        {{ entry.notes || '—' }}
                      </td>

                      <!-- Date -->
                      <td class="py-2.5 px-3 text-right text-[10px] text-slate-500">
                        {{ formatDateTime(entry.createdAt) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ADJUST BALANCE MODAL -->
    <div
      v-if="isAdjustModalOpen && adjustTargetCustomer"
      class="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div class="relative w-full max-w-md bg-[#0b1220] border border-slate-800 rounded-3xl shadow-2xl p-6 space-y-5">
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 class="text-base font-bold text-white flex items-center gap-2">
              <i class="pi pi-sliders-h text-emerald-400"></i>
              <span>Adjust Customer Balance</span>
            </h3>
            <p class="text-xs text-slate-400 mt-0.5">
              {{ adjustTargetCustomer.displayName }} ({{ adjustTargetCustomer.telegramId ? 'ID ' + adjustTargetCustomer.telegramId : 'User #' + adjustTargetCustomer.id }})
            </p>
          </div>
          <button
            type="button"
            @click="isAdjustModalOpen = false"
            class="text-slate-400 hover:text-white text-xs w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center"
          >
            <i class="pi pi-times"></i>
          </button>
        </div>

        <!-- Action Selector: CREDIT or DEBIT -->
        <div class="grid grid-cols-2 gap-2 p-1 bg-slate-900 rounded-2xl border border-slate-800">
          <button
            type="button"
            @click="adjustAction = 'CREDIT'"
            class="py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
            :class="adjustAction === 'CREDIT' ? 'bg-emerald-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200'"
          >
            <i class="pi pi-plus text-xs"></i>
            <span>Credit (+ Add)</span>
          </button>
          <button
            type="button"
            @click="adjustAction = 'DEBIT'"
            class="py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
            :class="adjustAction === 'DEBIT' ? 'bg-rose-500 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'"
          >
            <i class="pi pi-minus text-xs"></i>
            <span>Debit (- Deduct)</span>
          </button>
        </div>

        <!-- Current & Projected Balance Cards -->
        <div class="grid grid-cols-2 gap-3">
          <div class="p-3 rounded-xl bg-slate-900 border border-slate-800">
            <div class="text-[10px] text-slate-500 font-semibold uppercase">Current Balance</div>
            <div class="text-sm font-bold text-slate-200 font-mono mt-0.5">
              {{ adjustTargetCustomer.walletBalanceMmk.toLocaleString() }} Ks
            </div>
          </div>
          <div class="p-3 rounded-xl bg-slate-900 border" :class="adjustAction === 'CREDIT' ? 'border-emerald-500/40' : 'border-rose-500/40'">
            <div class="text-[10px] font-semibold uppercase" :class="adjustAction === 'CREDIT' ? 'text-emerald-400' : 'text-rose-400'">
              New Balance
            </div>
            <div class="text-sm font-extrabold font-mono mt-0.5" :class="adjustAction === 'CREDIT' ? 'text-emerald-400' : 'text-rose-400'">
              {{ projectedBalance.toLocaleString() }} Ks
            </div>
          </div>
        </div>

        <!-- Amount Input -->
        <div class="space-y-1.5">
          <label class="block text-xs font-semibold text-slate-300">Adjustment Amount (MMK)</label>
          <div class="relative">
            <input
              v-model.number="adjustAmount"
              type="number"
              min="1"
              placeholder="e.g. 10000"
              class="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 font-mono text-sm focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/60"
            />
            <span class="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500">MMK</span>
          </div>

          <!-- Quick Preset Buttons -->
          <div class="flex flex-wrap gap-1.5 pt-1">
            <button
              v-for="amt in [1000, 5000, 10000, 20000, 50000]"
              :key="amt"
              type="button"
              @click="setQuickAmount(amt)"
              class="px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-[10px] font-mono border border-slate-700/60 transition-colors"
            >
              +{{ (amt / 1000) }}k
            </button>
          </div>
        </div>

        <!-- Notes / Reason Input -->
        <div class="space-y-1.5">
          <label class="block text-xs font-semibold text-slate-300">Reason / Internal Note <span class="text-rose-400">*</span></label>
          <textarea
            v-model="adjustNotes"
            rows="2"
            placeholder="e.g. Manual deposit compensation, Event prize, Customer support resolution"
            class="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-xs placeholder-slate-500 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/60"
          ></textarea>
        </div>

        <!-- Telegram Notification Toggle -->
        <div class="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <i class="pi pi-send text-emerald-400 text-sm"></i>
            <div>
              <div class="text-xs font-semibold text-slate-200">Notify Customer on Telegram</div>
              <div class="text-[10px] text-slate-400">Sends instant balance update alert via bot</div>
            </div>
          </div>
          <input
            v-model="adjustNotifyTelegram"
            type="checkbox"
            class="w-4 h-4 rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900 cursor-pointer"
          />
        </div>

        <!-- Modal Actions -->
        <div class="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            @click="isAdjustModalOpen = false"
            :disabled="isSubmittingAdjustment"
            class="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            @click="submitAdjustment"
            :disabled="isSubmittingAdjustment || !adjustAmount || Number(adjustAmount) <= 0"
            class="px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2"
            :class="adjustAction === 'CREDIT' ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20' : 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/20'"
          >
            <i v-if="isSubmittingAdjustment" class="pi pi-spinner animate-spin text-xs"></i>
            <span>{{ isSubmittingAdjustment ? 'Processing...' : (adjustAction === 'CREDIT' ? 'Confirm Credit' : 'Confirm Debit') }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- SLIP PREVIEW MODAL (Click on slip thumbnail) -->
    <div
      v-if="isSlipPreviewOpen && selectedSlipUrl"
      class="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
      @click="isSlipPreviewOpen = false"
    >
      <div class="relative max-w-lg w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden p-2" @click.stop>
        <div class="flex justify-end p-2">
          <button
            type="button"
            @click="isSlipPreviewOpen = false"
            class="w-7 h-7 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
          >
            <i class="pi pi-times text-xs"></i>
          </button>
        </div>
        <img :src="selectedSlipUrl" alt="Payment Receipt" class="w-full max-h-[75vh] object-contain rounded-xl" />
      </div>
    </div>
  </div>
</template>

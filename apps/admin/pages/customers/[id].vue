<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from '~/composables/useToast'
import { useAuth } from '~/composables/useAuth'
import { formatMyanmarDateTime, formatMyanmarDate } from '~/utils/date'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { getAuthHeaders } = useAuth()

const customerIdParam = computed(() => String(route.params.id || ''))

interface CustomerDetail {
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

const isLoading = ref(true)
const customer = ref<CustomerDetail | null>(null)
const orders = ref<any[]>([])
const topUps = ref<any[]>([])
const ledger = ref<any[]>([])
const activeTab = ref<'orders' | 'slips' | 'ledger'>('orders')
const copiedId = ref<string | null>(null)

// Action Modals State
const isAdjustModalOpen = ref(false)
const adjustAction = ref<'CREDIT' | 'DEBIT'>('CREDIT')
const adjustAmount = ref<number | ''>('')
const adjustNotes = ref('')
const adjustNotifyTelegram = ref(true)
const isSubmittingAdjustment = ref(false)

// Deactivate / Restore State
const isDeactivateModalOpen = ref(false)
const deactivateReason = ref('')
const isDeactivating = ref(false)
const isRestoring = ref(false)

// Credentials Modal
const isCredentialsModalOpen = ref(false)
const selectedOrderCredentials = ref<{
  orderNo: string
  productName: string
  credentialsText: string
} | null>(null)

// Slip Lightbox Modal
const isSlipModalOpen = ref(false)
const selectedSlipUrl = ref<string | null>(null)
const selectedSlipRef = ref<string | null>(null)

// In-flight action guards
const isResendingId = ref<string | null>(null)
const isRefundingId = ref<string | null>(null)

async function fetchCustomerDetails() {
  if (!customerIdParam.value) return
  isLoading.value = true
  try {
    const res: any = await $fetch(`/api/admin/customers/${customerIdParam.value}`, {
      headers: getAuthHeaders(),
    })

    if (res?.ok) {
      customer.value = {
        id: res.customer.id,
        telegramId: res.customer.telegramId,
        username: res.customer.username,
        firstName: res.customer.firstName,
        lastName: res.customer.lastName,
        displayName: res.customer.displayName,
        role: res.customer.role || 'CUSTOMER',
        status: res.customer.status || 'ACTIVE',
        walletBalanceMmk: res.wallet?.balanceMmk ?? res.customer.walletBalanceMmk ?? 0,
        totalDepositedMmk: res.wallet?.totalDepositedMmk ?? res.customer.totalDepositedMmk ?? 0,
        totalSpentMmk: res.wallet?.totalSpentMmk ?? res.customer.totalSpentMmk ?? 0,
        ordersCount: res.customer.ordersCount ?? (res.orders ? res.orders.length : 0),
        lastActive: res.customer.lastActive,
        createdAt: res.customer.createdAt,
      }
      orders.value = res.orders || []
      topUps.value = res.topUps || []
      ledger.value = res.ledger || []
    } else {
      toast.error(res?.error || 'Customer not found', 'Not Found')
    }
  } catch (err: any) {
    console.error('Failed to load customer details:', err)
    toast.error('Failed to load customer details: ' + (err.message || 'Network error'))
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  fetchCustomerDetails()
})

function goBack() {
  router.push('/customers')
}

function copyToClipboard(text: string, id: string) {
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
  return new Intl.NumberFormat('en-US').format(amount) + ' MMK'
}

function formatCurrencyKs(amount: number): string {
  return new Intl.NumberFormat('en-US').format(amount) + ' Ks'
}

// Adjust Balance
function openAdjustModal() {
  adjustAction.value = 'CREDIT'
  adjustAmount.value = ''
  adjustNotes.value = ''
  adjustNotifyTelegram.value = true
  isAdjustModalOpen.value = true
}

function setQuickAdjust(amt: number) {
  adjustAmount.value = amt
}

async function submitBalanceAdjustment() {
  if (!customer.value) return
  if (!adjustAmount.value || Number(adjustAmount.value) <= 0) {
    toast.error('Please enter a valid amount greater than 0', 'Invalid Amount')
    return
  }
  if (!adjustNotes.value.trim()) {
    toast.error('Please enter a reason or note for this adjustment', 'Reason Required')
    return
  }

  if (adjustAction.value === 'DEBIT' && customer.value.walletBalanceMmk < Number(adjustAmount.value)) {
    toast.error(
      `Cannot debit ${Number(adjustAmount.value).toLocaleString()} MMK. Customer only has ${customer.value.walletBalanceMmk.toLocaleString()} MMK.`,
      'Insufficient Balance'
    )
    return
  }

  isSubmittingAdjustment.value = true
  try {
    const res: any = await $fetch(`/api/admin/customers/${customer.value.id}/adjust-balance`, {
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
        'Adjustment Applied'
      )
      isAdjustModalOpen.value = false
      await fetchCustomerDetails()
    } else {
      toast.error(res?.error || 'Failed to adjust balance', 'Adjustment Failed')
    }
  } catch (err: any) {
    toast.error(err.data?.error || err.message || 'Error occurred while adjusting balance')
  } finally {
    isSubmittingAdjustment.value = false
  }
}

// Deactivate Customer
async function confirmDeactivate() {
  if (!customer.value || isDeactivating.value) return
  isDeactivating.value = true
  try {
    const res: any = await $fetch(`/api/admin/customers/${customer.value.id}/deactivate`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: { reason: deactivateReason.value.trim() || undefined },
    })

    if (res?.ok) {
      isDeactivateModalOpen.value = false
      toast.success(`${customer.value.displayName} has been deactivated.`, 'Customer Deactivated')
      await fetchCustomerDetails()
    } else {
      toast.error(res?.error || 'Failed to deactivate customer', 'Deactivation Failed')
    }
  } catch (err: any) {
    toast.error(err.data?.error || err.message || 'Error occurred while deactivating')
  } finally {
    isDeactivating.value = false
  }
}

// Restore Customer
async function handleRestore() {
  if (!customer.value || isRestoring.value) return
  isRestoring.value = true
  try {
    const res: any = await $fetch(`/api/admin/customers/${customer.value.id}/restore`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })

    if (res?.ok) {
      toast.success(`${customer.value.displayName} has been restored to active status.`, 'Customer Restored')
      await fetchCustomerDetails()
    } else {
      toast.error(res?.error || 'Failed to restore customer', 'Restore Failed')
    }
  } catch (err: any) {
    toast.error(err.data?.error || err.message || 'Error restoring customer')
  } finally {
    isRestoring.value = false
  }
}

// Clean credentials for display & copy
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

// Order Actions
function openCredentials(order: any) {
  const delivery = order.deliveries?.[0]
  const rawCreds = delivery?.credentials || order.deliveryCredentials || 'No credentials found'
  const creds = cleanCredentialsText(rawCreds)
  const productName = order.items?.[0]?.productName || 'Digital Product'
  selectedOrderCredentials.value = {
    orderNo: order.publicOrderNo || String(order.id),
    productName,
    credentialsText: creds,
  }
  isCredentialsModalOpen.value = true
}

async function resendCredentials(order: any) {
  const orderId = order.publicOrderNo || order.id
  if (isResendingId.value) return
  isResendingId.value = orderId

  try {
    const res: any = await $fetch(`/api/admin/orders/${orderId}/resend`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })

    if (res && res.ok) {
      toast.success(
        `Digital credentials for ${orderId} successfully re-sent to ${customer.value?.displayName || 'customer'} on Telegram!`,
        'Credentials Re-sent'
      )
    } else {
      toast.error('Re-send failed: ' + (res?.error || 'Server error'))
    }
  } catch (err: any) {
    toast.error('Re-send failed: ' + (err.message || 'Network error'))
  } finally {
    isResendingId.value = null
  }
}

async function refundOrder(order: any) {
  const orderId = order.publicOrderNo || order.id
  if (isRefundingId.value) return
  isRefundingId.value = orderId

  try {
    const res: any = await $fetch(`/api/admin/orders/${orderId}/refund`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: {
        reason: 'Customer Support Refund by Admin',
      },
    })

    if (res && res.ok) {
      order.status = 'REFUNDED'
      toast.warn(
        `Order ${orderId} refunded! +${(order.totalAmountMmk || 0).toLocaleString()} Ks credited back to ${customer.value?.displayName}'s Wallet.`,
        'Refund Complete'
      )
      await fetchCustomerDetails()
    } else {
      toast.error('Refund failed: ' + (res?.error || 'Server error'))
    }
  } catch (err: any) {
    toast.error('Refund failed: ' + (err.message || 'Network error'))
  } finally {
    isRefundingId.value = null
  }
}

// Slip Preview Lightbox
function openSlipPreview(topUp: any) {
  selectedSlipUrl.value = topUp.slipUrl || `/api/admin/deposits/${topUp.id}/slip-image`
  selectedSlipRef.value = topUp.reference || `TOP-${topUp.id}`
  isSlipModalOpen.value = true
}
</script>

<template>
  <div class="space-y-5">
    <!-- Top Bar: Back to Customers Button (Matching Screenshot 2) -->
    <div class="flex items-center justify-between">
      <button
        type="button"
        @click="goBack"
        class="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white px-3 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <i class="pi pi-arrow-left text-xs"></i>
        <span>Back to Customers</span>
      </button>

      <button
        type="button"
        @click="fetchCustomerDetails"
        :disabled="isLoading"
        class="p-2 rounded-xl text-xs border border-slate-200 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all shrink-0"
        title="Refresh details"
      >
        <i class="pi pi-sync text-xs" :class="{ 'animate-spin': isLoading }"></i>
      </button>
    </div>

    <!-- Skeleton Loading -->
    <div v-if="isLoading" class="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-pulse">
      <div class="lg:col-span-4 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <div class="w-20 h-20 rounded-full bg-slate-200 dark:bg-slate-800 mx-auto"></div>
        <div class="h-5 w-32 rounded bg-slate-200 dark:bg-slate-800 mx-auto"></div>
        <div class="h-3 w-20 rounded bg-slate-200 dark:bg-slate-800 mx-auto"></div>
        <div class="h-10 w-full rounded-xl bg-slate-200 dark:bg-slate-800"></div>
      </div>
      <div class="lg:col-span-8 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <div class="h-8 w-48 rounded bg-slate-200 dark:bg-slate-800"></div>
        <div class="h-40 w-full rounded bg-slate-200 dark:bg-slate-800"></div>
      </div>
    </div>

    <!-- Error / Not Found State -->
    <div v-else-if="!customer" class="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
      <div class="w-16 h-16 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center text-2xl mx-auto mb-4">
        <i class="pi pi-user-times"></i>
      </div>
      <h3 class="text-base font-bold text-slate-900 dark:text-white">Customer Not Found</h3>
      <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
        The customer ID or Telegram ID "{{ customerIdParam }}" does not exist in the database.
      </p>
      <button
        type="button"
        @click="goBack"
        class="mt-4 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all"
      >
        Return to Customers List
      </button>
    </div>

    <!-- Main Customer Detail Layout (Exact 2-Column Split matching Screenshot 2) -->
    <div v-else class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <!-- LEFT COLUMN: Profile & Summary Card -->
      <div class="lg:col-span-4 space-y-4">
        <div class="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center text-center relative overflow-hidden">
          <!-- Subtle glow in dark mode -->
          <div class="absolute -top-12 -left-12 w-32 h-32 rounded-full bg-emerald-500/5 dark:bg-emerald-500/10 blur-2xl pointer-events-none"></div>

          <!-- Avatar (Emerald Green Circle with Initial) -->
          <div class="w-20 h-20 rounded-full flex items-center justify-center font-bold text-2xl bg-emerald-500 text-white dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-2 dark:border-emerald-500/40 mb-3 shadow-md">
            {{ getInitial(customer.displayName) }}
          </div>

          <!-- Customer Name (Truncated with tooltip) -->
          <h2 class="text-xl font-bold text-slate-900 dark:text-white truncate max-w-[240px] text-center" :title="customer.displayName">
            {{ customer.displayName }}
          </h2>

          <!-- Username / Telegram Handle -->
          <div class="mt-1 flex items-center justify-center gap-1.5 flex-wrap truncate max-w-[240px]">
            <a
              v-if="customer.username"
              :href="'https://t.me/' + customer.username"
              target="_blank"
              rel="noopener noreferrer"
              class="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 truncate max-w-[220px]"
              :title="'@' + customer.username"
            >
              <span class="truncate">@{{ customer.username }}</span>
            </a>
            <span v-else class="text-[11px] text-slate-400 italic">No @username</span>
          </div>

          <!-- Telegram ID Pill with Copy Icon (Truncated with tooltip) -->
          <div
            v-if="customer.telegramId"
            @click="copyToClipboard(customer.telegramId, 'prof-id')"
            class="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 font-mono text-xs cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800 transition-all select-none max-w-[220px]"
            :title="'Click to copy ID: ' + customer.telegramId"
          >
            <span class="truncate">ID {{ customer.telegramId }}</span>
            <i :class="copiedId === 'prof-id' ? 'pi pi-check text-emerald-500' : 'pi pi-copy text-slate-400 text-[10px]'"></i>
          </div>

          <!-- Role / Status Pill Badge -->
          <div
            class="mt-2.5 inline-flex items-center px-3 py-0.5 rounded-full text-[11px] font-semibold"
            :class="customer.status !== 'ACTIVE'
              ? 'bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400'
              : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400'"
          >
            {{ customer.status !== 'ACTIVE' ? 'Deactivated' : 'Customer' }}
          </div>

          <!-- TOTAL BALANCE Section (Large bold text matching Screenshot 2) -->
          <div class="w-full mt-6 pt-5 border-t border-slate-100 dark:border-slate-800">
            <div class="text-[11px] font-semibold text-slate-400 dark:text-slate-400 uppercase tracking-wider">
              TOTAL BALANCE
            </div>
            <div class="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono mt-1 flex items-center justify-center gap-1.5">
              <span>{{ customer.walletBalanceMmk.toLocaleString() }}</span>
              <span class="text-xs font-semibold text-slate-400">MMK</span>
            </div>

            <!-- Two Sub-stat Boxes: Deposited vs Spent (Main vs Bonus in Screenshot 2) -->
            <div class="grid grid-cols-2 gap-2 mt-4">
              <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
                <div class="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Deposited</div>
                <div class="text-xs font-bold text-slate-800 dark:text-slate-200 font-mono mt-0.5">
                  {{ customer.totalDepositedMmk.toLocaleString() }} Ks
                </div>
              </div>
              <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
                <div class="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Total Spent</div>
                <div class="text-xs font-bold text-slate-800 dark:text-slate-200 font-mono mt-0.5">
                  {{ customer.totalSpentMmk.toLocaleString() }} Ks
                </div>
              </div>
            </div>
          </div>

          <!-- Metadata Rows with Icons matching Screenshot 2 -->
          <div class="w-full mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5 text-xs text-left">
            <div class="flex items-center justify-between text-slate-600 dark:text-slate-300">
              <span class="flex items-center gap-2 text-slate-400">
                <i class="pi pi-shopping-bag text-xs"></i>
                <span>Active Orders</span>
              </span>
              <span class="font-bold text-slate-900 dark:text-white font-mono">{{ customer.ordersCount }}</span>
            </div>

            <div class="flex items-center justify-between text-slate-600 dark:text-slate-300">
              <span class="flex items-center gap-2 text-slate-400">
                <i class="pi pi-wallet text-xs"></i>
                <span>Total Spent</span>
              </span>
              <span class="font-bold text-rose-500 dark:text-rose-400 font-mono">{{ formatCurrency(customer.totalSpentMmk) }}</span>
            </div>

            <div class="flex items-center justify-between text-slate-600 dark:text-slate-300">
              <span class="flex items-center gap-2 text-slate-400">
                <i class="pi pi-calendar text-xs"></i>
                <span>First Seen</span>
              </span>
              <span class="font-medium text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                {{ customer.createdAt ? formatMyanmarDate(customer.createdAt) : '-' }}
              </span>
            </div>

            <div class="flex items-center justify-between text-slate-600 dark:text-slate-300">
              <span class="flex items-center gap-2 text-slate-400">
                <i class="pi pi-clock text-xs"></i>
                <span>Last Active</span>
              </span>
              <span class="font-medium text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                {{ customer.lastActive ? formatMyanmarDateTime(customer.lastActive) : '-' }}
              </span>
            </div>
          </div>

          <!-- Action Buttons matching Screenshot 2 -->
          <div class="w-full mt-6 space-y-2">
            <!-- Adjust Balance (Solid Green Button matching Screenshot 2) -->
            <button
              type="button"
              @click="openAdjustModal"
              class="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-sm shadow-emerald-500/20"
            >
              <i class="pi pi-wallet text-xs"></i>
              <span>Adjust Balance</span>
            </button>

            <!-- Deactivate or Restore Button -->
            <button
              v-if="customer.status === 'ACTIVE'"
              type="button"
              @click="isDeactivateModalOpen = true"
              class="w-full py-2 px-4 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950/20 border border-slate-200 dark:border-slate-700 transition-colors flex items-center justify-center gap-2"
            >
              <i class="pi pi-ban text-xs"></i>
              <span>Deactivate Account</span>
            </button>
            <button
              v-else
              type="button"
              @click="handleRestore"
              :disabled="isRestoring"
              class="w-full py-2 px-4 rounded-xl text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-500/30 transition-colors flex items-center justify-center gap-2"
            >
              <i v-if="isRestoring" class="pi pi-spinner animate-spin text-xs"></i>
              <i v-else class="pi pi-check text-xs"></i>
              <span>{{ isRestoring ? 'Restoring...' : 'Restore Account' }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- RIGHT COLUMN: Tabs & Detail Tables matching Screenshot 2 -->
      <div class="lg:col-span-8 space-y-4">
        <div class="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
          <!-- Tab Navigation Header matching Screenshot 2 (emerald active color) -->
          <div class="flex items-center gap-2 px-4 pt-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 overflow-x-auto scrollbar-none">
            <button
              type="button"
              @click="activeTab = 'orders'"
              class="px-4 py-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 shrink-0"
              :class="activeTab === 'orders'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'"
            >
              <span>Purchases ({{ orders.length }})</span>
            </button>

            <button
              type="button"
              @click="activeTab = 'slips'"
              class="px-4 py-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 shrink-0"
              :class="activeTab === 'slips'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'"
            >
              <span>Payment Slips ({{ topUps.length }})</span>
            </button>

            <button
              type="button"
              @click="activeTab = 'ledger'"
              class="px-4 py-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 shrink-0"
              :class="activeTab === 'ledger'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'"
            >
              <span>Wallet Ledger ({{ ledger.length }})</span>
            </button>
          </div>

          <!-- TAB 1: PURCHASES / ORDERS -->
          <div v-if="activeTab === 'orders'" class="overflow-x-auto max-h-[560px] overflow-y-auto scrollbar-thin">
            <table class="w-full text-left border-collapse text-xs">
              <thead class="sticky top-0 z-10 bg-slate-50 dark:bg-[#0e172a] shadow-sm border-b border-slate-200 dark:border-slate-800">
                <tr class="font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th class="py-3 px-4">Order ID</th>
                  <th class="py-3 px-4">Product / Item</th>
                  <th class="py-3 px-4">Amount</th>
                  <th class="py-3 px-4">Status</th>
                  <th class="py-3 px-4">Date</th>
                  <th class="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60">
                <tr v-if="orders.length === 0">
                  <td colspan="6" class="py-12 text-center text-slate-400">
                    <i class="pi pi-shopping-bag text-2xl mb-2 block text-slate-300 dark:text-slate-600"></i>
                    <span>No orders made yet by this customer</span>
                  </td>
                </tr>
                <tr
                  v-for="order in orders"
                  :key="'ord-' + order.id"
                  class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td class="py-3 px-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                    {{ order.publicOrderNo || order.id }}
                  </td>
                  <td class="py-3 px-4">
                    <div class="font-medium text-slate-900 dark:text-white">
                      {{ order.items?.[0]?.productName || 'Digital Product' }}
                    </div>
                    <div v-if="order.items?.length > 1" class="text-[10px] text-slate-400">
                      +{{ order.items.length - 1 }} other item(s)
                    </div>
                  </td>
                  <td class="py-3 px-4 font-bold text-slate-900 dark:text-white font-mono">
                    {{ formatCurrencyKs(order.totalAmountMmk || 0) }}
                  </td>
                  <td class="py-3 px-4">
                    <span
                      v-if="order.status === 'DELIVERED'"
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                    >
                      <i class="pi pi-check text-[9px]"></i>
                      <span>Delivered</span>
                    </span>
                    <span
                      v-else-if="order.status === 'REFUNDED'"
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                    >
                      <i class="pi pi-replay text-[9px]"></i>
                      <span>Refunded</span>
                    </span>
                    <span
                      v-else
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 animate-pulse"
                    >
                      <i class="pi pi-clock text-[9px]"></i>
                      <span>Processing</span>
                    </span>
                  </td>
                  <td class="py-3 px-4 font-mono text-slate-500 text-[11px]">
                    {{ order.createdAt ? formatMyanmarDateTime(order.createdAt) : '-' }}
                  </td>
                  <td class="py-3 px-4 text-right">
                    <div class="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        @click="openCredentials(order)"
                        class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors inline-flex items-center gap-1"
                        title="View Delivered Credentials"
                      >
                        <i class="pi pi-key text-[10px] text-amber-500"></i>
                        <span>Keys</span>
                      </button>

                      <button
                        v-if="order.status === 'DELIVERED'"
                        type="button"
                        @click="resendCredentials(order)"
                        :disabled="isResendingId === (order.publicOrderNo || order.id)"
                        class="p-1 rounded-lg text-slate-500 hover:text-emerald-500 border border-slate-200 dark:border-slate-700/60 transition-colors"
                        title="Re-send credentials to Telegram"
                      >
                        <i v-if="isResendingId === (order.publicOrderNo || order.id)" class="pi pi-spinner animate-spin text-xs"></i>
                        <i v-else class="pi pi-send text-xs"></i>
                      </button>

                      <button
                        v-if="order.status === 'DELIVERED'"
                        type="button"
                        @click="refundOrder(order)"
                        :disabled="isRefundingId === (order.publicOrderNo || order.id)"
                        class="p-1 rounded-lg text-slate-500 hover:text-rose-500 border border-slate-200 dark:border-slate-700/60 transition-colors"
                        title="Refund to Wallet"
                      >
                        <i v-if="isRefundingId === (order.publicOrderNo || order.id)" class="pi pi-spinner animate-spin text-xs"></i>
                        <i v-else class="pi pi-replay text-xs"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- TAB 2: PAYMENT SLIPS -->
          <div v-else-if="activeTab === 'slips'" class="overflow-x-auto max-h-[560px] overflow-y-auto scrollbar-thin">
            <table class="w-full text-left border-collapse text-xs">
              <thead class="sticky top-0 z-10 bg-slate-50 dark:bg-[#0e172a] shadow-sm border-b border-slate-200 dark:border-slate-800">
                <tr class="font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th class="py-3 px-4">Ref #</th>
                  <th class="py-3 px-4">Method</th>
                  <th class="py-3 px-4">Amount</th>
                  <th class="py-3 px-4">Slip Receipt</th>
                  <th class="py-3 px-4">Status</th>
                  <th class="py-3 px-4">Date</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60">
                <tr v-if="topUps.length === 0">
                  <td colspan="6" class="py-12 text-center text-slate-400">
                    <i class="pi pi-receipt text-2xl mb-2 block text-slate-300 dark:text-slate-600"></i>
                    <span>No deposit slips submitted yet</span>
                  </td>
                </tr>
                <tr
                  v-for="slip in topUps"
                  :key="'slip-' + slip.id"
                  class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td class="py-3 px-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                    {{ slip.reference || ('TOP-' + slip.id) }}
                  </td>
                  <td class="py-3 px-4">
                    <span class="font-semibold px-2 py-0.5 rounded text-[11px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 text-slate-700 dark:text-slate-300">
                      {{ slip.paymentMethod || 'KPAY' }}
                    </span>
                  </td>
                  <td class="py-3 px-4 font-bold text-slate-900 dark:text-white font-mono">
                    {{ formatCurrencyKs(slip.amountMmk || 0) }}
                  </td>
                  <td class="py-3 px-4">
                    <button
                      type="button"
                      @click="openSlipPreview(slip)"
                      class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                    >
                      <i class="pi pi-image text-[10px]"></i>
                      <span>View Receipt</span>
                    </button>
                  </td>
                  <td class="py-3 px-4">
                    <span
                      v-if="slip.status === 'APPROVED' || slip.status === 'COMPLETED'"
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                    >
                      <i class="pi pi-check text-[9px]"></i>
                      <span>Approved</span>
                    </span>
                    <span
                      v-else-if="slip.status === 'REJECTED'"
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                    >
                      <i class="pi pi-times text-[9px]"></i>
                      <span>Rejected</span>
                    </span>
                    <span
                      v-else
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 animate-pulse"
                    >
                      <i class="pi pi-clock text-[9px]"></i>
                      <span>Submitted</span>
                    </span>
                  </td>
                  <td class="py-3 px-4 font-mono text-slate-500 text-[11px]">
                    {{ slip.createdAt ? formatMyanmarDateTime(slip.createdAt) : '-' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- TAB 3: WALLET LEDGER / AUDIT TRAIL -->
          <div v-else-if="activeTab === 'ledger'" class="overflow-x-auto max-h-[560px] overflow-y-auto scrollbar-thin">
            <table class="w-full text-left border-collapse text-xs">
              <thead class="sticky top-0 z-10 bg-slate-50 dark:bg-[#0e172a] shadow-sm border-b border-slate-200 dark:border-slate-800">
                <tr class="font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th class="py-3 px-4">ID</th>
                  <th class="py-3 px-4">Action Type</th>
                  <th class="py-3 px-4">Amount Change</th>
                  <th class="py-3 px-4">Balance After</th>
                  <th class="py-3 px-4">Audit Note / Ref</th>
                  <th class="py-3 px-4">Date & Time</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60">
                <tr v-if="ledger.length === 0">
                  <td colspan="6" class="py-12 text-center text-slate-400">
                    <i class="pi pi-file-edit text-2xl mb-2 block text-slate-300 dark:text-slate-600"></i>
                    <span>No ledger activity recorded yet</span>
                  </td>
                </tr>
                <tr
                  v-for="entry in ledger"
                  :key="'led-' + entry.id"
                  class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td class="py-3 px-4 font-mono text-slate-400">
                    #{{ entry.id }}
                  </td>
                  <td class="py-3 px-4 font-semibold">
                    <span
                      class="px-2 py-0.5 rounded text-[10px] font-mono font-bold"
                      :class="entry.amountMmk >= 0
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'"
                    >
                      {{ entry.type || (entry.amountMmk >= 0 ? 'CREDIT' : 'DEBIT') }}
                    </span>
                  </td>
                  <td
                    class="py-3 px-4 font-bold font-mono text-xs"
                    :class="entry.amountMmk >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'"
                  >
                    {{ entry.amountMmk >= 0 ? '+' : '' }}{{ entry.amountMmk.toLocaleString() }} Ks
                  </td>
                  <td class="py-3 px-4 font-mono font-semibold text-slate-800 dark:text-slate-200">
                    {{ (entry.balanceAfterMmk ?? entry.newBalanceMmk ?? 0).toLocaleString() }} Ks
                  </td>
                  <td class="py-3 px-4 text-slate-600 dark:text-slate-300 max-w-xs truncate" :title="entry.notes || entry.reference">
                    {{ entry.notes || entry.reference || '-' }}
                  </td>
                  <td class="py-3 px-4 font-mono text-slate-400 text-[11px]">
                    {{ entry.createdAt ? formatMyanmarDateTime(entry.createdAt) : '-' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Adjust Balance Modal (Teleported to body for 100% full-screen backdrop coverage) -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="isAdjustModalOpen && customer"
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
                    {{ customer.displayName }} (Current: {{ formatCurrencyKs(customer.walletBalanceMmk) }})
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
                placeholder="e.g. Manual balance top-up via KPay direct transfer"
                class="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-emerald-500 focus:ring-0"
                style="outline: none !important; box-shadow: none !important;"
              />
            </div>

            <!-- Telegram Notification Checkbox -->
            <div class="flex items-center gap-2.5">
              <input
                id="notify-tg-detail"
                v-model="adjustNotifyTelegram"
                type="checkbox"
                class="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <label for="notify-tg-detail" class="text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
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

    <!-- Deactivate Customer Modal (Teleported to body) -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="isDeactivateModalOpen && customer"
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
                  {{ customer.displayName }}
                </p>
              </div>
            </div>

            <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Deactivating prevents this customer from purchasing products or interacting with the bot. All history and balances will be preserved and can be restored at any time.
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

    <!-- Credentials Lightbox Modal (Teleported to body) -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="isCredentialsModalOpen && selectedOrderCredentials"
          class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          @click.self="isCredentialsModalOpen = false"
        >
          <div class="modal-card relative w-full max-w-lg bg-white dark:bg-[#0e1726] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 space-y-4">
            <div class="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center text-lg">
                  <i class="pi pi-key"></i>
                </div>
                <div>
                  <h3 class="text-base font-bold text-slate-900 dark:text-white">Product Credentials & Keys</h3>
                  <p class="text-xs text-slate-500 dark:text-slate-400">
                    {{ selectedOrderCredentials.productName }} ({{ selectedOrderCredentials.orderNo }})
                  </p>
                </div>
              </div>
              <button
                type="button"
                @click="isCredentialsModalOpen = false"
                class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center text-xs transition-colors"
              >
                <i class="pi pi-times"></i>
              </button>
            </div>

            <div class="relative">
              <textarea
                readonly
                rows="8"
                class="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 focus:outline-none select-all"
                :value="selectedOrderCredentials.credentialsText"
              ></textarea>
              <button
                type="button"
                @click="copyToClipboard(selectedOrderCredentials.credentialsText, 'modal-creds')"
                class="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 transition-colors inline-flex items-center gap-1.5"
              >
                <i :class="copiedId === 'modal-creds' ? 'pi pi-check text-emerald-500' : 'pi pi-copy text-xs'"></i>
                <span>{{ copiedId === 'modal-creds' ? 'Copied' : 'Copy' }}</span>
              </button>
            </div>

            <div class="flex justify-end pt-2">
              <button
                type="button"
                @click="isCredentialsModalOpen = false"
                class="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Slip Image Preview Modal (Teleported to body) -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="isSlipModalOpen && selectedSlipUrl"
          class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          @click.self="isSlipModalOpen = false"
        >
          <div class="modal-card relative max-w-lg w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-5 space-y-4">
            <div class="flex items-center justify-between">
              <h4 class="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <i class="pi pi-receipt text-emerald-500"></i>
                <span>Deposit Slip Proof ({{ selectedSlipRef }})</span>
              </h4>
              <button
                type="button"
                @click="isSlipModalOpen = false"
                class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center text-xs transition-colors"
              >
                <i class="pi pi-times"></i>
              </button>
            </div>

            <div class="rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-center max-h-[70vh]">
              <img
                :src="selectedSlipUrl"
                alt="Slip Image Proof"
                class="max-h-[68vh] w-auto object-contain mx-auto"
              />
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useToast } from '~/composables/useToast'
import { useAuth } from '~/composables/useAuth'
import { useStoreSettings } from '~/composables/useStoreSettings'
import { usePermission } from '~/composables/usePermission'

const toast = useToast()
const { getAuthHeaders } = useAuth()
const { settings, fetchSettings, saveSettings, isSaving, isLoading } = useStoreSettings()
const { can } = usePermission()

// Each settings section is only editable with its matching permission — the
// API enforces the same split on GET (field filtering) and PUT (whitelist).
const canEditPricing = computed(() => can('settings.pricing'))
const canEditPayments = computed(() => can('settings.payments'))
const canEditOperations = computed(() => can('settings.operations'))
const canEditAnySettings = computed(() => canEditPricing.value || canEditPayments.value || canEditOperations.value)

const showSuccessBanner = ref(false)
const isRecalculating = ref(false)

// Password Change State
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const showCurrentPw = ref(false)
const showNewPw = ref(false)
const isChangingPassword = ref(false)
const passwordError = ref('')
const passwordSuccess = ref('')

onMounted(async () => {
  await fetchSettings(true)
})

// Sample live calculation preview
const sampleCostUsd = ref(1.00)
const calculatedBaseMmk = computed(() => Math.round(sampleCostUsd.value * (settings.value.usdToMmkRate || 4500)))
const calculatedRetailMmk = computed(() => {
  const base = calculatedBaseMmk.value
  const withMargin = base * (1 + (settings.value.defaultMarginPct || 25) / 100)
  return Math.ceil(withMargin / 100) * 100 // Rounded up to nearest 100 MMK
})
const calculatedProfitMmk = computed(() => calculatedRetailMmk.value - calculatedBaseMmk.value)

function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num)
}

async function handleSave() {
  const result = await saveSettings(settings.value)
  if (!result.success) {
    toast.error('Failed to save settings: ' + (result.error || 'Unknown error'))
    return
  }

  // Automatically recalculate catalog products pricing with the newly saved exchange rate & margin
  try {
    const repriceRes: any = await $fetch('/api/admin/settings/recalculate-prices', {
      method: 'POST',
      headers: getAuthHeaders(),
    })

    showSuccessBanner.value = true
    const count = repriceRes?.updatedCount || 0
    toast.success(
      `Settings saved & ${count} products updated to ${formatNumber(settings.value.usdToMmkRate)} MMK (+${settings.value.defaultMarginPct}% margin)!`,
      'Catalog Updated'
    )
  } catch (err: any) {
    showSuccessBanner.value = true
    toast.success('Store rates and payment accounts saved to database!', 'Settings Saved')
  }

  setTimeout(() => {
    showSuccessBanner.value = false
  }, 4500)
}

async function handleRecalculatePrices() {
  if (!confirm(`Are you sure you want to recalculate all product retail prices using 1 USD = ${formatNumber(settings.value.usdToMmkRate)} MMK and ${settings.value.defaultMarginPct}% default margin?`)) {
    return
  }

  isRecalculating.value = true
  try {
    // First ensure settings are saved
    await saveSettings(settings.value)

    const res: any = await $fetch('/api/admin/settings/recalculate-prices', {
      method: 'POST',
      headers: getAuthHeaders(),
    })

    if (res.ok) {
      toast.success(res.message, 'Catalog Repriced')
    } else {
      toast.error('Recalculation failed: ' + (res.error || 'Unknown error'))
    }
  } catch (err: any) {
    toast.error('Recalculation error: ' + (err.message || 'Network error'))
  } finally {
    isRecalculating.value = false
  }
}

async function handleChangePassword() {
  passwordError.value = ''
  passwordSuccess.value = ''

  if (!currentPassword.value || !newPassword.value || !confirmPassword.value) {
    passwordError.value = 'Please fill in all password fields.'
    return
  }

  if (newPassword.value.length < 8) {
    passwordError.value = 'New password must be at least 8 characters long.'
    return
  }

  if (newPassword.value !== confirmPassword.value) {
    passwordError.value = 'New password and confirmation do not match.'
    return
  }

  isChangingPassword.value = true
  try {
    const res: any = await $fetch('/api/admin/auth/change-password', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: {
        currentPassword: currentPassword.value,
        newPassword: newPassword.value,
      },
    })

    if (res.ok) {
      passwordSuccess.value = 'Password changed successfully! Keep your new password secure.'
      toast.success('Admin password updated successfully!', 'Security Updated')
      currentPassword.value = ''
      newPassword.value = ''
      confirmPassword.value = ''
    } else {
      passwordError.value = res.error || 'Failed to update password.'
      toast.error(passwordError.value)
    }
  } catch (err: any) {
    const msg = err.data?.error || err.message || 'Error changing password'
    passwordError.value = msg
    toast.error(msg)
  } finally {
    isChangingPassword.value = false
  }
}
</script>

<template>
  <div class="space-y-6 max-w-5xl mx-auto pb-12">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
          <i class="pi pi-sliders-h text-indigo-600 dark:text-indigo-400"></i>
          Rates & Store Settings (စနစ်ပြင်ဆင်မှုများ)
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Configure live USD to MMK exchange rate, automated profit margins, Myanmar payment accounts, bot parameters, and admin security
        </p>
      </div>

      <div class="flex items-center gap-2.5 shrink-0">
        <button
          type="button"
          @click="fetchSettings(true)"
          :disabled="isLoading"
          title="Reload latest settings from database"
          class="px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-all flex items-center gap-1.5"
        >
          <i class="pi pi-sync text-xs" :class="{ 'animate-spin': isLoading }"></i>
          <span class="hidden sm:inline">Refresh</span>
        </button>

        <button
          v-if="canEditAnySettings"
          type="button"
          @click="handleSave"
          :disabled="isSaving"
          class="px-5 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-md shadow-indigo-600/20 flex items-center gap-2 disabled:opacity-50 cursor-pointer"
        >
          <i v-if="isSaving" class="pi pi-spin pi-spinner text-xs"></i>
          <i v-else class="pi pi-check text-xs"></i>
          <span>{{ isSaving ? 'Saving...' : 'Save Configuration' }}</span>
        </button>
      </div>
    </div>

    <!-- Success Toast Banner -->
    <div
      v-if="showSuccessBanner"
      class="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center justify-between shadow-sm animate-fade-in"
    >
      <div class="flex items-center gap-2">
        <i class="pi pi-check-circle text-base text-emerald-500"></i>
        <span>Settings successfully saved to Neon PostgreSQL & synced across Telegram Bot!</span>
      </div>
      <button type="button" @click="showSuccessBanner = false" class="hover:opacity-75">
        <i class="pi pi-times text-xs"></i>
      </button>
    </div>

    <form @submit.prevent="handleSave" class="space-y-6">
      <!-- Section 1: Exchange Rate & Margins -->
      <fieldset :disabled="!canEditPricing" class="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6 min-w-0 disabled:opacity-75">
        <div class="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold text-sm">
              <i class="pi pi-dollar"></i>
            </div>
            <div>
              <h2 class="text-base font-bold text-slate-900 dark:text-white">Exchange Rate & Pricing Formula</h2>
              <p class="text-xs text-slate-500">Determines how upstream USD wholesale costs are converted to customer MMK prices</p>
            </div>
          </div>
          <span class="px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
            Real-time DB Sync
          </span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- USD to MMK Rate -->
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              USD to MMK Exchange Rate (1 USD = ? Kyats)
            </label>
            <div class="relative">
              <input
                v-model.number="settings.usdToMmkRate"
                type="number"
                step="50"
                min="1000"
                max="20000"
                required
                class="w-full pl-4 pr-16 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
              <span class="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                MMK
              </span>
            </div>
            <p class="text-[11px] text-slate-400">Current market reference: ~4,500 – 4,800 MMK / 1 USD</p>
          </div>

          <!-- Default Margin % -->
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Default Profit Margin (% Markup on Wholesale Cost)
            </label>
            <div class="relative">
              <input
                v-model.number="settings.defaultMarginPct"
                type="number"
                step="1"
                min="0"
                max="300"
                required
                class="w-full pl-4 pr-12 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
              <span class="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                %
              </span>
            </div>
            <p class="text-[11px] text-slate-400">Applies as base profit margin when syncing catalog from XPro supplier</p>
          </div>
        </div>

        <!-- Live Calculation Preview Simulator -->
        <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 space-y-3">
          <div class="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span class="flex items-center gap-1.5">
              <i class="pi pi-calculator text-indigo-500"></i>
              Live Pricing Preview Simulator
            </span>
            <div class="flex items-center gap-2">
              <span class="text-slate-400">Supplier Cost:</span>
              <input
                v-model.number="sampleCostUsd"
                type="number"
                step="0.10"
                min="0.10"
                class="w-16 px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-center font-mono font-semibold text-xs"
              />
              <span>USD</span>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-3 pt-2 border-t border-slate-200 dark:border-slate-700/60 text-xs">
            <div>
              <span class="text-slate-400 block text-[11px]">Wholesale Cost</span>
              <span class="font-mono font-semibold text-slate-800 dark:text-slate-200">{{ formatNumber(calculatedBaseMmk) }} MMK</span>
            </div>
            <div>
              <span class="text-slate-400 block text-[11px]">Store Profit (+{{ settings.defaultMarginPct }}%)</span>
              <span class="font-mono font-semibold text-emerald-600 dark:text-emerald-400">+{{ formatNumber(calculatedProfitMmk) }} MMK</span>
            </div>
            <div>
              <span class="text-slate-400 block text-[11px]">Customer Retail Price</span>
              <span class="font-mono font-bold text-indigo-600 dark:text-indigo-400 text-sm">{{ formatNumber(calculatedRetailMmk) }} MMK</span>
            </div>
          </div>
        </div>

        <!-- Catalog Reprice Action -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800/80">
          <div>
            <span class="text-xs font-bold text-slate-800 dark:text-slate-200 block">Apply Rate to All Products</span>
            <span class="text-[11px] text-slate-400">Recalculates retail MMK prices for all 42+ active products using this rate & margin</span>
          </div>
          <button
            type="button"
            @click="handleRecalculatePrices"
            :disabled="isRecalculating"
            class="px-4 py-2 rounded-xl text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <i class="pi pi-refresh text-xs" :class="{ 'animate-spin': isRecalculating }"></i>
            <span>{{ isRecalculating ? 'Recalculating Catalog...' : 'Recalculate All Product Prices' }}</span>
          </button>
        </div>
      </fieldset>

      <!-- Section 2: Myanmar Payment Accounts -->
      <fieldset :disabled="!canEditPayments" class="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6 min-w-0 disabled:opacity-75">
        <div class="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-bold text-sm">
              <i class="pi pi-credit-card"></i>
            </div>
            <div>
              <h2 class="text-base font-bold text-slate-900 dark:text-white">Payment Accounts (ငွေလက်ခံမည့် အကောင့်များ)</h2>
              <p class="text-xs text-slate-500">Displayed dynamically to customers in Telegram Bot during wallet top-ups and checkouts</p>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- KBZPay Card -->
          <div class="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 space-y-3">
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 rounded-full bg-blue-600"></span>
              <span class="font-bold text-sm text-blue-950 dark:text-blue-200">KBZPay (KPay)</span>
            </div>
            <div class="space-y-2">
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">Account Name</label>
                <input
                  v-model="settings.kpayAccountName"
                  type="text"
                  required
                  placeholder="e.g. Arena Digital Services"
                  class="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">Phone Number</label>
                <input
                  v-model="settings.kpayPhone"
                  type="text"
                  required
                  placeholder="09 987 654 321"
                  class="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900 rounded-lg text-xs font-mono font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <!-- WavePay Card -->
          <div class="p-4 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 space-y-3">
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 rounded-full bg-amber-500"></span>
              <span class="font-bold text-sm text-amber-950 dark:text-amber-200">WavePay</span>
            </div>
            <div class="space-y-2">
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">Account Name</label>
                <input
                  v-model="settings.wavepayAccountName"
                  type="text"
                  required
                  placeholder="e.g. Arena Store"
                  class="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">Phone Number</label>
                <input
                  v-model="settings.wavepayPhone"
                  type="text"
                  required
                  placeholder="09 789 123 456"
                  class="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900 rounded-lg text-xs font-mono font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
            </div>
          </div>

          <!-- AYA Pay Card -->
          <div class="p-4 rounded-xl bg-red-50/50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 space-y-3">
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 rounded-full bg-red-600"></span>
              <span class="font-bold text-sm text-red-950 dark:text-red-200">AYA Pay</span>
            </div>
            <div class="space-y-2">
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">Account Name</label>
                <input
                  v-model="settings.ayapayAccountName"
                  type="text"
                  placeholder="e.g. Arena Store"
                  class="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">Phone Number</label>
                <input
                  v-model="settings.ayapayPhone"
                  type="text"
                  placeholder="09 987 654 321"
                  class="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900 rounded-lg text-xs font-mono font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>
            </div>
          </div>

          <!-- UAB Pay Card -->
          <div class="p-4 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/50 space-y-3">
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 rounded-full bg-purple-600"></span>
              <span class="font-bold text-sm text-purple-950 dark:text-purple-200">UAB Pay</span>
            </div>
            <div class="space-y-2">
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">Account Name</label>
                <input
                  v-model="settings.uabpayAccountName"
                  type="text"
                  placeholder="e.g. Arena Store"
                  class="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-900 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">Phone Number</label>
                <input
                  v-model="settings.uabpayPhone"
                  type="text"
                  placeholder="09 789 123 456"
                  class="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-900 rounded-lg text-xs font-mono font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
            </div>
          </div>
        </div>
      </fieldset>

      <!-- Section 3: Telegram Support & Operating Rules -->
      <fieldset :disabled="!canEditOperations" class="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6 min-w-0 disabled:opacity-75">
        <div class="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold text-sm">
              <i class="pi pi-send"></i>
            </div>
            <div>
              <h2 class="text-base font-bold text-slate-900 dark:text-white">Customer Support & Bot Operations</h2>
              <p class="text-xs text-slate-500">Contact endpoints and reservation timeout rules</p>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Support Handle -->
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Customer Support Telegram Handle
            </label>
            <input
              v-model="settings.supportTelegramHandle"
              type="text"
              required
              placeholder="@ArenaStoreSupport"
              class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            <p class="text-[11px] text-slate-400">Attached to order confirmations and /help messages in Telegram Bot</p>
          </div>

          <!-- Order Reservation Timeout -->
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Payment Submission Timeout (Minutes)
            </label>
            <div class="relative">
              <input
                v-model.number="settings.orderTimeoutMinutes"
                type="number"
                min="5"
                max="60"
                required
                class="w-full pl-4 pr-16 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
              <span class="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                mins
              </span>
            </div>
            <p class="text-[11px] text-slate-400">Time window allowed for customers to upload payment slip receipts</p>
          </div>
        </div>
      </fieldset>

      <!-- Save Button Row -->
      <div v-if="canEditAnySettings" class="flex justify-end pt-2">
        <button
          type="submit"
          :disabled="isSaving"
          class="px-6 py-3 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-lg shadow-indigo-600/25 flex items-center gap-2 disabled:opacity-50 cursor-pointer"
        >
          <i v-if="isSaving" class="pi pi-spin pi-spinner text-xs"></i>
          <i v-else class="pi pi-check text-xs"></i>
          <span>{{ isSaving ? 'Saving Changes...' : 'Save All Settings' }}</span>
        </button>
      </div>
    </form>

    <!-- Section 4: Admin Security & Password Change (NEW) -->
    <div class="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6">
      <div class="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center font-bold text-sm">
            <i class="pi pi-lock"></i>
          </div>
          <div>
            <h2 class="text-base font-bold text-slate-900 dark:text-white">Admin Security & Password (လျှို့ဝှက်နံပါတ် ပြောင်းလဲခြင်း)</h2>
            <p class="text-xs text-slate-500">Update your administrator password securely. Must be at least 8 characters long.</p>
          </div>
        </div>
        <span class="px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/20">
          scrypt Encrypted
        </span>
      </div>

      <!-- Password Error Alert -->
      <div
        v-if="passwordError"
        class="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5"
      >
        <i class="pi pi-exclamation-circle text-rose-400"></i>
        <span>{{ passwordError }}</span>
      </div>

      <!-- Password Success Alert -->
      <div
        v-if="passwordSuccess"
        class="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5"
      >
        <i class="pi pi-check-circle text-emerald-400"></i>
        <span>{{ passwordSuccess }}</span>
      </div>

      <form @submit.prevent="handleChangePassword" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <!-- Current Password -->
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Current Password (လက်ရှိ လျှို့ဝှက်နံပါတ်)
            </label>
            <div class="relative">
              <input
                v-model="currentPassword"
                :type="showCurrentPw ? 'text' : 'password'"
                required
                autocomplete="current-password"
                placeholder="••••••••••••"
                class="w-full pl-3 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
              <button
                type="button"
                @click="showCurrentPw = !showCurrentPw"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                <i :class="showCurrentPw ? 'pi pi-eye-slash' : 'pi pi-eye'" class="text-xs"></i>
              </button>
            </div>
          </div>

          <!-- New Password -->
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              New Password (အသစ်ထားမည့် လျှို့ဝှက်နံပါတ်)
            </label>
            <div class="relative">
              <input
                v-model="newPassword"
                :type="showNewPw ? 'text' : 'password'"
                required
                autocomplete="new-password"
                placeholder="Min 8 characters"
                class="w-full pl-3 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
              <button
                type="button"
                @click="showNewPw = !showNewPw"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                <i :class="showNewPw ? 'pi pi-eye-slash' : 'pi pi-eye'" class="text-xs"></i>
              </button>
            </div>
          </div>

          <!-- Confirm New Password -->
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Confirm New Password (အတည်ပြုရန် ထပ်ရိုက်ပါ)
            </label>
            <div class="relative">
              <input
                v-model="confirmPassword"
                :type="showNewPw ? 'text' : 'password'"
                required
                autocomplete="new-password"
                placeholder="Repeat new password"
                class="w-full pl-3 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between pt-2">
          <p class="text-[11px] text-slate-400">
            Note: Changing the admin password takes effect immediately and updates securely in Neon DB.
          </p>
          <button
            type="submit"
            :disabled="isChangingPassword"
            class="px-5 py-2.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-all shadow-md shadow-rose-600/20 flex items-center gap-2 disabled:opacity-50 cursor-pointer shrink-0"
          >
            <i v-if="isChangingPassword" class="pi pi-spin pi-spinner text-xs"></i>
            <i v-else class="pi pi-key text-xs"></i>
            <span>{{ isChangingPassword ? 'Updating Password...' : 'Update Admin Password' }}</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

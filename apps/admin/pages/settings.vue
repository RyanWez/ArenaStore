<script setup lang="ts">
import { ref, computed } from 'vue'
import { useToast } from '~/composables/useToast'

const toast = useToast()
const isSaving = ref(false)
const showSuccessBanner = ref(false)

const settings = ref({
  usdToMmkRate: 4500,
  defaultMarginPct: 25,
  orderTimeoutMinutes: 15,
  supportTelegramHandle: '@ArenaStoreSupport',
  isMaintenanceMode: false,
  kpayAccountName: 'Arena Digital Services',
  kpayPhone: '09 987 654 321',
  wavepayAccountName: 'Arena Store',
  wavepayPhone: '09 789 123 456',
  ayapayAccountName: 'Arena Store',
  ayapayPhone: '09 987 654 321',
  uabpayAccountName: 'Arena Store',
  uabpayPhone: '09 789 123 456',
})

// Sample live calculation preview
const sampleCostUsd = ref(1.00)
const calculatedBaseMmk = computed(() => Math.round(sampleCostUsd.value * settings.value.usdToMmkRate))
const calculatedRetailMmk = computed(() => {
  const base = calculatedBaseMmk.value
  const withMargin = base * (1 + settings.value.defaultMarginPct / 100)
  return Math.ceil(withMargin / 50) * 50 // Rounded to nearest 50 MMK
})
const calculatedProfitMmk = computed(() => calculatedRetailMmk.value - calculatedBaseMmk.value)

function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num)
}

async function handleSave() {
  isSaving.value = true
  try {
    // In live system, calls PUT /api/admin/settings
    await new Promise((r) => setTimeout(r, 600))
    showSuccessBanner.value = true
    toast.success('Store rates and payment accounts saved successfully!', 'Settings Saved')
    setTimeout(() => {
      showSuccessBanner.value = false
    }, 4000)
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="space-y-6 max-w-5xl mx-auto">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
          <i class="pi pi-sliders-h text-indigo-600 dark:text-indigo-400"></i>
          Rates & Store Settings (စနစ်ပြင်ဆင်မှုများ)
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Configure USD to MMK exchange rate, automated profit margins, Myanmar payment accounts, and bot parameters
        </p>
      </div>

      <button
        type="button"
        @click="handleSave"
        :disabled="isSaving"
        class="px-5 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-md shadow-indigo-600/20 flex items-center gap-2 disabled:opacity-50 shrink-0"
      >
        <i class="pi pi-check text-xs"></i>
        <span>{{ isSaving ? 'Saving...' : 'Save Configuration' }}</span>
      </button>
    </div>

    <!-- Success Toast Banner -->
    <div
      v-if="showSuccessBanner"
      class="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center justify-between shadow-sm animate-fade-in"
    >
      <div class="flex items-center gap-2">
        <i class="pi pi-check-circle text-base text-emerald-500"></i>
        <span>Settings successfully updated across API and Telegram Bot!</span>
      </div>
      <button type="button" @click="showSuccessBanner = false" class="hover:opacity-75">
        <i class="pi pi-times text-xs"></i>
      </button>
    </div>

    <form @submit.prevent="handleSave" class="space-y-6">
      <!-- Section 1: Exchange Rate & Margins -->
      <div class="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6">
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
          <span class="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
            Real-time Sync
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
                required
                class="w-full pl-4 pr-16 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
              <span class="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                MMK
              </span>
            </div>
            <p class="text-[11px] text-slate-400">Current market reference: ~4,500 MMK / 1 USD</p>
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
                max="200"
                required
                class="w-full pl-4 pr-12 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
              <span class="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                %
              </span>
            </div>
            <p class="text-[11px] text-slate-400">Can be overridden on individual products in Products page</p>
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
      </div>

      <!-- Section 2: Myanmar Payment Accounts -->
      <div class="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6">
        <div class="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-bold text-sm">
              <i class="pi pi-credit-card"></i>
            </div>
            <div>
              <h2 class="text-base font-bold text-slate-900 dark:text-white">Payment Accounts (ငွေလက်ခံမည့် အကောင့်များ)</h2>
              <p class="text-xs text-slate-500">Displayed to customers on Telegram during checkout for payment slip submissions</p>
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
                  class="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200"
                />
              </div>
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">Phone Number</label>
                <input
                  v-model="settings.kpayPhone"
                  type="text"
                  class="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900 rounded-lg text-xs font-mono font-medium text-slate-800 dark:text-slate-200"
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
                  class="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200"
                />
              </div>
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">Phone Number</label>
                <input
                  v-model="settings.wavepayPhone"
                  type="text"
                  class="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900 rounded-lg text-xs font-mono font-medium text-slate-800 dark:text-slate-200"
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
                  class="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200"
                />
              </div>
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">Phone Number</label>
                <input
                  v-model="settings.ayapayPhone"
                  type="text"
                  class="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900 rounded-lg text-xs font-mono font-medium text-slate-800 dark:text-slate-200"
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
                  class="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-900 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200"
                />
              </div>
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">Phone Number</label>
                <input
                  v-model="settings.uabpayPhone"
                  type="text"
                  class="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-900 rounded-lg text-xs font-mono font-medium text-slate-800 dark:text-slate-200"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Section 3: Telegram Support & Operating Rules -->
      <div class="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6">
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
              class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            <p class="text-[11px] text-slate-400">Provided in order confirmation and help commands</p>
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
                class="w-full pl-4 pr-16 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
              <span class="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                mins
              </span>
            </div>
            <p class="text-[11px] text-slate-400">Stock reservation expires if payment slip is not uploaded within this window</p>
          </div>
        </div>
      </div>
    </form>
  </div>
</template>

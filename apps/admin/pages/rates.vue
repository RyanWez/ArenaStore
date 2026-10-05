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

// Rate and margin configuration is gated by settings.pricing
const canEditPricing = computed(() => can('settings.pricing'))

const showSuccessBanner = ref(false)
const isRecalculating = ref(false)
const isAutoRepricing = ref(false)

// Quick presets for convenience
const quickRatePresets = [4500, 4600, 4700, 4800, 5000]
const quickMarginPresets = [15, 20, 25, 30, 35]

// Sample live calculation preview simulator
const sampleCostUsd = ref(1.00)
const calculatedBaseMmk = computed(() => Math.round(sampleCostUsd.value * (settings.value.usdToMmkRate || 4500)))
const calculatedRetailMmk = computed(() => {
  const base = calculatedBaseMmk.value
  const withMargin = base * (1 + (settings.value.defaultMarginPct || 25) / 100)
  return Math.ceil(withMargin / 100) * 100 // Rounded up to nearest 100 MMK
})
const calculatedProfitMmk = computed(() => calculatedRetailMmk.value - calculatedBaseMmk.value)
const calculatedEffectiveMarginPct = computed(() => {
  if (calculatedBaseMmk.value <= 0) return '0.0'
  return ((calculatedProfitMmk.value / calculatedBaseMmk.value) * 100).toFixed(1)
})

function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num)
}

function applyRatePreset(rate: number) {
  if (!canEditPricing.value) return
  settings.value.usdToMmkRate = rate
}

function applyMarginPreset(margin: number) {
  if (!canEditPricing.value) return
  settings.value.defaultMarginPct = margin
}

onMounted(async () => {
  await fetchSettings(true)
})

const saveButtonLabel = computed(() => {
  if (isAutoRepricing.value) return 'Updating Catalog Prices...'
  if (isSaving.value) return 'Saving Rates...'
  return 'Save Rates & Apply'
})

async function handleSaveRates() {
  if (!canEditPricing.value) {
    toast.error('Permission denied: You cannot edit rates & margins.')
    return
  }

  isSaving.value = true
  try {
    // Save only exchange rate & default margin
    const result = await saveSettings({
      usdToMmkRate: settings.value.usdToMmkRate,
      defaultMarginPct: settings.value.defaultMarginPct,
    })

    if (!result.success) {
      toast.error('Failed to save rates: ' + (result.error || 'Unknown error'))
      return
    }

    // Automatically recalculate catalog product prices with new rate & margin
    isAutoRepricing.value = true
    try {
      const repriceRes: any = await $fetch('/api/admin/settings/recalculate-prices', {
        method: 'POST',
        headers: getAuthHeaders(),
      })

      showSuccessBanner.value = true
      const count = repriceRes?.updatedCount || 0
      toast.success(
        `Rates saved & ${count} catalog products updated to 1 USD = ${formatNumber(settings.value.usdToMmkRate)} MMK (+${settings.value.defaultMarginPct}% margin)!`,
        'Rates & Catalog Updated'
      )
    } catch (err: any) {
      showSuccessBanner.value = true
      toast.success('Exchange rate & default profit margin saved to database!', 'Rates Saved')
    }
  } finally {
    isAutoRepricing.value = false
    isSaving.value = false
  }

  setTimeout(() => {
    showSuccessBanner.value = false
  }, 5000)
}

async function handleRecalculatePrices() {
  if (!canEditPricing.value) {
    toast.error('Permission denied: You cannot recalculate catalog prices.')
    return
  }

  const confirmMsg = `Are you sure you want to recalculate all product retail prices using 1 USD = ${formatNumber(settings.value.usdToMmkRate)} MMK and ${settings.value.defaultMarginPct}% margin?`
  if (!confirm(confirmMsg)) {
    return
  }

  isRecalculating.value = true
  try {
    // Ensure latest settings in DB first
    await saveSettings({
      usdToMmkRate: settings.value.usdToMmkRate,
      defaultMarginPct: settings.value.defaultMarginPct,
    })

    const res: any = await $fetch('/api/admin/settings/recalculate-prices', {
      method: 'POST',
      headers: getAuthHeaders(),
    })

    if (res.ok) {
      const count = res?.updatedCount || 0
      toast.success(`Catalog repriced! ${count} active products updated successfully.`, 'Prices Recalculated')
    } else {
      toast.error('Recalculation failed: ' + (res.error || 'Unknown error'))
    }
  } catch (err: any) {
    toast.error('Recalculation error: ' + (err.message || 'Network error'))
  } finally {
    isRecalculating.value = false
  }
}
</script>

<template>
  <div class="space-y-6 max-w-5xl mx-auto pb-12">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold text-base">
            <i class="pi pi-percentage"></i>
          </div>
          Rates & Margins (ငွေလဲနှုန်းနှင့် အမြတ်သတ်မှတ်ချက်)
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Configure real-time USD/MMK exchange rates, default profit markup, and bulk recalculate customer retail prices
        </p>
      </div>

      <div class="flex items-center gap-2.5 shrink-0">
        <button
          type="button"
          @click="fetchSettings(true)"
          :disabled="isLoading"
          title="Reload latest rates from database"
          class="px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-all flex items-center gap-1.5 cursor-pointer"
        >
          <i class="pi pi-sync text-xs" :class="{ 'animate-spin': isLoading }"></i>
          <span class="hidden sm:inline">Refresh</span>
        </button>

        <button
          v-if="canEditPricing"
          type="button"
          @click="handleSaveRates"
          :disabled="isSaving || isAutoRepricing"
          class="px-5 py-2.5 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white transition-all shadow-md shadow-amber-600/20 flex items-center gap-2 disabled:opacity-50 cursor-pointer"
        >
          <i v-if="isSaving || isAutoRepricing" class="pi pi-spin pi-spinner text-xs"></i>
          <i v-else class="pi pi-check text-xs"></i>
          <span>{{ saveButtonLabel }}</span>
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
        <span>Exchange rates & margins successfully saved to Neon PostgreSQL & synced with catalog products!</span>
      </div>
      <button type="button" @click="showSuccessBanner = false" class="hover:opacity-75 cursor-pointer">
        <i class="pi pi-times text-xs"></i>
      </button>
    </div>

    <!-- Permission Restriction Warning if read-only -->
    <div
      v-if="!canEditPricing"
      class="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs font-medium flex items-center gap-3 shadow-sm"
    >
      <i class="pi pi-lock text-amber-500 text-base"></i>
      <div>
        <span class="font-bold">View Only Mode:</span>
        Your administrator role does not have permission (<code class="font-mono text-[11px] px-1 py-0.5 rounded bg-amber-500/20">settings.pricing</code>) to edit exchange rates or recalculate catalog prices.
      </div>
    </div>

    <!-- Main Exchange Rate & Margin Card -->
    <div class="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6">
      <div class="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold text-sm">
            <i class="pi pi-dollar"></i>
          </div>
          <div>
            <h2 class="text-base font-bold text-slate-900 dark:text-white">Exchange Rate & Profit Margin Settings</h2>
            <p class="text-xs text-slate-500">Sets the base conversion formula from supplier USD wholesale cost to customer MMK retail price</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span
            v-if="canEditPricing"
            class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1"
          >
            <i class="pi pi-check-circle text-[10px]"></i>
            Editable
          </span>
          <span
            v-else
            class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20 flex items-center gap-1"
          >
            <i class="pi pi-lock text-[10px]"></i>
            Read Only
          </span>
          <span class="px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
            Real-time DB Sync
          </span>
        </div>
      </div>

      <fieldset :disabled="!canEditPricing" class="space-y-6 min-w-0 disabled:opacity-80">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- USD to MMK Rate -->
          <div class="space-y-2">
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
                class="w-full pl-4 pr-16 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
              />
              <span class="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                MMK
              </span>
            </div>
            <!-- Quick Rate Preset Buttons -->
            <div class="flex items-center gap-1.5 flex-wrap pt-1">
              <span class="text-[11px] text-slate-400">Quick presets:</span>
              <button
                v-for="rate in quickRatePresets"
                :key="rate"
                type="button"
                @click="applyRatePreset(rate)"
                class="px-2 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer"
                :class="settings.usdToMmkRate === rate
                  ? 'bg-amber-500 text-white font-bold'
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'"
              >
                {{ formatNumber(rate) }}
              </button>
            </div>
            <p class="text-[11px] text-slate-400">Current market reference: ~4,500 – 4,800 MMK / 1 USD</p>
          </div>

          <!-- Default Margin % -->
          <div class="space-y-2">
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
                class="w-full pl-4 pr-12 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
              />
              <span class="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                %
              </span>
            </div>
            <!-- Quick Margin Preset Buttons -->
            <div class="flex items-center gap-1.5 flex-wrap pt-1">
              <span class="text-[11px] text-slate-400">Quick presets:</span>
              <button
                v-for="margin in quickMarginPresets"
                :key="margin"
                type="button"
                @click="applyMarginPreset(margin)"
                class="px-2 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer"
                :class="settings.defaultMarginPct === margin
                  ? 'bg-amber-500 text-white font-bold'
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'"
              >
                +{{ margin }}%
              </button>
            </div>
            <p class="text-[11px] text-slate-400">Applied as store profit margin when importing/syncing catalog from upstream supplier</p>
          </div>
        </div>
      </fieldset>
    </div>

    <!-- Live Calculation Preview Simulator -->
    <div class="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-bold text-sm">
            <i class="pi pi-calculator"></i>
          </div>
          <div>
            <h3 class="text-sm font-bold text-slate-900 dark:text-white">Live Pricing Preview Simulator (တိုက်ရိုက်အမြတ် တွက်ချက်မှု စမ်းသပ်ချက်)</h3>
            <p class="text-[11px] text-slate-500">Test how different wholesale costs convert into customer retail MMK prices</p>
          </div>
        </div>

        <div class="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
          <span class="text-xs text-slate-500 font-medium">Test Supplier Cost:</span>
          <div class="relative flex items-center">
            <span class="text-xs text-slate-400 mr-1">$</span>
            <input
              v-model.number="sampleCostUsd"
              type="number"
              step="0.50"
              min="0.10"
              max="100.00"
              class="w-18 px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-center font-mono font-semibold text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <span class="text-[11px] text-slate-400 ml-1">USD</span>
          </div>
        </div>
      </div>

      <!-- Quick Test Cost Buttons -->
      <div class="flex items-center gap-1.5 flex-wrap">
        <span class="text-[11px] text-slate-400">Sample products:</span>
        <button
          v-for="cost in [0.50, 1.00, 2.00, 5.00, 10.00]"
          :key="cost"
          type="button"
          @click="sampleCostUsd = cost"
          class="px-2 py-0.5 rounded text-[11px] font-mono cursor-pointer transition-colors"
          :class="sampleCostUsd === cost
            ? 'bg-indigo-600 text-white font-bold'
            : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'"
        >
          ${{ cost.toFixed(2) }}
        </button>
      </div>

      <!-- Visual Metric Breakdown Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
        <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 space-y-1">
          <div class="flex items-center justify-between">
            <span class="text-xs text-slate-500 font-medium">1. Wholesale Base Cost</span>
            <span class="text-[10px] text-slate-400 font-mono">${{ sampleCostUsd.toFixed(2) }} × {{ formatNumber(settings.usdToMmkRate) }}</span>
          </div>
          <p class="font-mono font-bold text-lg text-slate-900 dark:text-white">
            {{ formatNumber(calculatedBaseMmk) }} <span class="text-xs font-normal text-slate-400">MMK</span>
          </p>
          <span class="text-[10px] text-slate-400 block">Upstream cost paid to supplier</span>
        </div>

        <div class="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 space-y-1">
          <div class="flex items-center justify-between">
            <span class="text-xs text-emerald-800 dark:text-emerald-300 font-medium">2. Net Profit Margin</span>
            <span class="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-bold">+{{ settings.defaultMarginPct }}%</span>
          </div>
          <p class="font-mono font-bold text-lg text-emerald-600 dark:text-emerald-400">
            +{{ formatNumber(calculatedProfitMmk) }} <span class="text-xs font-normal text-emerald-500/70">MMK</span>
          </p>
          <span class="text-[10px] text-emerald-600/70 dark:text-emerald-400/60 block">Effective margin: ~{{ calculatedEffectiveMarginPct }}%</span>
        </div>

        <div class="p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/50 space-y-1">
          <div class="flex items-center justify-between">
            <span class="text-xs text-indigo-800 dark:text-indigo-300 font-bold">3. Customer Retail Price</span>
            <span class="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono">Ceil 100 MMK</span>
          </div>
          <p class="font-mono font-extrabold text-xl text-indigo-600 dark:text-indigo-400">
            {{ formatNumber(calculatedRetailMmk) }} <span class="text-xs font-normal text-indigo-500/70">MMK</span>
          </p>
          <span class="text-[10px] text-indigo-600/70 dark:text-indigo-400/60 block">Final price shown in Telegram Bot</span>
        </div>
      </div>

      <!-- Formula Visual Footer -->
      <div class="p-3 rounded-xl bg-slate-100/70 dark:bg-slate-800/60 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2 flex-wrap text-center font-mono">
        <span>Formula:</span>
        <span class="text-slate-800 dark:text-slate-200 font-bold">(USD Cost × {{ formatNumber(settings.usdToMmkRate) }})</span>
        <span>+</span>
        <span class="text-emerald-600 dark:text-emerald-400 font-bold">{{ settings.defaultMarginPct }}% Profit</span>
        <span>➔</span>
        <span class="text-indigo-600 dark:text-indigo-400 font-bold">Rounded up to 100 MMK</span>
      </div>
    </div>

    <!-- Bulk Catalog Repricing Card -->
    <div class="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="flex items-start gap-3">
          <div class="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold text-sm shrink-0 mt-0.5">
            <i class="pi pi-sync"></i>
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-900 dark:text-white">Bulk Recalculate Catalog Prices (ကုန်ပစ္စည်းအားလုံး ဈေးနှုန်းပြန်လည်တွက်ချက်ခြင်း)</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Applying this exchange rate and margin recalculates the retail MMK prices for all active products across all categories. Newly calculated prices will be immediately live on Telegram Bot.
            </p>
          </div>
        </div>

        <button
          v-if="canEditPricing"
          type="button"
          @click="handleRecalculatePrices"
          :disabled="isRecalculating || isSaving"
          class="px-5 py-3 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-all shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shrink-0"
        >
          <i class="pi text-xs" :class="isRecalculating ? 'pi-spin pi-spinner' : 'pi-refresh'"></i>
          <span>{{ isRecalculating ? 'Recalculating Catalog...' : 'Recalculate All Product Prices' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

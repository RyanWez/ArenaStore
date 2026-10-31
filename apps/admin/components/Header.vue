<script setup lang="ts">
import { useRoute } from 'vue-router'
import { computed } from 'vue'
import { useSidebar } from '~/composables/useSidebar'
import { useTheme } from '~/composables/useTheme'
import { useSupplierStatus } from '~/composables/useSupplierStatus'
import { useStoreSettings } from '~/composables/useStoreSettings'
import { useToast } from '~/composables/useToast'
import { useAdminEvents } from '~/composables/useAdminEvents'

const route = useRoute()
const { isCollapsed, toggleCollapse, toggleMobile } = useSidebar()
const { isDark, toggleTheme } = useTheme()
const { isConnected: isLiveEventsConnected, isPaused: isLiveEventsPaused } = useAdminEvents()
const { xproBalanceUsd, digitalcoreBalanceUsd, aivaulthubBalanceUsd, isXProOnline, isDigitalcoreOnline, isAivaulthubOnline, isSyncing, syncCatalog, fetchStatus } = useSupplierStatus()
const { settings: storeSettings, fetchSettings: fetchStoreSettings } = useStoreSettings()
const toast = useToast()

const formattedExchangeRate = computed(() => {
  return new Intl.NumberFormat('en-US').format(storeSettings.value.usdToMmkRate || 4500)
})

const pageTitle = computed(() => {
  if (route.path.startsWith('/customers')) {
    return 'Customer Wallets'
  }
  switch (route.path) {
    case '/supplier':
      return 'Partner Suppliers'
    case '/products':
      return 'Products'
    case '/orders':
      return 'All Orders'
    case '/payments':
      return 'Payment Slips'
    case '/rates':
      return 'Rates & Margins'
    case '/settings':
      return 'Store Settings'
    default:
      return 'Overview'
  }
})

onMounted(() => {
  fetchStatus()
  fetchStoreSettings()
})

async function handleQuickSync() {
  try {
    await syncCatalog('ALL')
    toast.success('All suppliers catalogs synced successfully!', 'Sync Complete')
  } catch (err: any) {
    toast.error(`Sync error: ${err.message}`, 'Sync Failed')
  }
}
</script>

<template>
  <header class="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-[#0b1220]/80 backdrop-blur-md sticky top-0 z-20 px-4 lg:px-6 flex items-center justify-between transition-colors">
    <!-- Left: Mobile Toggle, Desktop Collapse Toggle & Breadcrumb -->
    <div class="flex items-center gap-2 sm:gap-3">
      <!-- Mobile hamburger toggle -->
      <button
        type="button"
        @click="toggleMobile"
        class="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        aria-label="Toggle Navigation"
      >
        <i class="pi pi-bars text-lg"></i>
      </button>

      <!-- Desktop collapse/expand toggle button in Header -->
      <button
        type="button"
        @click="toggleCollapse"
        class="hidden lg:flex items-center justify-center p-2 rounded-xl text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-transparent hover:border-slate-200 dark:hover:border-slate-700/60 transition-all duration-200"
        :title="isCollapsed ? 'Sidebar အကျဉ်းမှ အကျယ်သို့ ချဲ့ရန် (Expand)' : 'Sidebar ကို အကျဉ်းသို့ ခေါက်သိမ်းရန် (Collapse)'"
        aria-label="Toggle Sidebar"
      >
        <svg class="w-4 h-4 transition-transform duration-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="M9 3v18" />
          <path v-if="isCollapsed" d="m13 9 3 3-3 3" />
          <path v-else d="m16 15-3-3 3-3" />
        </svg>
      </button>

      <!-- Breadcrumbs navigation -->
      <nav class="hidden sm:flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400" aria-label="Breadcrumb">
        <NuxtLink to="/" class="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors font-medium">
          Store Admin
        </NuxtLink>
        <i class="pi pi-chevron-right text-[10px] text-slate-400"></i>
        <span class="font-semibold text-slate-800 dark:text-slate-200">{{ pageTitle }}</span>
      </nav>
    </div>

    <!-- Right: Status Widgets & Controls -->
    <div class="flex items-center gap-2 sm:gap-3">
      <!-- Exchange Rate Tag -->
      <div class="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60">
        <i class="pi pi-dollar text-[11px] text-amber-500"></i>
        <span>1 USD = {{ formattedExchangeRate }} MMK</span>
      </div>

      <!-- Real-Time SSE Stream Status Badge -->
      <div
        class="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors select-none"
        :class="isLiveEventsConnected 
          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' 
          : isLiveEventsPaused
          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
          : 'bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20'"
        :title="isLiveEventsConnected 
          ? 'Real-time Event Stream Active (Zero-Polling)' 
          : isLiveEventsPaused
          ? 'Stream paused to save compute (tab hidden or idle) — resumes instantly on activity'
          : 'Reconnecting real-time stream...'"
      >
        <span class="relative flex h-2 w-2">
          <span
            v-if="isLiveEventsConnected"
            class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"
          ></span>
          <span
            class="relative inline-flex rounded-full h-2 w-2"
            :class="isLiveEventsConnected ? 'bg-emerald-500' : isLiveEventsPaused ? 'bg-amber-500' : 'bg-slate-400'"
          ></span>
        </span>
        <span class="text-[11px] font-semibold">{{ isLiveEventsConnected ? 'Live' : isLiveEventsPaused ? 'Paused' : 'Offline' }}</span>
      </div>

      <!-- Upstream Suppliers Balances Widget -->
      <div class="flex items-center gap-1.5 sm:gap-2">
        <!-- XPro Balance -->
        <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20" title="XPro Supplier Balance">
          <span class="w-2 h-2 rounded-full" :class="isXProOnline ? 'bg-emerald-500' : 'bg-red-500'"></span>
          <span class="font-mono font-semibold">XPro: ${{ xproBalanceUsd }}</span>
        </div>

        <!-- DigitalCore Balance -->
        <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-500/20" title="DigitalCore Supplier Balance">
          <span class="w-2 h-2 rounded-full" :class="isDigitalcoreOnline ? 'bg-cyan-500' : 'bg-red-500'"></span>
          <span class="font-mono font-semibold">DigitalCore: ${{ digitalcoreBalanceUsd }}</span>
        </div>

        <!-- AIVault Hub Balance -->
        <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20" title="AIVault Hub Supplier Balance">
          <span class="w-2 h-2 rounded-full" :class="isAivaulthubOnline ? 'bg-emerald-500' : 'bg-red-500'"></span>
          <span class="font-mono font-semibold">AIVault: ${{ aivaulthubBalanceUsd }}</span>
        </div>

        <!-- Quick Sync Button -->
        <button
          type="button"
          @click="handleQuickSync"
          :disabled="isSyncing"
          title="Sync upstream catalogs now"
          class="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
        >
          <i class="pi pi-sync text-[12px]" :class="{ 'animate-spin': isSyncing }"></i>
        </button>
      </div>

      <!-- Dark / Light Mode Switch -->
      <button
        type="button"
        @click="toggleTheme"
        class="w-9 h-9 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-slate-200 dark:border-slate-800 transition-colors"
        :title="isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
      >
        <i :class="isDark ? 'pi pi-sun text-amber-400' : 'pi pi-moon text-indigo-500'"></i>
      </button>

      <!-- Notification Bell -->
      <button
        type="button"
        class="w-9 h-9 rounded-xl relative flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-slate-200 dark:border-slate-800 transition-colors"
        title="Notifications"
      >
        <i class="pi pi-bell text-sm"></i>
        <span class="absolute top-2 right-2 w-2 h-2 rounded-full bg-indigo-500"></span>
      </button>
    </div>
  </header>
</template>

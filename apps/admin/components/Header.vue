<script setup lang="ts">
import { useTheme } from '~/composables/useTheme'
import { useSupplierStatus } from '~/composables/useSupplierStatus'
import { useToast } from '~/composables/useToast'

const emit = defineEmits(['toggleMobileSidebar'])

const { isDark, toggleTheme } = useTheme()
const { supplierBalanceUsd, isOnline, isSyncing, syncCatalog, fetchStatus } = useSupplierStatus()
const toast = useToast()

onMounted(() => {
  fetchStatus()
})

async function handleQuickSync() {
  try {
    await syncCatalog()
    toast.success('XPro Supplier catalog synced successfully!', 'Sync Complete')
  } catch (err: any) {
    toast.error(`Sync error: ${err.message}`, 'Sync Failed')
  }
}
</script>

<template>
  <header class="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-[#0b1220]/80 backdrop-blur-md sticky top-0 z-20 px-4 lg:px-6 flex items-center justify-between transition-colors">
    <!-- Left: Mobile Hamburger & Page Title / Breadcrumb -->
    <div class="flex items-center gap-3">
      <button
        type="button"
        @click="emit('toggleMobileSidebar')"
        class="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        aria-label="Toggle Navigation"
      >
        <i class="pi pi-bars text-lg"></i>
      </button>

      <div class="hidden sm:flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span>Store Admin</span>
        <i class="pi pi-chevron-right text-[10px]"></i>
        <span class="font-medium text-slate-800 dark:text-slate-200">Management Panel</span>
      </div>
    </div>

    <!-- Right: Status Widgets & Controls -->
    <div class="flex items-center gap-2 sm:gap-3">
      <!-- Exchange Rate Tag -->
      <div class="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60">
        <i class="pi pi-dollar text-[11px] text-amber-500"></i>
        <span>1 USD = 4,500 MMK</span>
      </div>

      <!-- Upstream XPro Balance Widget -->
      <div class="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
        <span class="w-2 h-2 rounded-full" :class="isOnline ? 'bg-emerald-500' : 'bg-red-500'"></span>
        <span class="font-mono font-semibold">XPro: ${{ supplierBalanceUsd }}</span>
        <button
          type="button"
          @click="handleQuickSync"
          :disabled="isSyncing"
          title="Sync upstream catalog now"
          class="hover:opacity-75 disabled:opacity-50 ml-0.5"
        >
          <i class="pi pi-sync text-[11px]" :class="{ 'animate-spin': isSyncing }"></i>
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

<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  onItemClick?: () => void
}>()

// Group expansion states
const expandedGroups = ref({
  main: true,
  store: true,
  orders: true,
  settings: true,
})

function toggleGroup(key: keyof typeof expandedGroups.value) {
  expandedGroups.value[key] = !expandedGroups.value[key]
}

const emit = defineEmits(['close'])

function handleNav() {
  if (props.onItemClick) {
    props.onItemClick()
  }
}
</script>

<template>
  <aside class="h-full flex flex-col bg-[#0b1220] text-slate-200 border-r border-slate-800/80 select-none">
    <!-- Brand Header -->
    <div class="h-16 flex items-center justify-between px-5 border-b border-slate-800/80">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white">
          <i class="pi pi-bolt text-lg"></i>
        </div>
        <div>
          <span class="font-bold text-base tracking-tight text-white block">Arena Store</span>
          <span class="text-[11px] text-slate-400 font-mono tracking-wider uppercase">Admin Portal</span>
        </div>
      </div>
      <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
        v1.0
      </span>
    </div>

    <!-- Navigation Scroll Area -->
    <nav class="flex-1 overflow-y-auto px-3 py-4 space-y-5">
      <!-- Group 1: MAIN -->
      <div>
        <button
          type="button"
          @click="toggleGroup('main')"
          class="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 uppercase tracking-wider transition-colors"
        >
          <span>Main Menu</span>
          <i
            class="pi pi-chevron-down text-[10px] transition-transform duration-200"
            :class="{ '-rotate-90': !expandedGroups.main }"
          ></i>
        </button>

        <div v-show="expandedGroups.main" class="mt-1 space-y-1">
          <NuxtLink
            to="/"
            @click="handleNav"
            class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            active-class="bg-indigo-600/20 !text-indigo-400 font-medium border-l-2 border-indigo-500 rounded-l-none"
          >
            <i class="pi pi-th-large text-base"></i>
            <span>Overview</span>
          </NuxtLink>

          <NuxtLink
            to="/supplier"
            @click="handleNav"
            class="flex items-center justify-between px-3 py-2 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            active-class="bg-indigo-600/20 !text-indigo-400 font-medium border-l-2 border-indigo-500 rounded-l-none"
          >
            <div class="flex items-center gap-3">
              <i class="pi pi-cloud text-base"></i>
              <span>XPro Supplier</span>
            </div>
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          </NuxtLink>
        </div>
      </div>

      <!-- Group 2: STORE MANAGEMENT -->
      <div>
        <button
          type="button"
          @click="toggleGroup('store')"
          class="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 uppercase tracking-wider transition-colors"
        >
          <span>Store Management</span>
          <i
            class="pi pi-chevron-down text-[10px] transition-transform duration-200"
            :class="{ '-rotate-90': !expandedGroups.store }"
          ></i>
        </button>

        <div v-show="expandedGroups.store" class="mt-1 space-y-1">
          <NuxtLink
            to="/products"
            @click="handleNav"
            class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            active-class="bg-indigo-600/20 !text-indigo-400 font-medium border-l-2 border-indigo-500 rounded-l-none"
          >
            <i class="pi pi-box text-base"></i>
            <span>Products</span>
          </NuxtLink>

          <NuxtLink
            to="/categories"
            @click="handleNav"
            class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            active-class="bg-indigo-600/20 !text-indigo-400 font-medium border-l-2 border-indigo-500 rounded-l-none"
          >
            <i class="pi pi-tags text-base"></i>
            <span>Categories</span>
          </NuxtLink>
        </div>
      </div>

      <!-- Group 3: ORDERS & PAYMENTS -->
      <div>
        <button
          type="button"
          @click="toggleGroup('orders')"
          class="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 uppercase tracking-wider transition-colors"
        >
          <span>Orders & Payments</span>
          <i
            class="pi pi-chevron-down text-[10px] transition-transform duration-200"
            :class="{ '-rotate-90': !expandedGroups.orders }"
          ></i>
        </button>

        <div v-show="expandedGroups.orders" class="mt-1 space-y-1">
          <NuxtLink
            to="/orders"
            @click="handleNav"
            class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            active-class="bg-indigo-600/20 !text-indigo-400 font-medium border-l-2 border-indigo-500 rounded-l-none"
          >
            <i class="pi pi-shopping-bag text-base"></i>
            <span>All Orders</span>
          </NuxtLink>

          <NuxtLink
            to="/payments"
            @click="handleNav"
            class="flex items-center justify-between px-3 py-2 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            active-class="bg-indigo-600/20 !text-indigo-400 font-medium border-l-2 border-indigo-500 rounded-l-none"
          >
            <div class="flex items-center gap-3">
              <i class="pi pi-receipt text-base"></i>
              <span>Payment Slips</span>
            </div>
            <span class="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Review
            </span>
          </NuxtLink>
        </div>
      </div>

      <!-- Group 4: SETTINGS -->
      <div>
        <button
          type="button"
          @click="toggleGroup('settings')"
          class="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 uppercase tracking-wider transition-colors"
        >
          <span>Configuration</span>
          <i
            class="pi pi-chevron-down text-[10px] transition-transform duration-200"
            :class="{ '-rotate-90': !expandedGroups.settings }"
          ></i>
        </button>

        <div v-show="expandedGroups.settings" class="mt-1 space-y-1">
          <NuxtLink
            to="/settings"
            @click="handleNav"
            class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            active-class="bg-indigo-600/20 !text-indigo-400 font-medium border-l-2 border-indigo-500 rounded-l-none"
          >
            <i class="pi pi-sliders-h text-base"></i>
            <span>Rates & Margins</span>
          </NuxtLink>
        </div>
      </div>
    </nav>

    <!-- User Profile Footer -->
    <div class="p-3 border-t border-slate-800/80 bg-slate-950/40">
      <div class="flex items-center gap-3 p-2 rounded-xl bg-slate-900/60 border border-slate-800/60">
        <div class="w-8 h-8 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-semibold text-xs">
          OP
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-xs font-medium text-white truncate">Arena Admin</p>
          <p class="text-[11px] text-slate-400 truncate">admin@arenastore.mm</p>
        </div>
        <div class="w-2 h-2 rounded-full bg-emerald-500"></div>
      </div>
    </div>
  </aside>
</template>

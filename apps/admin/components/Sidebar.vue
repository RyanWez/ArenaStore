<script setup lang="ts">
import { ref } from 'vue'
import { useSidebar } from '~/composables/useSidebar'

const props = defineProps<{
  isMobile?: boolean
  onItemClick?: () => void
}>()

const { isCollapsed, toggleCollapse } = useSidebar()

// Group expansion states for accordion in expanded mode
const expandedGroups = ref({
  main: true,
  store: true,
  orders: true,
  settings: true,
})

function toggleGroup(key: keyof typeof expandedGroups.value) {
  expandedGroups.value[key] = !expandedGroups.value[key]
}

function handleNav() {
  if (props.onItemClick) {
    props.onItemClick()
  }
}

type NavBadge =
  | { type: 'pulse'; color: 'emerald' | 'amber' | 'indigo' }
  | { type: 'pill'; text: string; color: 'emerald' | 'amber' | 'indigo' }

interface NavItem {
  to: string
  label: string
  icon: string
  badge: NavBadge | null
}

interface NavGroup {
  key: 'main' | 'store' | 'orders' | 'settings'
  label: string
  items: NavItem[]
}

// Nav items definition
const navGroups: NavGroup[] = [
  {
    key: 'main' as const,
    label: 'Main Menu',
    items: [
      {
        to: '/',
        label: 'Overview',
        icon: 'pi pi-th-large',
        badge: null,
      },
      {
        to: '/supplier',
        label: 'XPro Supplier',
        icon: 'pi pi-cloud',
        badge: { type: 'pulse', color: 'emerald' },
      },
    ],
  },
  {
    key: 'store' as const,
    label: 'Store Management',
    items: [
      {
        to: '/products',
        label: 'Products',
        icon: 'pi pi-box',
        badge: null,
      },
      {
        to: '/categories',
        label: 'Categories',
        icon: 'pi pi-tags',
        badge: null,
      },
    ],
  },
  {
    key: 'orders' as const,
    label: 'Orders & Payments',
    items: [
      {
        to: '/orders',
        label: 'All Orders',
        icon: 'pi pi-shopping-bag',
        badge: null,
      },
      {
        to: '/payments',
        label: 'Payment Slips',
        icon: 'pi pi-receipt',
        badge: { type: 'pill', text: 'Review', color: 'amber' },
      },
    ],
  },
  {
    key: 'settings' as const,
    label: 'Configuration',
    items: [
      {
        to: '/settings',
        label: 'Rates & Margins',
        icon: 'pi pi-sliders-h',
        badge: null,
      },
    ],
  },
]
</script>

<template>
  <aside
    class="h-full flex flex-col bg-[#0b1220] text-slate-200 border-r border-slate-800/80 select-none transition-all duration-300 ease-in-out"
    :class="[
      isCollapsed && !isMobile ? 'w-20 overflow-visible' : 'w-64 overflow-hidden',
    ]"
  >
    <!-- Brand Header -->
    <div
      class="h-16 flex items-center border-b border-slate-800/80 transition-all duration-300 shrink-0"
      :class="isCollapsed && !isMobile ? 'justify-center px-2 overflow-visible' : 'justify-between px-4'"
    >
      <!-- Logo + Title (Expanded) -->
      <div
        v-if="!isCollapsed || isMobile"
        class="flex items-center gap-3 min-w-0 transition-opacity duration-200"
      >
        <div class="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/25 text-white">
          <i class="pi pi-bolt text-lg"></i>
        </div>
        <div class="truncate">
          <span class="font-bold text-sm tracking-tight text-white block truncate">Arena Store</span>
          <span class="text-[10px] text-slate-400 font-mono tracking-wider uppercase block">Admin Portal</span>
        </div>
      </div>

      <!-- Action Button (Expanded: Collapse Toggle / Mobile: Close X) -->
      <div v-if="!isCollapsed || isMobile" class="flex items-center gap-1.5 shrink-0">
        <span class="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
          v1.0
        </span>
        <!-- Mobile close button -->
        <button
          v-if="isMobile"
          type="button"
          @click="onItemClick"
          class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
          title="Close drawer"
        >
          <i class="pi pi-times text-base"></i>
        </button>
        <!-- Desktop collapse button -->
        <button
          v-else
          type="button"
          @click="toggleCollapse"
          class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-all duration-150"
          title="Collapse Sidebar"
          aria-label="Collapse Sidebar"
        >
          <!-- Panel sidebar collapse icon (matching PrimeVue) -->
          <svg class="w-4 h-4 text-slate-400 hover:text-slate-200 transition-transform duration-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M9 3v18" />
            <path d="m16 15-3-3 3-3" />
          </svg>
        </button>
      </div>

      <!-- Collapsed Brand / Expand Icon (Collapsed Mode) -->
      <div
        v-else
        class="relative flex flex-col items-center justify-center w-full"
      >
        <button
          type="button"
          @click="toggleCollapse"
          class="group relative w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white hover:scale-105 active:scale-95 transition-all duration-200"
          aria-label="Expand Sidebar"
        >
          <i class="pi pi-bolt text-lg group-hover:hidden transition-all"></i>
          <!-- Hover shows expand icon -->
          <svg class="w-5 h-5 hidden group-hover:block transition-all" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M9 3v18" />
            <path d="m13 9 3 3-3 3" />
          </svg>

          <!-- Floating Tooltip on Hover for Expand Button -->
          <div
            class="absolute left-full top-1/2 -translate-y-1/2 ml-3.5 px-3 py-1.5 bg-slate-900/95 backdrop-blur-sm text-white text-xs font-medium rounded-xl shadow-2xl border border-slate-700/80 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 flex items-center gap-1.5"
          >
            <span class="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-slate-900 border-l border-b border-slate-700/80 rotate-45"></span>
            <span class="relative z-10">Expand Sidebar</span>
          </div>
        </button>
      </div>
    </div>

    <!-- Navigation Area -->
    <nav
      class="flex-1 px-2.5 py-3 space-y-4"
      :class="[
        isCollapsed && !isMobile ? 'overflow-visible' : 'overflow-y-auto overflow-x-hidden',
      ]"
    >
      <div v-for="(group, gIdx) in navGroups" :key="group.key">
        <!-- Expanded Mode: Accordion Header with Label -->
        <button
          v-if="!isCollapsed || isMobile"
          type="button"
          @click="toggleGroup(group.key)"
          class="w-full flex items-center justify-between px-2.5 py-1 text-[11px] font-semibold text-slate-400 hover:text-slate-200 uppercase tracking-wider transition-colors"
        >
          <span class="truncate">{{ group.label }}</span>
          <i
            class="pi pi-chevron-down text-[9px] transition-transform duration-200 shrink-0"
            :class="{ '-rotate-90': !expandedGroups[group.key] }"
          ></i>
        </button>

        <!-- Collapsed Mode: Subtle divider between groups -->
        <div
          v-else-if="gIdx > 0"
          class="h-px bg-slate-800/80 mx-2 my-2.5"
        ></div>

        <!-- Links List -->
        <div
          v-show="isCollapsed && !isMobile ? true : expandedGroups[group.key]"
          class="mt-1 space-y-1"
        >
          <NuxtLink
            v-for="item in group.items"
            :key="item.to"
            :to="item.to"
            @click="handleNav"
            class="group relative flex items-center rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/60 transition-all duration-200"
            :class="[
              isCollapsed && !isMobile
                ? 'justify-center p-2.5 mx-auto w-11 h-11'
                : 'gap-3 px-3 py-2 text-sm',
            ]"
            active-class="bg-indigo-600/20 !text-indigo-400 font-medium border-l-2 border-indigo-500 rounded-l-none"
          >
            <!-- Icon -->
            <div class="relative shrink-0 flex items-center justify-center">
              <i :class="[item.icon, isCollapsed && !isMobile ? 'text-lg' : 'text-base']"></i>

              <!-- Small badge dot in Collapsed Mode -->
              <span
                v-if="isCollapsed && !isMobile && item.badge"
                class="absolute -top-1 -right-1 w-2 h-2 rounded-full ring-2 ring-[#0b1220]"
                :class="[
                  item.badge.color === 'emerald' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400',
                ]"
              ></span>
            </div>

            <!-- Label in Expanded Mode -->
            <span
              v-if="!isCollapsed || isMobile"
              class="flex-1 truncate text-sm transition-opacity duration-200"
            >
              {{ item.label }}
            </span>

            <!-- Badges in Expanded Mode -->
            <template v-if="(!isCollapsed || isMobile) && item.badge">
              <span
                v-if="item.badge.type === 'pulse'"
                class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"
              ></span>
              <span
                v-else-if="item.badge.type === 'pill' && 'text' in item.badge"
                class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0"
              >
                {{ item.badge.text }}
              </span>
            </template>

            <!-- Floating Tooltip on Hover for Collapsed Mode (Accurately Vertically Centered on the Right) -->
            <div
              v-if="isCollapsed && !isMobile"
              class="absolute left-full top-1/2 -translate-y-1/2 ml-3.5 px-3 py-1.5 bg-slate-900/95 backdrop-blur-sm text-white text-xs font-medium rounded-xl shadow-2xl border border-slate-700/80 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 translate-x-1 group-hover:translate-x-0 z-50 flex items-center gap-2"
            >
              <!-- Left Caret/Arrow pointing to the icon center -->
              <span class="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-slate-900 border-l border-b border-slate-700/80 rotate-45"></span>

              <span class="relative z-10">{{ item.label }}</span>
              <span
                v-if="item.badge?.type === 'pill' && 'text' in item.badge"
                class="relative z-10 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30"
              >
                {{ item.badge.text }}
              </span>
              <span
                v-else-if="item.badge?.type === 'pulse'"
                class="relative z-10 w-2 h-2 rounded-full bg-emerald-400 animate-pulse"
              ></span>
            </div>
          </NuxtLink>
        </div>
      </div>
    </nav>

    <!-- User Profile Footer -->
    <div
      class="border-t border-slate-800/80 bg-slate-950/40 transition-all duration-300 shrink-0"
      :class="isCollapsed && !isMobile ? 'p-2 flex justify-center overflow-visible' : 'p-3'"
    >
      <!-- Collapsed Footer: Avatar Only with Vertically Centered Tooltip -->
      <div
        v-if="isCollapsed && !isMobile"
        class="group relative flex items-center justify-center"
      >
        <div class="relative w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-semibold text-xs cursor-pointer hover:bg-indigo-600/30 transition-colors">
          OP
          <span class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-[#0b1220]"></span>
        </div>

        <!-- Tooltip -->
        <div class="absolute left-full top-1/2 -translate-y-1/2 ml-3.5 px-3 py-2 bg-slate-900/95 backdrop-blur-sm text-white text-xs rounded-xl shadow-2xl border border-slate-700/80 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 translate-x-1 group-hover:translate-x-0 z-50">
          <span class="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-slate-900 border-l border-b border-slate-700/80 rotate-45"></span>
          <p class="font-medium text-white relative z-10">Arena Admin</p>
          <p class="text-[10px] text-slate-400 relative z-10">admin@arenastore.mm</p>
        </div>
      </div>

      <!-- Expanded Footer: Full Profile Card -->
      <div
        v-else
        class="flex items-center gap-3 p-2 rounded-xl bg-slate-900/60 border border-slate-800/60"
      >
        <div class="w-8 h-8 shrink-0 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-semibold text-xs">
          OP
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-xs font-medium text-white truncate">Arena Admin</p>
          <p class="text-[11px] text-slate-400 truncate">admin@arenastore.mm</p>
        </div>
        <div class="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSidebar } from '~/composables/useSidebar'
import { useAuth } from '~/composables/useAuth'
import { usePermission } from '~/composables/usePermission'

const { user, logout } = useAuth()
const { can } = usePermission()

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
  administration: true,
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
  permission: string
}

interface NavGroup {
  key: 'main' | 'store' | 'orders' | 'settings' | 'administration'
  label: string
  items: NavItem[]
}

// Nav items definition — every item carries the permission that gates it;
// items/groups the role lacks are filtered out below.
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
        permission: 'overview.view',
      },
      {
        to: '/analytics',
        label: 'Analytics & Profit',
        icon: 'pi pi-chart-line',
        badge: { type: 'pill', text: 'PROFIT', color: 'emerald' },
        permission: 'analytics.view',
      },
      {
        to: '/supplier',
        label: 'XPro Supplier',
        icon: 'pi pi-cloud',
        badge: { type: 'pulse', color: 'emerald' },
        permission: 'supplier.view',
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
        permission: 'products.view',
      },
    ],
  },
  {
    key: 'orders' as const,
    label: 'Orders & Payments',
    items: [
      {
        to: '/orders',
        label: 'Product Orders',
        icon: 'pi pi-shopping-bag',
        badge: null,
        permission: 'orders.view',
      },
      {
        to: '/payments',
        label: 'Deposit Slips',
        icon: 'pi pi-wallet',
        badge: { type: 'pill', text: 'Review', color: 'amber' },
        permission: 'payments.view',
      },
      {
        to: '/customers',
        label: 'Customer Wallets',
        icon: 'pi pi-users',
        badge: null,
        permission: 'customers.view',
      },
    ],
  },
  {
    key: 'settings' as const,
    label: 'Configuration',
    items: [
      {
        to: '/rates',
        label: 'Rates & Margins',
        icon: 'pi pi-percentage',
        badge: null,
        permission: 'settings.pricing',
      },
      {
        to: '/settings',
        label: 'Store Settings',
        icon: 'pi pi-cog',
        badge: null,
        permission: 'settings.view',
      },
    ],
  },
  {
    key: 'administration' as const,
    label: 'User Management',
    items: [
      {
        to: '/users',
        label: 'Role Users',
        icon: 'pi pi-user-plus',
        badge: null,
        permission: 'users.manage',
      },
      {
        to: '/roles',
        label: 'Roles & Permissions',
        icon: 'pi pi-shield',
        badge: null,
        permission: 'roles.manage',
      },
      {
        to: '/audit',
        label: 'Audit Log',
        icon: 'pi pi-history',
        badge: null,
        permission: 'audit.view',
      },
    ],
  },
]

// Hide items the signed-in role cannot view, then drop empty groups.
const visibleNavGroups = computed<NavGroup[]>(() =>
  navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => can(item.permission)) }))
    .filter((group) => group.items.length > 0)
)
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
      :class="isCollapsed && !isMobile ? 'px-3 justify-center overflow-visible' : 'px-4 justify-between'"
    >
      <!-- Logo + Brand Text -->
      <div class="flex items-center min-w-0 flex-1">
        <button
          type="button"
          @click="isCollapsed && !isMobile ? toggleCollapse() : null"
          class="w-9 h-9 shrink-0 rounded-xl bg-slate-800/90 border border-slate-700/60 p-1 flex items-center justify-center shadow-lg shadow-black/30 transition-all hover:scale-105 active:scale-95 group overflow-hidden"
          :class="isCollapsed && !isMobile ? 'cursor-pointer' : 'cursor-default'"
          :title="isCollapsed && !isMobile ? 'Expand Sidebar' : undefined"
          aria-label="Arena Store Brand Logo"
        >
          <img
            src="/logo.png"
            alt="Arena Store Logo"
            class="w-full h-full object-contain drop-shadow transition-transform duration-300 group-hover:scale-110"
          />
        </button>

        <!-- Brand Title (Smooth max-w & opacity transition) -->
        <div
          class="transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap min-w-0"
          :class="isCollapsed && !isMobile ? 'max-w-0 opacity-0 -translate-x-2 pointer-events-none' : 'max-w-[140px] opacity-100 translate-x-0 ml-3'"
        >
          <span class="font-bold text-sm tracking-tight text-white block truncate">Arena Store</span>
          <span class="text-[10px] text-slate-400 font-mono tracking-wider uppercase block truncate">Admin Portal</span>
        </div>
      </div>

      <!-- Action Button (Toggle / Mobile X) -->
      <div
        class="transition-all duration-300 ease-in-out shrink-0 flex items-center gap-1.5"
        :class="isCollapsed && !isMobile ? 'max-w-0 opacity-0 pointer-events-none' : 'max-w-[80px] opacity-100'"
      >
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
    </div>

    <!-- Navigation Area -->
    <nav
      class="flex-1 px-2.5 py-3 space-y-3"
      :class="[
        isCollapsed && !isMobile ? 'overflow-visible' : 'overflow-y-auto overflow-x-hidden',
      ]"
    >
      <div v-for="(group, gIdx) in visibleNavGroups" :key="group.key">
        <!-- Accordion Header with Label (Smooth Collapse) -->
        <div
          class="transition-all duration-300 ease-in-out overflow-hidden"
          :class="isCollapsed && !isMobile ? 'max-h-0 opacity-0 mb-0' : 'max-h-8 opacity-100 mb-1'"
        >
          <button
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
        </div>

        <!-- Subtle divider between groups when in Collapsed Mode -->
        <div
          v-if="gIdx > 0"
          class="h-px bg-slate-800/80 mx-2 transition-all duration-300"
          :class="isCollapsed && !isMobile ? 'my-2.5 opacity-100' : 'my-0 h-0 opacity-0 overflow-hidden'"
        ></div>

        <!-- Links List -->
        <div
          v-show="isCollapsed && !isMobile ? true : expandedGroups[group.key]"
          class="space-y-1"
        >
          <NuxtLink
            v-for="item in group.items"
            :key="item.to"
            :to="item.to"
            @click="handleNav"
            class="group relative flex items-center rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/60 transition-all duration-300 ease-in-out"
            :class="[
              isCollapsed && !isMobile
                ? 'justify-center p-2.5 mx-auto w-11 h-11'
                : 'px-3 py-2 text-sm w-full',
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

            <!-- Label in Expanded Mode (Smooth width & slide-out) -->
            <span
              class="truncate text-sm transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap"
              :class="isCollapsed && !isMobile ? 'max-w-0 opacity-0 -translate-x-2 pointer-events-none ml-0' : 'max-w-[150px] opacity-100 translate-x-0 ml-3'"
            >
              {{ item.label }}
            </span>

            <!-- Badges in Expanded Mode -->
            <div
              class="transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap ml-auto shrink-0 flex items-center"
              :class="isCollapsed && !isMobile ? 'max-w-0 opacity-0 pointer-events-none' : 'max-w-[80px] opacity-100'"
            >
              <template v-if="item.badge">
                <span
                  v-if="item.badge.type === 'pulse'"
                  class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"
                ></span>
                <span
                  v-else-if="item.badge.type === 'pill' && 'text' in item.badge"
                  class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30"
                >
                  {{ item.badge.text }}
                </span>
              </template>
            </div>

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
      <div class="group relative flex items-center w-full p-2 rounded-xl bg-slate-900/60 border border-slate-800/60 transition-all duration-300">
        <!-- Avatar -->
        <div class="relative w-8 h-8 shrink-0 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-semibold text-xs">
          {{ user?.firstName ? user.firstName.slice(0, 2).toUpperCase() : 'AD' }}
          <span
            v-if="isCollapsed && !isMobile"
            class="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-[#0b1220]"
          ></span>
        </div>

        <!-- Details (Smooth slide & fade) -->
        <div
          class="transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap min-w-0 flex-1"
          :class="isCollapsed && !isMobile ? 'max-w-0 opacity-0 pointer-events-none ml-0' : 'max-w-[130px] opacity-100 ml-3'"
        >
          <p class="text-xs font-medium text-white truncate">{{ user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Arena Admin' }}</p>
          <p class="text-[10px] text-slate-400 truncate">{{ user?.email || 'admin@arenastore.mm' }}</p>
        </div>

        <!-- Logout Button -->
        <div
          class="transition-all duration-300 ease-in-out shrink-0"
          :class="isCollapsed && !isMobile ? 'max-w-0 opacity-0 pointer-events-none' : 'max-w-[28px] opacity-100 ml-auto'"
        >
          <button
            type="button"
            @click="logout()"
            title="Sign out of Admin Portal"
            class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
          >
            <i class="pi pi-sign-out text-xs"></i>
          </button>
        </div>

        <!-- Tooltip for collapsed mode -->
        <div
          v-if="isCollapsed && !isMobile"
          class="absolute left-full top-1/2 -translate-y-1/2 ml-3.5 px-3 py-2 bg-slate-900/95 backdrop-blur-sm text-white text-xs rounded-xl shadow-2xl border border-slate-700/80 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 translate-x-1 group-hover:translate-x-0 z-50 flex items-center gap-3"
        >
          <span class="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-slate-900 border-l border-b border-slate-700/80 rotate-45"></span>
          <div>
            <p class="font-medium text-white relative z-10">{{ user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Arena Admin' }}</p>
            <p class="text-[10px] text-slate-400 relative z-10">{{ user?.email || 'admin@arenastore.mm' }}</p>
          </div>
          <button
            type="button"
            @click="logout()"
            class="pointer-events-auto p-1.5 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 text-[11px] font-semibold"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>

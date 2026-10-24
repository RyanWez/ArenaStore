<script setup lang="ts">
import {
  LayoutDashboard,
  Gamepad2,
  Package,
  Wallet,
  Users,
  Trophy,
  Headphones,
  Settings,
  LogOut,
} from "lucide-vue-next";
import { useStoreAuth } from "~/composables/useStoreAuth";
import { SITE_CONFIG } from "~/config/site";

const emit = defineEmits<{
  (e: "open-topup"): void;
}>();

const { logout } = useStoreAuth();
const route = useRoute();

const navItems = [
  { label: "Dashboard", path: "/profile", icon: LayoutDashboard },
  { label: "Browse Store", path: "/#catalog", icon: Gamepad2 },
  { label: "My Orders", path: "/orders", icon: Package },
  { label: "Top Up", path: "#topup", icon: Wallet, action: "topup" },
  { label: "Referrals", path: "/referral", icon: Users },
  { label: "Rewards", path: "/profile", icon: Trophy },
  { label: "Support", path: SITE_CONFIG.supportContact, icon: Headphones, external: true },
];

const handleNavClick = (item: any) => {
  if (item.action === "topup") {
    emit("open-topup");
  }
};
</script>

<template>
  <aside class="w-64 flex flex-col justify-between border-r border-arena-border/70 bg-[#0B0D12] p-5 shrink-0 select-none">
    <!-- Top Section: Logo & Main Navigation -->
    <div class="space-y-6">
      <!-- Logo + Tagline -->
      <NuxtLink to="/" class="flex items-center space-x-3 group px-2 pt-1">
        <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-black font-black text-sm tracking-tighter shadow-md transition-transform group-hover:scale-105">
          <svg class="h-5 w-5 fill-current" viewBox="0 0 24 24">
            <path d="M12 2L2 22h4.5l2.5-5.5h6l2.5 5.5H22L12 2zm0 5.8l2.1 4.7H9.9L12 7.8z" />
          </svg>
        </div>
        <div>
          <div class="text-base font-extrabold tracking-tight text-white leading-none">
            ARENA STORE
          </div>
          <div class="text-[9px] font-bold uppercase tracking-widest text-arena-muted mt-0.5">
            Play More. Pay Less.
          </div>
        </div>
      </NuxtLink>

      <!-- Main Navigation Links -->
      <nav class="space-y-1">
        <template v-for="item in navItems" :key="item.label">
          <!-- External Support Link -->
          <a
            v-if="item.external"
            :href="item.path"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center space-x-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-arena-muted hover:text-white hover:bg-white/5 transition-colors"
          >
            <component :is="item.icon" class="h-4 w-4" />
            <span>{{ item.label }}</span>
          </a>

          <!-- Top-Up Action -->
          <button
            v-else-if="item.action"
            type="button"
            @click="handleNavClick(item)"
            class="w-full flex items-center space-x-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-arena-muted hover:text-white hover:bg-white/5 transition-colors text-left"
          >
            <component :is="item.icon" class="h-4 w-4" />
            <span>{{ item.label }}</span>
          </button>

          <!-- Standard NuxtLink -->
          <NuxtLink
            v-else
            :to="item.path"
            class="flex items-center space-x-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-all"
            :class="[
              route.path === item.path && item.path !== '/#catalog'
                ? 'bg-arena-orange/15 text-arena-orange border border-arena-orange/20 font-bold shadow-sm'
                : 'text-arena-muted hover:text-white hover:bg-white/5'
            ]"
          >
            <component :is="item.icon" class="h-4 w-4" />
            <span>{{ item.label }}</span>
          </NuxtLink>
        </template>
      </nav>
    </div>

    <!-- Bottom Section: Settings, Logout, Version Watermark -->
    <div class="pt-4 border-t border-arena-border/50 space-y-1">
      <button
        type="button"
        class="w-full flex items-center space-x-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-arena-muted hover:text-white hover:bg-white/5 transition-colors text-left"
      >
        <Settings class="h-4 w-4" />
        <span>Settings</span>
      </button>

      <button
        type="button"
        @click="logout"
        class="w-full flex items-center space-x-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-arena-muted hover:text-red-400 hover:bg-red-500/10 transition-colors text-left"
      >
        <LogOut class="h-4 w-4" />
        <span>Log Out</span>
      </button>

      <div class="px-3.5 pt-3 text-[10px] font-mono text-arena-subtle">
        ARENA STORE v1.0.0
      </div>
    </div>
  </aside>
</template>

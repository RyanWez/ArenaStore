<script setup lang="ts">
import { Wallet, KeyRound, User, Plus, ShoppingBag } from "lucide-vue-next";
import { useStoreAuth } from "~/composables/useStoreAuth";
import { SITE_CONFIG } from "~/config/site";

const { user, balanceMmk, isAuthenticated, formatMmk } = useStoreAuth();

const emit = defineEmits<{
  (e: "open-login"): void;
  (e: "open-topup"): void;
}>();

const handleNavClick = (e: MouseEvent, item: { path: string }) => {
  if (item.path === "/#catalog") {
    e.preventDefault();
    if (typeof document !== "undefined") {
      const el = document.getElementById("catalog");
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
        window.history.pushState(null, "", "/#catalog");
      }
    }
  }
};
</script>

<template>
  <header class="sticky top-0 z-40 w-full border-b border-arena-border bg-arena-bg/95 backdrop-blur-md transition-colors">
    <div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
      <!-- Left: Brand Logo (A icon + Arena Store) matching desktop_storefront.png -->
      <NuxtLink to="/" class="flex items-center space-x-2.5 group select-none">
        <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-black font-black text-sm tracking-tighter shadow-sm">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L2 22h4.5l2.5-5.5h6l2.5 5.5H22L12 2zm0 5.8l2.1 4.7H9.9L12 7.8z" />
          </svg>
        </div>
        <span class="text-base font-extrabold tracking-tight text-white sm:text-lg">Arena Store</span>
      </NuxtLink>

      <!-- Desktop Center Navigation Links -->
      <nav class="hidden lg:flex items-center space-x-7 text-xs font-medium text-arena-muted">
        <NuxtLink
          v-for="item in SITE_CONFIG.headerNav"
          :key="item.label"
          :to="item.path"
          @click="handleNavClick($event, item)"
          class="transition-colors hover:text-white flex items-center space-x-1"
          active-class="text-white font-semibold"
        >
          <span>{{ item.label }}</span>
          <span
            v-if="item.badge"
            class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-arena-orange-subtle text-arena-orange border border-arena-orange/20"
          >
            {{ item.badge }}
          </span>
        </NuxtLink>
      </nav>

      <!-- Right Actions: Cart, Wallet Chip & Auth Button -->
      <div class="flex items-center space-x-3">
        <!-- Cart Bag Icon with Badge (0) -->
        <button
          type="button"
          @click="handleNavClick($event, { path: '/#catalog' })"
          class="relative flex h-8 w-8 items-center justify-center rounded-full text-arena-muted hover:text-white transition-colors"
          title="Shopping Cart"
        >
          <ShoppingBag class="h-4 w-4" />
          <span class="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-arena-orange text-[9px] font-bold text-white leading-none">
            0
          </span>
        </button>

        <!-- Prepaid Wallet Chip -->
        <button
          type="button"
          @click="emit('open-topup')"
          class="flex items-center space-x-1.5 rounded-full border border-arena-border bg-arena-elevated px-2.5 py-1 text-xs transition-colors hover:border-arena-border-strong"
          title="Prepaid MMK Wallet"
        >
          <Wallet class="h-3.5 w-3.5 text-arena-orange" />
          <span class="font-mono font-medium text-arena-text">
            {{ formatMmk(balanceMmk) }}
          </span>
          <span class="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-arena-orange text-[9px] font-bold text-white leading-none">
            <Plus class="h-2.5 w-2.5" />
          </span>
        </button>

        <!-- Authenticated Profile / Login Button -->
        <template v-if="isAuthenticated && user">
          <NuxtLink
            to="/profile"
            class="flex items-center space-x-2 rounded-lg border border-arena-border bg-arena-elevated px-2.5 py-1 text-xs font-medium text-arena-text transition-colors hover:border-arena-border-strong"
          >
            <div class="flex h-5 w-5 items-center justify-center rounded bg-arena-hover text-[10px] font-bold text-arena-orange uppercase">
              {{ user.firstName?.charAt(0) || "U" }}
            </div>
            <span class="hidden sm:inline font-medium text-xs max-w-[90px] truncate">
              {{ user.firstName }}
            </span>
          </NuxtLink>
        </template>
        <template v-else>
          <button
            type="button"
            @click="emit('open-login')"
            class="hidden sm:inline-flex text-xs font-semibold text-arena-muted hover:text-white transition-colors px-2"
          >
            Sign In
          </button>
          <button
            type="button"
            @click="emit('open-login')"
            class="flex items-center space-x-1.5 rounded-full bg-arena-orange px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-arena-orange-hover active:scale-[0.98] shadow-sm tracking-tight"
          >
            <span>Create Account</span>
          </button>
        </template>
      </div>
    </div>
  </header>
</template>

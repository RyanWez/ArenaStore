<script setup lang="ts">
import { Wallet, KeyRound, User, Plus } from "lucide-vue-next";
import { useStoreAuth } from "~/composables/useStoreAuth";
import { SITE_CONFIG } from "~/config/site";

const { user, balanceMmk, isAuthenticated, formatMmk } = useStoreAuth();

const emit = defineEmits<{
  (e: "open-login"): void;
  (e: "open-topup"): void;
}>();
</script>

<template>
  <header class="sticky top-0 z-40 w-full border-b border-arena-border bg-arena-surface/90 backdrop-blur-md transition-colors">
    <div class="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
      <!-- Left: Brand Logo -->
      <NuxtLink to="/" class="flex items-center space-x-2 group">
        <div class="flex items-center">
          <span class="text-base font-extrabold tracking-tight text-white sm:text-lg">ARENA</span>
          <span class="ml-1 text-[10px] font-bold uppercase tracking-widest text-arena-orange px-1.5 py-0.5 rounded bg-arena-orange-subtle border border-arena-orange/20">STORE</span>
        </div>
      </NuxtLink>

      <!-- Desktop Center Navigation Links -->
      <nav class="hidden md:flex items-center space-x-6 text-xs font-medium text-arena-muted">
        <NuxtLink
          v-for="item in SITE_CONFIG.headerNav"
          :key="item.path"
          :to="item.path"
          class="transition-colors hover:text-white flex items-center space-x-1"
          active-class="text-white font-semibold"
        >
          <span>{{ item.label }}</span>
          <span
            v-if="item.badge"
            class="text-[9px] font-bold px-1 py-0.2 rounded bg-arena-orange-subtle text-arena-orange border border-arena-orange/20"
          >
            {{ item.badge }}
          </span>
        </NuxtLink>
      </nav>

      <!-- Right: Wallet Chip & Auth Button -->
      <div class="flex items-center space-x-2.5">
        <!-- Wallet Chip -->
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
          <span class="flex h-4 w-4 items-center justify-center rounded-full bg-arena-orange text-[10px] font-bold text-white leading-none">
            <Plus class="h-2.5 w-2.5" />
          </span>
        </button>

        <!-- Authenticated Profile / Login Button -->
        <template v-if="isAuthenticated && user">
          <NuxtLink
            to="/profile"
            class="flex items-center space-x-2 rounded-lg border border-arena-border bg-arena-elevated px-2 py-1 text-xs font-medium text-arena-text transition-colors hover:border-arena-border-strong"
          >
            <div class="flex h-6 w-6 items-center justify-center rounded bg-arena-hover text-[11px] font-bold text-arena-orange uppercase">
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
            class="flex items-center space-x-1.5 rounded-lg bg-arena-orange px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-arena-orange-hover active:scale-[0.98]"
          >
            <KeyRound class="h-3.5 w-3.5" />
            <span>Login</span>
          </button>
        </template>
      </div>
    </div>
  </header>
</template>

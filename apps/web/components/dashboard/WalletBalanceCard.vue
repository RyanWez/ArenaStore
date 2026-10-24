<script setup lang="ts">
import { computed } from "vue";
import { Wallet, ChevronRight, ArrowUpRight, ArrowDownLeft, Calendar, Plus } from "lucide-vue-next";
import { useStoreAuth } from "~/composables/useStoreAuth";

const emit = defineEmits<{
  (e: "open-topup"): void;
}>();

const { user, balanceMmk, formatMmk } = useStoreAuth();

// Format balance separated into number and currency for bold styling
const formattedBalanceNumber = computed(() => {
  return (balanceMmk.value || 0).toLocaleString("en-US");
});

const formattedSpent = computed(() => {
  return formatMmk(user.value?.totalSpentMmk || 0);
});

const formattedMemberSince = computed(() => {
  if (!user.value?.memberSince) return "Oct 2026";
  try {
    const d = new Date(user.value.memberSince);
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  } catch {
    return "Oct 2026";
  }
});
</script>

<template>
  <div class="relative w-full flex flex-col justify-between overflow-hidden rounded-[26px] border border-arena-border/80 bg-gradient-to-b from-[#141720] via-[#0E1016] to-[#0A0C10] p-6 shadow-xl text-white select-none transition-all duration-300 hover:border-arena-border">
    <!-- Ambient subtle orange glow in top right -->
    <div class="pointer-events-none absolute -top-16 -right-16 h-36 w-36 rounded-full bg-arena-orange/10 blur-3xl" />

    <!-- Top Row: Icon + Title + History Link -->
    <div class="relative z-10 flex items-center justify-between pb-3">
      <div class="flex items-center space-x-2.5">
        <div class="flex h-8 w-8 items-center justify-center rounded-xl bg-arena-orange/10 border border-arena-orange/20 text-arena-orange">
          <Wallet class="h-4 w-4" />
        </div>
        <span class="text-sm font-bold text-white tracking-wide">Wallet Balance</span>
      </div>

      <!-- Right Action -->
      <button
        type="button"
        @click="emit('open-topup')"
        class="group inline-flex items-center space-x-1 text-xs font-semibold text-arena-muted hover:text-white transition-colors"
      >
        <span class="hidden sm:inline">Transaction History</span>
        <span class="sm:hidden font-mono text-[11px]">MMK</span>
        <ChevronRight class="h-3.5 w-3.5 text-arena-muted group-hover:text-white transition-transform group-hover:translate-x-0.5" />
      </button>
    </div>

    <!-- Center: Giant Balance Digits -->
    <div class="relative z-10 my-4 sm:my-5 space-y-1">
      <div class="flex items-baseline space-x-2 font-mono">
        <span class="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
          {{ formattedBalanceNumber }}
        </span>
        <span class="text-base sm:text-lg font-bold text-arena-muted">
          MMK
        </span>
      </div>
      <div class="text-[10px] font-bold uppercase tracking-wider text-arena-subtle">
        Available Balance
      </div>
    </div>

    <!-- Primary CTA Button: + Top Up (MMQR) -->
    <div class="relative z-10 pt-1">
      <button
        type="button"
        @click="emit('open-topup')"
        class="w-full flex items-center justify-center space-x-2 rounded-2xl bg-arena-orange px-6 py-3.5 text-sm font-extrabold text-white transition-all duration-300 hover:bg-arena-orange-hover active:scale-[0.98] shadow-lg shadow-arena-orange/25 group"
      >
        <Plus class="h-4 w-4 transition-transform group-hover:rotate-90 duration-300" />
        <span>Top Up (MMQR)</span>
      </button>
    </div>

    <!-- Sub-Stats Footer (3 Metrics) -->
    <div class="relative z-10 mt-5 pt-4 border-t border-arena-border/50 grid grid-cols-3 gap-2 text-center text-xs">
      <!-- Metric 1: Total Top Ups -->
      <div class="space-y-0.5">
        <div class="flex items-center justify-center space-x-1 text-[10px] text-arena-muted font-medium">
          <ArrowUpRight class="h-3 w-3 text-emerald-400" />
          <span class="truncate">Top Ups</span>
        </div>
        <div class="font-mono font-bold text-white text-xs sm:text-sm">
          {{ user?.totalDepositedMmk ? "1+" : "0" }} <span class="text-[10px] text-arena-subtle font-normal">times</span>
        </div>
      </div>

      <!-- Metric 2: Total Spent -->
      <div class="space-y-0.5 border-x border-arena-border/40 px-1">
        <div class="flex items-center justify-center space-x-1 text-[10px] text-arena-muted font-medium">
          <ArrowDownLeft class="h-3 w-3 text-arena-orange" />
          <span class="truncate">Spent</span>
        </div>
        <div class="font-mono font-bold text-white text-xs sm:text-sm truncate">
          {{ formattedSpent }}
        </div>
      </div>

      <!-- Metric 3: Member Since -->
      <div class="space-y-0.5">
        <div class="flex items-center justify-center space-x-1 text-[10px] text-arena-muted font-medium">
          <Calendar class="h-3 w-3 text-sky-400" />
          <span class="truncate">Since</span>
        </div>
        <div class="font-sans font-bold text-white text-xs sm:text-sm truncate">
          {{ formattedMemberSince }}
        </div>
      </div>
    </div>
  </div>
</template>

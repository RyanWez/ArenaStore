<script setup lang="ts">
import { ref } from "vue";
import { Package, ChevronRight, Eye, CheckCircle2, Clock, ExternalLink } from "lucide-vue-next";
import KeyRevealModal from "./KeyRevealModal.vue";

// Sample mock data matching the master screenshot for visual perfection
const sampleOrders = [
  {
    id: "10284",
    date: "Apr 26, 2026 · 14:32",
    productName: "Steam Wallet Top Up",
    tierName: "5 USD",
    amountMmk: "12,500 MMK",
    status: "DELIVERED",
    keyOrCredentials: "STEAM-WALLET-9824-TXK8-2026",
    brand: "steam",
  },
  {
    id: "10283",
    date: "Apr 25, 2026 · 20:11",
    productName: "Valorant Points",
    tierName: "1,000 VP",
    amountMmk: "24,800 MMK",
    status: "PROCESSING",
    keyOrCredentials: "Direct ID Top-up in Progress",
    brand: "valorant",
  },
  {
    id: "10282",
    date: "Apr 24, 2026 · 19:05",
    productName: "Netflix Premium",
    tierName: "1 Month (Shared)",
    amountMmk: "7,500 MMK",
    status: "DELIVERED",
    keyOrCredentials: "netflix_vip_04@arenastore.com | Pass: Arena#2026VIP",
    brand: "netflix",
  },
  {
    id: "10281",
    date: "Apr 22, 2026 · 16:44",
    productName: "PlayStation Store Gift Card",
    tierName: "10 USD",
    amountMmk: "25,000 MMK",
    status: "DELIVERED",
    keyOrCredentials: "PSN-CODE-98K2-10US-ARENA",
    brand: "playstation",
  },
  {
    id: "10280",
    date: "Apr 20, 2026 · 18:27",
    productName: "Spotify Premium",
    tierName: "1 Month (Individual)",
    amountMmk: "6,900 MMK",
    status: "DELIVERED",
    keyOrCredentials: "A9KD-3L2P-8M7Q-SPOTIFY",
    brand: "spotify",
  },
];

const selectedOrderForReveal = ref<any>(null);
const isRevealModalOpen = ref(false);

const openKeyReveal = (order: any) => {
  selectedOrderForReveal.value = order;
  isRevealModalOpen.value = true;
};

const closeKeyReveal = () => {
  isRevealModalOpen.value = false;
  selectedOrderForReveal.value = null;
};
</script>

<template>
  <div class="relative w-full overflow-hidden rounded-[26px] border border-arena-border/80 bg-gradient-to-b from-[#141720] via-[#0E1016] to-[#0A0C10] p-5 sm:p-6 shadow-xl text-white select-none transition-all duration-300">
    <!-- Header Row -->
    <div class="flex items-center justify-between pb-4 border-b border-arena-border/50">
      <div class="flex items-center space-x-2.5">
        <div class="flex h-8 w-8 items-center justify-center rounded-xl bg-arena-orange/10 border border-arena-orange/20 text-arena-orange">
          <Package class="h-4 w-4" />
        </div>
        <h3 class="text-sm sm:text-base font-bold text-white tracking-wide">Recent Orders</h3>
      </div>

      <NuxtLink
        to="/orders"
        class="group inline-flex items-center space-x-1 text-xs font-semibold text-arena-muted hover:text-white transition-colors"
      >
        <span>View All Orders</span>
        <ChevronRight class="h-3.5 w-3.5 text-arena-muted group-hover:text-white transition-transform group-hover:translate-x-0.5" />
      </NuxtLink>
    </div>

    <!-- 1. MOBILE LIST VIEW (< 1024px) matching mobile_dashboard.png -->
    <div class="lg:hidden divide-y divide-arena-border/40 pt-1">
      <div
        v-for="order in sampleOrders.slice(0, 3)"
        :key="order.id"
        class="py-3.5 flex items-center justify-between space-x-3 transition-colors hover:bg-white/[0.02] rounded-xl px-2"
      >
        <!-- Left: Icon + Info -->
        <div class="flex items-center space-x-3 min-w-0">
          <!-- Squircle Icon -->
          <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#1A1D26] border border-white/10 text-white shadow-sm font-black text-xs uppercase">
            {{ order.productName.charAt(0) }}
          </div>

          <div class="space-y-0.5 min-w-0">
            <h4 class="text-xs sm:text-sm font-bold text-white truncate">
              {{ order.productName }}
            </h4>
            <p class="text-[11px] text-arena-muted truncate">
              {{ order.tierName }} · <span class="text-arena-subtle">{{ order.date }}</span>
            </p>
          </div>
        </div>

        <!-- Right: Status Badge & Reveal Button -->
        <div class="flex flex-col items-end space-y-1.5 shrink-0">
          <div
            class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
            :class="order.status === 'DELIVERED' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 border border-amber-500/20 text-amber-400'"
          >
            <component :is="order.status === 'DELIVERED' ? CheckCircle2 : Clock" class="h-2.5 w-2.5" />
            <span>{{ order.status }}</span>
          </div>

          <button
            type="button"
            @click="openKeyReveal(order)"
            class="inline-flex items-center space-x-1 rounded-lg border border-arena-border/80 bg-white/5 hover:bg-white/10 px-2 py-1 text-[10px] font-semibold text-arena-text transition-colors"
          >
            <Eye class="h-3 w-3 text-arena-orange" />
            <span>Eye Reveal Key</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 2. DESKTOP DATA TABLE (>= 1024px) matching desktop_dashboard.png -->
    <div class="hidden lg:block overflow-x-auto pt-2">
      <table class="w-full text-left text-xs">
        <thead>
          <tr class="border-b border-arena-border/40 text-[10px] uppercase tracking-wider text-arena-muted font-bold">
            <th class="py-3 px-3">#</th>
            <th class="py-3 px-3">Date</th>
            <th class="py-3 px-3">Product</th>
            <th class="py-3 px-3">Amount</th>
            <th class="py-3 px-3">Status</th>
            <th class="py-3 px-3">Key / Details</th>
            <th class="py-3 px-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-arena-border/30">
          <tr
            v-for="order in sampleOrders"
            :key="order.id"
            class="hover:bg-white/[0.02] transition-colors"
          >
            <!-- Order # -->
            <td class="py-3.5 px-3 font-mono font-medium text-arena-muted">
              #{{ order.id }}
            </td>

            <!-- Date -->
            <td class="py-3.5 px-3 font-mono text-arena-muted whitespace-nowrap">
              {{ order.date }}
            </td>

            <!-- Product -->
            <td class="py-3.5 px-3">
              <div class="flex items-center space-x-2.5">
                <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-[#181B24] border border-white/10 font-bold text-white text-[10px] uppercase">
                  {{ order.productName.charAt(0) }}
                </div>
                <div>
                  <div class="font-bold text-white leading-snug">{{ order.productName }}</div>
                  <div class="text-[10px] text-arena-muted">{{ order.tierName }}</div>
                </div>
              </div>
            </td>

            <!-- Amount -->
            <td class="py-3.5 px-3 font-mono font-bold text-white whitespace-nowrap">
              {{ order.amountMmk }}
            </td>

            <!-- Status Pill -->
            <td class="py-3.5 px-3 whitespace-nowrap">
              <span
                class="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold"
                :class="order.status === 'DELIVERED' ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-400' : 'bg-amber-500/10 border border-amber-500/25 text-amber-400'"
              >
                <span class="h-1.5 w-1.5 rounded-full" :class="order.status === 'DELIVERED' ? 'bg-emerald-400' : 'bg-amber-400'" />
                <span>{{ order.status }}</span>
              </span>
            </td>

            <!-- Key / Details -->
            <td class="py-3.5 px-3 font-mono text-[11px] text-arena-muted max-w-[140px] truncate">
              <span v-if="order.status === 'DELIVERED'" class="text-white/80">
                ••••-••••-••••
              </span>
              <span v-else class="text-arena-subtle italic">
                Processing...
              </span>
            </td>

            <!-- Action Buttons -->
            <td class="py-3.5 px-3 text-right whitespace-nowrap">
              <button
                type="button"
                @click="openKeyReveal(order)"
                class="inline-flex items-center space-x-1 rounded-lg border border-arena-border/80 bg-white/5 hover:bg-white/10 px-2.5 py-1 text-xs font-semibold text-white transition-colors"
              >
                <Eye class="h-3 w-3 text-arena-orange" />
                <span>Eye Reveal Key</span>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Credentials Decrypted Modal -->
    <KeyRevealModal
      :is-open="isRevealModalOpen"
      :order="selectedOrderForReveal"
      @close="closeKeyReveal"
    />
  </div>
</template>

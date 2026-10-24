<script setup lang="ts">
import { computed } from "vue";
import { Check, Send } from "lucide-vue-next";
import EmvChip from "~/components/EmvChip.vue";
import { useStoreAuth } from "~/composables/useStoreAuth";

const { user } = useStoreAuth();

// Masked Telegram ID (e.g., 87•••••077)
const maskedTelegramId = computed(() => {
  const tid = user.value?.telegramId;
  if (!tid) return "87•••••077";
  if (tid.length <= 4) return tid;
  const firstTwo = tid.slice(0, 2);
  const lastThree = tid.slice(-3);
  return `${firstTwo}•••••${lastThree}`;
});

const displayName = computed(() => {
  if (!user.value) return "RYAN WEZ";
  const first = user.value.firstName || "";
  const last = user.value.lastName || "";
  return `${first} ${last}`.trim() || "ARENA MEMBER";
});

const displayUsername = computed(() => {
  if (user.value?.username) {
    return `@${user.value.username}`;
  }
  return "@ryanwez";
});
</script>

<template>
  <div class="relative w-full overflow-hidden rounded-[26px] border border-white/10 bg-gradient-to-br from-[#1E222D] via-[#12141B] to-[#0A0C10] p-6 text-white shadow-[0_20px_50px_rgba(0,0,0,0.85)] select-none group transition-all duration-300 hover:border-white/20">
    <!-- Brushed Titanium Specular Sheen (Subtle diagonal highlight) -->
    <div class="pointer-events-none absolute -inset-full bg-gradient-to-tr from-transparent via-white/[0.04] to-transparent rotate-12 transition-transform duration-700 group-hover:translate-x-12" />

    <!-- Embossed Large Geometric Arena 'A' Logo Watermark (Right Wing) -->
    <div class="pointer-events-none absolute -right-6 -bottom-8 opacity-15 transition-opacity group-hover:opacity-25">
      <svg class="h-56 w-56 text-white" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2L2 22h4.5l2.5-5.5h6l2.5 5.5H22L12 2zm0 5.8l2.1 4.7H9.9L12 7.8z" />
      </svg>
    </div>

    <!-- Top Row: Gold Emblem + Title + Slogan -->
    <div class="relative z-10 flex items-start justify-between">
      <div class="flex items-center space-x-2.5">
        <!-- Golden Geometric Logo -->
        <div class="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-black shadow-md shadow-amber-500/20">
          <svg class="h-4 w-4 fill-current text-black" viewBox="0 0 24 24">
            <path d="M12 2L2 22h4.5l2.5-5.5h6l2.5 5.5H22L12 2zm0 5.8l2.1 4.7H9.9L12 7.8z" />
          </svg>
        </div>
        <div>
          <h4 class="text-sm font-black tracking-wider text-white">Arena Store</h4>
          <p class="text-[9px] font-bold uppercase tracking-widest text-arena-muted">Virtual Member Card</p>
        </div>
      </div>

      <div class="text-right">
        <span class="text-[8px] font-bold uppercase tracking-widest text-arena-muted/80">
          More Than Just Tools
        </span>
      </div>
    </div>

    <!-- Middle Row: Gold Metallic EMV Microchip -->
    <div class="relative z-10 my-5 sm:my-6">
      <EmvChip variant="gold" size="md" />
    </div>

    <!-- Bottom Row: Cardholder Name, Telegram Handle, Masked ID, Verified Badge -->
    <div class="relative z-10 flex items-end justify-between">
      <div class="space-y-1">
        <!-- Cardholder Name -->
        <div class="font-sans font-black text-base sm:text-lg tracking-wide uppercase text-white leading-none">
          {{ displayName }}
        </div>
        <!-- Handle -->
        <div class="text-xs font-medium text-arena-muted">
          {{ displayUsername }}
        </div>

        <!-- Telegram Masked ID + TG Verified Badge -->
        <div class="flex items-center space-x-2 pt-1.5">
          <div class="flex items-center space-x-1.5 font-mono text-xs text-white/90 font-medium">
            <Send class="h-3 w-3 text-sky-400 fill-sky-400" />
            <span>{{ maskedTelegramId }}</span>
          </div>

          <div class="inline-flex items-center space-x-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase text-emerald-400 shadow-sm shadow-emerald-500/10">
            <Check class="h-2.5 w-2.5 stroke-[3]" />
            <span>TG VERIFIED</span>
          </div>
        </div>
      </div>

      <!-- Watermark Slogan -->
      <div class="text-right pb-0.5 hidden sm:block">
        <span class="text-[8px] font-bold tracking-widest uppercase text-arena-subtle">
          Access Premium Possibilities
        </span>
      </div>
    </div>
  </div>
</template>

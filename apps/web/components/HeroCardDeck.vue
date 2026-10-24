<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { ChevronLeft, ChevronRight } from "lucide-vue-next";
import { useStoreCatalog } from "~/composables/useStoreCatalog";
import type { MasterProduct } from "~/data/master-catalog";

const { featuredCards } = useStoreCatalog();

const emit = defineEmits<{
  (e: "buy-card", card: MasterProduct): void;
}>();

const activeIndex = ref(0);
const isHovered = ref(false);
let autoplayTimer: NodeJS.Timeout | null = null;

// Safe Touch Swipe Handling
const touchStartX = ref(0);
const touchEndX = ref(0);

const next = () => {
  activeIndex.value = (activeIndex.value + 1) % featuredCards.value.length;
};

const prev = () => {
  activeIndex.value = (activeIndex.value - 1 + featuredCards.value.length) % featuredCards.value.length;
};

const onTouchStart = (e: TouchEvent) => {
  const touch = e.touches[0];
  if (touch) {
    touchStartX.value = touch.clientX;
    touchEndX.value = touch.clientX;
  }
  isHovered.value = true;
};

const onTouchMove = (e: TouchEvent) => {
  const touch = e.touches[0];
  if (touch) {
    touchEndX.value = touch.clientX;
  }
};

const onTouchEnd = () => {
  const diff = touchStartX.value - touchEndX.value;
  if (Math.abs(diff) > 40) {
    if (diff > 0) {
      next();
    } else {
      prev();
    }
  }
  isHovered.value = false;
};

onMounted(() => {
  autoplayTimer = setInterval(() => {
    if (!isHovered.value && featuredCards.value.length > 1) {
      next();
    }
  }, 6000);
});

onUnmounted(() => {
  if (autoplayTimer) clearInterval(autoplayTimer);
});

const getCardStyle = (index: number) => {
  const total = featuredCards.value.length;
  if (total === 0) return {};

  const diff = (index - activeIndex.value + total) % total;

  if (diff === 0) {
    // Center Active Card
    return {
      transform: "translate3d(0, -12px, 20px) rotateY(0deg) scale(1)",
      zIndex: 30,
      opacity: 1,
      pointerEvents: "auto" as const,
    };
  } else if (diff === 1 || (total === 2 && diff === 1)) {
    // Right Flanking Card
    return {
      transform: "translate3d(46%, 6px, -70px) rotateY(-18deg) scale(0.9)",
      zIndex: 10,
      opacity: 0.72,
      pointerEvents: "auto" as const,
    };
  } else {
    // Left Flanking Card
    return {
      transform: "translate3d(-46%, 6px, -70px) rotateY(18deg) scale(0.9)",
      zIndex: 10,
      opacity: 0.72,
      pointerEvents: "auto" as const,
    };
  }
};
</script>

<template>
  <div
    class="relative w-full flex flex-col items-center justify-center select-none pt-4 pb-2"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    @touchstart="onTouchStart"
    @touchmove="onTouchMove"
    @touchend="onTouchEnd"
  >
    <!-- 3D Perspective Container -->
    <div
      class="relative w-full max-w-[340px] sm:max-w-[420px] lg:max-w-[460px] h-[280px] sm:h-[310px] flex items-center justify-center"
      style="perspective: 1200px;"
    >
      <!-- 1. ChatGPT Plus Card (Dark Forest Emerald Metallic) -->
      <div
        v-if="featuredCards[0]"
        class="absolute w-[270px] sm:w-[310px] h-[190px] sm:h-[215px] rounded-2xl p-5 flex flex-col justify-between transition-all duration-500 ease-out cursor-pointer shadow-2xl overflow-hidden border border-emerald-500/30"
        :style="getCardStyle(0)"
        style="background: linear-gradient(135deg, #0A1C16 0%, #0F2E24 50%, #071711 100%);"
        @click="activeIndex === 0 ? emit('buy-card', featuredCards[0]) : (activeIndex = 0)"
      >
        <!-- Subtle Brushed Metal Glare -->
        <div class="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/0 opacity-60" />

        <!-- Top Row: OpenAI Rosette + PLUS Badge -->
        <div class="flex items-center justify-between relative z-10">
          <svg class="h-8 w-8 text-white drop-shadow" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.28 9.87a5.98 5.98 0 0 0-.52-4.9 6.05 6.05 0 0 0-4.32-2.92 6.02 6.02 0 0 0-4.9.99 6 6 0 0 0-4.22-1.99 6.06 6.06 0 0 0-5.7 4.14 6.05 6.05 0 0 0 .83 6.02 5.98 5.98 0 0 0 .52 4.9 6.05 6.05 0 0 0 4.32 2.92 6.02 6.02 0 0 0 4.9-.99 6 6 0 0 0 4.22 1.99 6.06 6.06 0 0 0 5.7-4.14 6.05 6.05 0 0 0-.83-6.02zm-8.88 10.74a4.57 4.57 0 0 1-2.93-.72l.14-.08 4.88-2.82a.77.77 0 0 0 .39-.67v-6.9l2.08 1.2a.07.07 0 0 1 .04.05v5.71a4.58 4.58 0 0 1-4.6 4.23zm-7.9-3.41a4.56 4.56 0 0 1-.58-3.04l.14.08 4.88 2.82a.76.76 0 0 0 .77 0l5.98-3.45v2.4a.07.07 0 0 1-.03.06l-4.95 2.86a4.59 4.59 0 0 1-6.21-1.73zm-1.68-7.98a4.56 4.56 0 0 1 2.35-2.32v5.79a.77.77 0 0 0 .39.67l5.97 3.45-2.08 1.2a.07.07 0 0 1-.07 0l-4.95-2.86a4.58 4.58 0 0 1-1.61-5.93zm14.77 2.1l-5.98-3.45 2.08-1.2a.07.07 0 0 1 .07 0l4.95 2.86a4.58 4.58 0 0 1 1.61 5.93 4.56 4.56 0 0 1-2.34 2.33v-5.8a.77.77 0 0 0-.39-.67zm1.7-3.83l-.14-.08-4.88-2.82a.76.76 0 0 0-.77 0l-5.98 3.45v-2.4a.07.07 0 0 1 .03-.06l4.95-2.86a4.58 4.58 0 0 1 6.79 4.77zm-10.7 4.73l-2.08-1.2a.07.07 0 0 1-.04-.05v-5.71a4.58 4.58 0 0 1 7.53-3.51l-.14.08-4.88 2.82a.77.77 0 0 0-.39.67v6.9z"/>
          </svg>
          <span class="rounded-full bg-white/10 backdrop-blur-md border border-white/20 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-white shadow-sm">
            PLUS
          </span>
        </div>

        <!-- Middle Row: Title + Slogan + Golden EMV Chip -->
        <div class="flex items-center justify-between relative z-10 my-1">
          <div>
            <h3 class="text-xl sm:text-2xl font-extrabold tracking-tight text-white leading-none">
              ChatGPT Plus
            </h3>
            <p class="text-[11px] text-emerald-200/80 font-medium mt-1 leading-tight">
              Higher limits<br />Bigger possibilities
            </p>
          </div>

          <!-- Realistic Golden EMV Chip -->
          <div class="h-9 w-12 rounded-lg border border-amber-400/60 bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 shadow-md p-1 flex items-center justify-center shrink-0">
            <div class="h-full w-full rounded border border-amber-800/40 grid grid-cols-2 gap-0.5 p-0.5">
              <div class="border-r border-amber-800/40" />
              <div class="border-l border-amber-800/40" />
            </div>
          </div>
        </div>

        <!-- Bottom Row: Official Membership Metadata -->
        <div class="relative z-10 text-[9px] font-semibold uppercase tracking-widest text-emerald-300/60">
          Official Membership
        </div>
      </div>

      <!-- 2. CapCut Pro Card (Frosted Platinum Silver Metallic) -->
      <div
        v-if="featuredCards[1]"
        class="absolute w-[270px] sm:w-[310px] h-[190px] sm:h-[215px] rounded-2xl p-5 flex flex-col justify-between transition-all duration-500 ease-out cursor-pointer shadow-2xl overflow-hidden border border-slate-300/40"
        :style="getCardStyle(1)"
        style="background: linear-gradient(135deg, #FFFFFF 0%, #D8DFE6 50%, #BAC4CC 100%);"
        @click="activeIndex === 1 ? emit('buy-card', featuredCards[1]) : (activeIndex = 1)"
      >
        <!-- Top Row: CapCut Scissors + PRO Badge -->
        <div class="flex items-center justify-between relative z-10">
          <svg class="h-8 w-8 text-black" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.5 7.5L12 12l7.5 4.5V19l-9.5-5.7L4.5 16.5V13.8L9.8 12 4.5 10.2V7.5l5.5 3.2L19.5 5v2.5z"/>
          </svg>
          <span class="rounded-full bg-black/10 backdrop-blur-md border border-black/20 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-black shadow-sm">
            PRO
          </span>
        </div>

        <!-- Middle Row: Title + Slogan + Metallic EMV Chip -->
        <div class="flex items-center justify-between relative z-10 my-1">
          <div>
            <h3 class="text-xl sm:text-2xl font-extrabold tracking-tight text-black leading-none">
              CapCut Pro
            </h3>
            <p class="text-[11px] text-slate-700 font-medium mt-1 leading-tight">
              Edit without limits
            </p>
          </div>

          <!-- Silver / Dark Gold EMV Chip -->
          <div class="h-9 w-12 rounded-lg border border-slate-400/80 bg-gradient-to-br from-slate-200 via-slate-300 to-slate-400 shadow-md p-1 flex items-center justify-center shrink-0">
            <div class="h-full w-full rounded border border-slate-600/40 grid grid-cols-2 gap-0.5 p-0.5">
              <div class="border-r border-slate-600/40" />
              <div class="border-l border-slate-600/40" />
            </div>
          </div>
        </div>

        <!-- Bottom Row -->
        <div class="relative z-10 text-[9px] font-bold uppercase tracking-widest text-slate-600">
          Creative Freedom
        </div>
      </div>

      <!-- 3. Canva Pro Card (Royal Sapphire Blue Metallic) -->
      <div
        v-if="featuredCards[2]"
        class="absolute w-[270px] sm:w-[310px] h-[190px] sm:h-[215px] rounded-2xl p-5 flex flex-col justify-between transition-all duration-500 ease-out cursor-pointer shadow-2xl overflow-hidden border border-cyan-400/40"
        :style="getCardStyle(2)"
        style="background: linear-gradient(135deg, #072952 0%, #0A4585 50%, #0066B2 100%);"
        @click="activeIndex === 2 ? emit('buy-card', featuredCards[2]) : (activeIndex = 2)"
      >
        <!-- Top Row: Canva Logo + PRO Badge -->
        <div class="flex items-center justify-between relative z-10">
          <svg class="h-8 w-8 text-[#00C4CC]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.2 14.8c-2.4 0-4.1-1.8-4.1-4.8 0-3.3 2.1-5.1 4.7-5.1 1.8 0 3.1.8 3.7 2.1l-1.8 1.1c-.4-.8-1-1.2-1.9-1.2-1.6 0-2.6 1.4-2.6 3.1 0 1.9.9 3 2.3 3 .9 0 1.6-.4 2.1-1.1l1.8 1.1c-.8 1.2-2.3 1.8-4.2 1.8z"/>
          </svg>
          <span class="rounded-full bg-white/10 backdrop-blur-md border border-white/20 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-white shadow-sm">
            PRO
          </span>
        </div>

        <!-- Middle Row: Title + Slogan + Golden EMV Chip -->
        <div class="flex items-center justify-between relative z-10 my-1">
          <div>
            <h3 class="text-xl sm:text-2xl font-extrabold tracking-tight text-white leading-none">
              Canva Pro
            </h3>
            <p class="text-[11px] text-cyan-200/80 font-medium mt-1 leading-tight">
              Design anything
            </p>
          </div>

          <!-- Golden EMV Chip -->
          <div class="h-9 w-12 rounded-lg border border-amber-400/60 bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 shadow-md p-1 flex items-center justify-center shrink-0">
            <div class="h-full w-full rounded border border-amber-800/40 grid grid-cols-2 gap-0.5 p-0.5">
              <div class="border-r border-amber-800/40" />
              <div class="border-l border-amber-800/40" />
            </div>
          </div>
        </div>

        <!-- Bottom Row -->
        <div class="relative z-10 text-[9px] font-semibold uppercase tracking-widest text-cyan-200/60">
          Bigger ideas. Brighter designs.
        </div>
      </div>
    </div>

    <!-- The Textured Black Slate Rock / Podium Base -->
    <div class="relative w-full max-w-[340px] sm:max-w-[440px] -mt-6 z-20">
      <!-- Matte Slate Rock Silhouette with bevel edge -->
      <div class="h-10 sm:h-12 w-full rounded-2xl bg-gradient-to-b from-[#181B22] via-[#0E1015] to-[#08090B] border-t border-[#2F3545] shadow-[0_20px_40px_rgba(0,0,0,0.95)] flex items-center justify-between px-4 sm:px-6">
        <!-- Left: Carousel Navigation Chevrons & Numeric Counter -->
        <div class="flex items-center space-x-3">
          <button
            type="button"
            @click="prev"
            class="flex h-6 w-6 items-center justify-center rounded-full border border-arena-border bg-arena-surface text-arena-muted transition-colors hover:text-white hover:border-arena-border-strong"
            title="Previous Card"
          >
            <ChevronLeft class="h-3.5 w-3.5" />
          </button>

          <span class="font-mono text-xs font-bold text-arena-text select-none tracking-wider">
            0{{ activeIndex + 1 }} / 0{{ featuredCards.length }}
          </span>

          <button
            type="button"
            @click="next"
            class="flex h-6 w-6 items-center justify-center rounded-full border border-arena-border bg-arena-surface text-arena-muted transition-colors hover:text-white hover:border-arena-border-strong"
            title="Next Card"
          >
            <ChevronRight class="h-3.5 w-3.5" />
          </button>
        </div>

        <!-- Right: Vertical Tagline Metadata -->
        <div class="text-[8px] font-extrabold uppercase tracking-widest text-arena-subtle text-right leading-tight">
          SAME TOOLS<br />BIGGER POSSIBILITIES
        </div>
      </div>
    </div>
  </div>
</template>

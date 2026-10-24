<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { ChevronLeft, ChevronRight } from "lucide-vue-next";
import EmvChip from "./EmvChip.vue";
import { useStoreCatalog, type StoreProduct } from "~/composables/useStoreCatalog";

const { featuredCards } = useStoreCatalog();

const emit = defineEmits<{
  (e: "buy-card", card: StoreProduct): void;
}>();

const activeIndex = ref(0);
const isHovered = ref(false);
let autoplayTimer: NodeJS.Timeout | null = null;

// Touch Swipe Handling
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
    // Center Active Card - Raised forward with crisp focus
    return {
      transform: "translate3d(0, -8px, 40px) rotateY(0deg) scale(1)",
      zIndex: 30,
      opacity: 1,
      filter: "drop-shadow(0 25px 35px rgba(0, 0, 0, 0.9))",
      pointerEvents: "auto" as const,
    };
  } else if (diff === 1 || (total === 2 && diff === 1)) {
    // Right Flanking Card - Tilted back in 3D perspective
    return {
      transform: "translate3d(44%, 10px, -50px) rotateY(-14deg) scale(0.92)",
      zIndex: 10,
      opacity: 0.8,
      filter: "drop-shadow(0 15px 25px rgba(0, 0, 0, 0.8)) brightness(0.9)",
      pointerEvents: "auto" as const,
    };
  } else {
    // Left Flanking Card - Tilted back in 3D perspective
    return {
      transform: "translate3d(-44%, 10px, -50px) rotateY(14deg) scale(0.92)",
      zIndex: 10,
      opacity: 0.8,
      filter: "drop-shadow(0 15px 25px rgba(0, 0, 0, 0.8)) brightness(0.9)",
      pointerEvents: "auto" as const,
    };
  }
};
</script>

<template>
  <div
    class="relative w-full flex flex-col items-center justify-center select-none pt-2 pb-4"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    @touchstart="onTouchStart"
    @touchmove="onTouchMove"
    @touchend="onTouchEnd"
  >
    <!-- 3D Perspective Viewport -->
    <div
      class="relative w-full max-w-[340px] sm:max-w-[420px] lg:max-w-[480px] h-[270px] sm:h-[300px] flex items-center justify-center"
      style="perspective: 1400px;"
    >
      <!-- 1. Gemini Pro Card (Deep Cosmic Sapphire Metallic) -->
      <div
        v-if="featuredCards[0]"
        class="absolute w-[270px] sm:w-[320px] h-[185px] sm:h-[215px] rounded-2xl p-5 sm:p-6 flex flex-col justify-between transition-all duration-500 ease-out cursor-pointer overflow-hidden border border-sky-500/30"
        :style="getCardStyle(0)"
        style="
          background: linear-gradient(135deg, #091322 0%, #0F2A4A 50%, #071526 100%);
          box-shadow: inset 0 0 0 1px rgba(56, 189, 248, 0.4), 0 20px 45px -10px rgba(0, 0, 0, 0.95);
        "
        @click="activeIndex === 0 ? emit('buy-card', featuredCards[0]) : (activeIndex = 0)"
      >
        <!-- Subtle Brushed Metal Glare -->
        <div class="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/0 opacity-70" />

        <!-- Top Row: Google Gemini Star Vector + PRO Badge -->
        <div class="flex items-center justify-between relative z-10">
          <svg class="h-8 w-8 text-sky-400 drop-shadow" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" />
          </svg>
          <span class="rounded-full bg-sky-500/10 backdrop-blur-md border border-sky-500/30 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-sky-300 shadow-sm">
            PRO
          </span>
        </div>

        <!-- Middle Row: Title + Slogan + Silver EMV Smart Chip -->
        <div class="flex items-center justify-between relative z-10 my-1">
          <div>
            <h3 class="text-xl sm:text-2xl font-extrabold tracking-tight text-white leading-none">
              Gemini Pro
            </h3>
            <p class="text-[11px] text-sky-200/80 font-medium mt-1 leading-tight">
              Google Advanced AI<br />Extended 18 Months
            </p>
          </div>

          <!-- Silver Metallic Smart Chip matching benchmark -->
          <EmvChip variant="silver" size="md" />
        </div>

        <!-- Bottom Row: Official Membership Metadata -->
        <div class="relative z-10 text-[9px] font-semibold uppercase tracking-widest text-sky-300/60">
          Official Google Ecosystem
        </div>
      </div>

      <!-- 2. CapCut Pro Card (Frosted Platinum Silver Metallic) -->
      <div
        v-if="featuredCards[1]"
        class="absolute w-[270px] sm:w-[320px] h-[185px] sm:h-[215px] rounded-2xl p-5 sm:p-6 flex flex-col justify-between transition-all duration-500 ease-out cursor-pointer overflow-hidden border border-slate-300/50"
        :style="getCardStyle(1)"
        style="
          background: linear-gradient(135deg, #FFFFFF 0%, #DCE3EA 50%, #B8C4CE 100%);
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.9), 0 25px 50px -10px rgba(0, 0, 0, 0.9);
        "
        @click="activeIndex === 1 ? emit('buy-card', featuredCards[1]) : (activeIndex = 1)"
      >
        <!-- Top Row: Official CapCut Bowtie Ribbon + PRO Badge -->
        <div class="flex items-center justify-between relative z-10">
          <svg class="h-8 w-8 text-black" viewBox="0 0 25 24" fill="currentColor" fill-rule="evenodd">
            <path d="M24.189 6.442V2.671l-4.535 2.383V4.91c.002-1.505-1.078-2.411-2.638-2.411H2.64C.993 2.5 0 3.407 0 4.91V8.72L6.354 12 0 15.316v3.8C0 20.595 1 21.5 2.64 21.5h14.373c1.56 0 2.639-.907 2.639-2.382v-.197l4.536 2.409v-3.828L13.64 12 24.19 6.443zM9.982 13.873l7.797 4.083H2.157l7.825-4.083zm7.741-7.828l-7.742 4.057-7.825-4.057h15.567z" />
          </svg>
          <span class="rounded-full bg-black/10 backdrop-blur-md border border-black/20 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-black shadow-sm">
            PRO
          </span>
        </div>

        <!-- Middle Row: Title + Slogan + Gunmetal Titanium EMV Chip -->
        <div class="flex items-center justify-between relative z-10 my-1">
          <div>
            <h3 class="text-xl sm:text-2xl font-extrabold tracking-tight text-black leading-none">
              CapCut Pro
            </h3>
            <p class="text-[11px] text-slate-700 font-medium mt-1 leading-tight">
              Edit without limits
            </p>
          </div>

          <!-- Gunmetal Titanium Chip matching benchmark -->
          <EmvChip variant="gunmetal" size="md" />
        </div>

        <!-- Bottom Row -->
        <div class="relative z-10 text-[9px] font-bold uppercase tracking-widest text-slate-600">
          Creative Freedom
        </div>
      </div>

      <!-- 3. YouTube Premium Card (Royal Velvet Ruby Red Metallic) -->
      <div
        v-if="featuredCards[2]"
        class="absolute w-[270px] sm:w-[320px] h-[185px] sm:h-[215px] rounded-2xl p-5 sm:p-6 flex flex-col justify-between transition-all duration-500 ease-out cursor-pointer overflow-hidden border border-red-500/40"
        :style="getCardStyle(2)"
        style="
          background: linear-gradient(135deg, #220606 0%, #4A0D0D 50%, #1C0303 100%);
          box-shadow: inset 0 0 0 1px rgba(239, 68, 68, 0.4), 0 20px 45px -10px rgba(0, 0, 0, 0.95);
        "
        @click="activeIndex === 2 ? emit('buy-card', featuredCards[2]) : (activeIndex = 2)"
      >
        <!-- Top Row: Official YouTube Play Icon + PREMIUM Badge -->
        <div class="flex items-center justify-between relative z-10">
          <svg class="h-8 w-8 text-red-500 drop-shadow" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
          <span class="rounded-full bg-red-500/10 backdrop-blur-md border border-red-500/30 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-red-300 shadow-sm">
            PREMIUM
          </span>
        </div>

        <!-- Middle Row: Title + Slogan + Golden EMV Smart Chip -->
        <div class="flex items-center justify-between relative z-10 my-1">
          <div>
            <h3 class="text-xl sm:text-2xl font-extrabold tracking-tight text-white leading-none">
              YouTube Premium
            </h3>
            <p class="text-[11px] text-red-200/80 font-medium mt-1 leading-tight">
              Ad-free. Offline play.
            </p>
          </div>

          <!-- Gold Metallic Smart Chip matching benchmark -->
          <EmvChip variant="gold" size="md" />
        </div>

        <!-- Bottom Row -->
        <div class="relative z-10 text-[9px] font-semibold uppercase tracking-widest text-red-300/60">
          Music & Video Streaming
        </div>
      </div>
    </div>

    <!-- Authentic Textured Volcanic Slate Rock / Pedestal Base -->
    <div class="relative w-full max-w-[340px] sm:max-w-[460px] lg:max-w-[500px] -mt-5 z-20">
      <!-- Dark Volcanic Slate Slab with Beveled Rim Highlight -->
      <div
        class="h-12 sm:h-14 w-full rounded-2xl border-t border-[#374151]/60 shadow-[0_25px_50px_rgba(0,0,0,0.95)] flex items-center justify-between px-4 sm:px-6 relative overflow-hidden"
        style="background: radial-gradient(ellipse at 50% -20%, #1E232E 0%, #0E1015 60%, #08090B 100%);"
      >
        <!-- Ambient Specular Glow on the stone surface directly beneath cards -->
        <div class="pointer-events-none absolute -top-4 left-1/4 right-1/4 h-8 bg-gradient-to-b from-white/10 to-transparent blur-sm" />

        <!-- Left: Carousel Navigation Chevrons & Numeric Counter -->
        <div class="flex items-center space-x-2.5 relative z-10">
          <button
            type="button"
            @click="prev"
            class="flex h-6 w-6 items-center justify-center rounded-full border border-arena-border bg-[#101216] text-arena-muted transition-colors hover:text-white hover:border-arena-border-strong active:scale-95"
            title="Previous Card"
          >
            <ChevronLeft class="h-3.5 w-3.5" />
          </button>

          <span class="font-mono text-xs font-bold text-arena-text select-none tracking-wider px-1">
            0{{ activeIndex + 1 }} / 0{{ featuredCards.length }}
          </span>

          <button
            type="button"
            @click="next"
            class="flex h-6 w-6 items-center justify-center rounded-full border border-arena-border bg-[#101216] text-arena-muted transition-colors hover:text-white hover:border-arena-border-strong active:scale-95"
            title="Next Card"
          >
            <ChevronRight class="h-3.5 w-3.5" />
          </button>
        </div>

        <!-- Right: Vertical Tagline Metadata matching desktop_storefront.png -->
        <div class="text-[8px] font-bold uppercase tracking-[0.18em] text-[#5A6173] text-right leading-tight select-none relative z-10">
          SAME TOOLS<br />BIGGER POSSIBILITIES
        </div>
      </div>
    </div>
  </div>
</template>

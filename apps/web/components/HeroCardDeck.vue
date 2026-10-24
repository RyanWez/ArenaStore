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
      <!-- 1. ChatGPT Plus Card (Dark Titanium Emerald Metallic) -->
      <div
        v-if="featuredCards[0]"
        class="absolute w-[270px] sm:w-[320px] h-[185px] sm:h-[215px] rounded-2xl p-5 sm:p-6 flex flex-col justify-between transition-all duration-500 ease-out cursor-pointer overflow-hidden border border-emerald-500/30"
        :style="getCardStyle(0)"
        style="
          background: linear-gradient(135deg, #0A1C16 0%, #103227 45%, #06140F 100%);
          box-shadow: inset 0 0 0 1px rgba(52, 211, 153, 0.3), 0 20px 45px -10px rgba(0, 0, 0, 0.95);
        "
        @click="activeIndex === 0 ? emit('buy-card', featuredCards[0]) : (activeIndex = 0)"
      >
        <!-- Subtle Brushed Metal Glare -->
        <div class="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/0 opacity-70" />

        <!-- Top Row: OpenAI Rosette + PLUS Badge -->
        <div class="flex items-center justify-between relative z-10">
          <svg class="h-8 w-8 text-white drop-shadow" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.28 9.87a5.98 5.98 0 0 0-.52-4.9 6.05 6.05 0 0 0-4.32-2.92 6.02 6.02 0 0 0-4.9.99 6 6 0 0 0-4.22-1.99 6.06 6.06 0 0 0-5.7 4.14 6.05 6.05 0 0 0 .83 6.02 5.98 5.98 0 0 0 .52 4.9 6.05 6.05 0 0 0 4.32 2.92 6.02 6.02 0 0 0 4.9-.99 6 6 0 0 0 4.22 1.99 6.06 6.06 0 0 0 5.7-4.14 6.05 6.05 0 0 0-.83-6.02zm-8.88 10.74a4.57 4.57 0 0 1-2.93-.72l.14-.08 4.88-2.82a.77.77 0 0 0 .39-.67v-6.9l2.08 1.2a.07.07 0 0 1 .04.05v5.71a4.58 4.58 0 0 1-4.6 4.23zm-7.9-3.41a4.56 4.56 0 0 1-.58-3.04l.14.08 4.88 2.82a.76.76 0 0 0 .77 0l5.98-3.45v2.4a.07.07 0 0 1-.03.06l-4.95 2.86a4.59 4.59 0 0 1-6.21-1.73zm-1.68-7.98a4.56 4.56 0 0 1 2.35-2.32v5.79a.77.77 0 0 0 .39.67l5.97 3.45-2.08 1.2a.07.07 0 0 1-.07 0l-4.95-2.86a4.58 4.58 0 0 1-1.61-5.93zm14.77 2.1l-5.98-3.45 2.08-1.2a.07.07 0 0 1 .07 0l4.95 2.86a4.58 4.58 0 0 1 1.61 5.93 4.56 4.56 0 0 1-2.34 2.33v-5.8a.77.77 0 0 0-.39-.67zm1.7-3.83l-.14-.08-4.88-2.82a.76.76 0 0 0-.77 0l-5.98 3.45v-2.4a.07.07 0 0 1 .03-.06l4.95-2.86a4.58 4.58 0 0 1 6.79 4.77zm-10.7 4.73l-2.08-1.2a.07.07 0 0 1-.04-.05v-5.71a4.58 4.58 0 0 1 7.53-3.51l-.14.08-4.88 2.82a.77.77 0 0 0-.39.67v6.9z"/>
          </svg>
          <span class="rounded-full bg-white/10 backdrop-blur-md border border-white/20 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-white shadow-sm">
            PLUS
          </span>
        </div>

        <!-- Middle Row: Title + Slogan + Silver EMV Smart Chip -->
        <div class="flex items-center justify-between relative z-10 my-1">
          <div>
            <h3 class="text-xl sm:text-2xl font-extrabold tracking-tight text-white leading-none">
              ChatGPT Plus
            </h3>
            <p class="text-[11px] text-emerald-200/80 font-medium mt-1 leading-tight">
              Higher limits<br />Bigger possibilities
            </p>
          </div>

          <!-- Silver Metallic Smart Chip matching benchmark -->
          <EmvChip variant="silver" size="md" />
        </div>

        <!-- Bottom Row: Official Membership Metadata -->
        <div class="relative z-10 text-[9px] font-semibold uppercase tracking-widest text-emerald-300/60">
          Official Membership
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

      <!-- 3. Canva Pro Card (Royal Sapphire Blue Metallic) -->
      <div
        v-if="featuredCards[2]"
        class="absolute w-[270px] sm:w-[320px] h-[185px] sm:h-[215px] rounded-2xl p-5 sm:p-6 flex flex-col justify-between transition-all duration-500 ease-out cursor-pointer overflow-hidden border border-cyan-400/40"
        :style="getCardStyle(2)"
        style="
          background: linear-gradient(135deg, #072952 0%, #0A4585 50%, #0066B2 100%);
          box-shadow: inset 0 0 0 1px rgba(56, 189, 248, 0.4), 0 20px 45px -10px rgba(0, 0, 0, 0.95);
        "
        @click="activeIndex === 2 ? emit('buy-card', featuredCards[2]) : (activeIndex = 2)"
      >
        <!-- Top Row: Official Canva Cursive Script + PRO Badge -->
        <div class="flex items-center justify-between relative z-10">
          <svg class="h-8 w-8 text-white drop-shadow" viewBox="0 0 80 80" fill="currentColor">
            <path d="M57.2691 48.2052C56.939 48.2052 56.6485 48.484 56.3462 49.0928C52.9323 56.0153 47.0358 60.9134 40.2125 60.9134C32.3228 60.9134 27.437 53.7913 27.437 43.9522C27.437 27.2855 36.7232 17.6491 44.8796 17.6491C48.691 17.6491 51.0186 20.0443 51.0186 23.8559C51.0186 28.3796 48.4485 30.7748 48.4485 32.3702C48.4485 33.0864 48.8939 33.5201 49.7773 33.5201C53.3264 33.5201 57.4918 29.4419 57.4918 23.6808C57.4918 18.0947 52.63 13.9888 44.4737 13.9888C30.994 13.9888 19.0142 26.4858 19.0142 43.777C19.0142 57.1614 26.6572 66.0061 38.45 66.0061C50.9668 66.0061 58.2043 53.5526 58.2043 49.5105C58.2043 48.6153 57.7466 48.2052 57.2691 48.2052Z"/>
          </svg>
          <span class="rounded-full bg-white/10 backdrop-blur-md border border-white/20 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-white shadow-sm">
            PRO
          </span>
        </div>

        <!-- Middle Row: Title + Slogan + Golden EMV Smart Chip -->
        <div class="flex items-center justify-between relative z-10 my-1">
          <div>
            <h3 class="text-xl sm:text-2xl font-extrabold tracking-tight text-white leading-none">
              Canva Pro
            </h3>
            <p class="text-[11px] text-cyan-200/80 font-medium mt-1 leading-tight">
              Design anything
            </p>
          </div>

          <!-- Gold Metallic Smart Chip matching benchmark -->
          <EmvChip variant="gold" size="md" />
        </div>

        <!-- Bottom Row -->
        <div class="relative z-10 text-[9px] font-semibold uppercase tracking-widest text-cyan-200/60">
          Bigger ideas. Brighter designs.
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

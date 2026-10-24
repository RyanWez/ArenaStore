<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    variant?: "gold" | "silver" | "gunmetal";
    size?: "sm" | "md" | "lg";
  }>(),
  {
    variant: "gold",
    size: "md",
  }
);

const chipDimensions = computed(() => {
  switch (props.size) {
    case "sm":
      return { width: 38, height: 28, rx: 4 };
    case "lg":
      return { width: 52, height: 38, rx: 6 };
    case "md":
    default:
      return { width: 44, height: 32, rx: 5 };
  }
});
</script>

<template>
  <div
    class="relative inline-flex items-center justify-center shrink-0 select-none overflow-hidden"
    :style="{ width: `${chipDimensions.width}px`, height: `${chipDimensions.height}px` }"
  >
    <svg
      :width="chipDimensions.width"
      :height="chipDimensions.height"
      viewBox="0 0 44 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      class="w-full h-full drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
    >
      <defs>
        <!-- 1. Gold Metallic Brushed Gradient -->
        <linearGradient id="emv-gold-base" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FCD34D" />
          <stop offset="25%" stop-color="#F59E0B" />
          <stop offset="50%" stop-color="#D97706" />
          <stop offset="75%" stop-color="#FBBF24" />
          <stop offset="100%" stop-color="#B45309" />
        </linearGradient>

        <!-- 2. Platinum / Silver Metallic Brushed Gradient -->
        <linearGradient id="emv-silver-base" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#F8FAFC" />
          <stop offset="25%" stop-color="#E2E8F0" />
          <stop offset="50%" stop-color="#CBD5E1" />
          <stop offset="75%" stop-color="#94A3B8" />
          <stop offset="100%" stop-color="#64748B" />
        </linearGradient>

        <!-- 3. Gunmetal Titanium Brushed Gradient -->
        <linearGradient id="emv-gunmetal-base" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#64748B" />
          <stop offset="30%" stop-color="#475569" />
          <stop offset="60%" stop-color="#334155" />
          <stop offset="100%" stop-color="#1E293B" />
        </linearGradient>

        <!-- Circuit Etching Shimmer Line -->
        <linearGradient id="etch-light" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="rgba(255,255,255,0.4)" />
          <stop offset="100%" stop-color="rgba(0,0,0,0.5)" />
        </linearGradient>
      </defs>

      <!-- Outer Metallic Base with Subtle Bevel -->
      <rect
        x="0.5"
        y="0.5"
        width="43"
        height="31"
        :rx="chipDimensions.rx"
        :fill="
          variant === 'silver'
            ? 'url(#emv-silver-base)'
            : variant === 'gunmetal'
            ? 'url(#emv-gunmetal-base)'
            : 'url(#emv-gold-base)'
        "
        :stroke="
          variant === 'silver'
            ? '#94A3B8'
            : variant === 'gunmetal'
            ? '#334155'
            : '#B45309'
        "
        stroke-width="1"
      />

      <!-- Specular Highlight Overlay (Brushed Sheen) -->
      <rect
        x="1"
        y="1"
        width="42"
        height="12"
        rx="4"
        fill="white"
        fill-opacity="0.15"
      />

      <!-- Micro-Etched Contact Lines (EMV ISO/IEC 7816-2 Standard Layout) -->
      <g
        :stroke="
          variant === 'silver'
            ? 'rgba(71, 85, 105, 0.7)'
            : variant === 'gunmetal'
            ? 'rgba(15, 23, 42, 0.85)'
            : 'rgba(120, 53, 15, 0.75)'
        "
        stroke-width="0.9"
        stroke-linecap="round"
      >
        <!-- Left Vertical Boundary & Horizontal Dividers -->
        <path d="M14 1V31" />
        <path d="M1 10.5H14" />
        <path d="M1 21.5H14" />

        <!-- Right Vertical Boundary & Horizontal Dividers -->
        <path d="M30 1V31" />
        <path d="M30 10.5H43" />
        <path d="M30 21.5H43" />

        <!-- Center Core Horizontal Dividers -->
        <path d="M14 10.5H30" />
        <path d="M14 21.5H30" />

        <!-- Center Microprocessor Core Rounded Node -->
        <rect
          x="18"
          y="13"
          width="8"
          height="6"
          rx="1.5"
          fill="none"
        />
        <!-- Chip Notch indicator -->
        <path d="M22 13V19" />
      </g>
    </svg>
  </div>
</template>

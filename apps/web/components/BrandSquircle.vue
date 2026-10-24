<script setup lang="ts">
import { computed, ref } from "vue";
import {
  BRAND_DEFINITIONS,
  resolveBrandSlug,
  getBrandColorHash,
  type BrandDefinition,
} from "~/data/brand-registry";

const props = withDefaults(
  defineProps<{
    brand?: string;
    name?: string;
    size?: "sm" | "md" | "lg" | "xl";
    glow?: boolean;
  }>(),
  {
    size: "md",
    glow: false,
  }
);

const cdnFailed = ref(false);

const brandSlug = computed(() => {
  return resolveBrandSlug(props.brand || props.name);
});

const brandDef = computed<BrandDefinition | null>(() => {
  return BRAND_DEFINITIONS[brandSlug.value] || null;
});

const sizeClasses = computed(() => {
  switch (props.size) {
    case "sm":
      return "h-8 w-8 rounded-lg text-xs p-1";
    case "lg":
      return "h-14 w-14 rounded-2xl text-xl p-2.5";
    case "xl":
      return "h-16 w-16 sm:h-20 sm:w-20 rounded-2xl text-2xl p-3";
    case "md":
    default:
      return "h-12 w-12 sm:h-[52px] sm:w-[52px] rounded-2xl text-base p-2.5";
  }
});

const fallbackColor = computed(() => {
  return getBrandColorHash(brandSlug.value || props.name || "A");
});

const monogramText = computed(() => {
  const clean = (props.name || props.brand || "A")
    .replace(/\{pe:\d+\}/g, "")
    .replace(/[📱✨🖤🔒]/g, "")
    .trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0]![0]! + words[1]![0]!).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase() || "A";
});

const onCdnError = () => {
  cdnFailed.value = true;
};
</script>

<template>
  <div
    class="relative flex items-center justify-center shrink-0 select-none transition-transform duration-200 overflow-hidden shadow-md"
    :class="[
      sizeClasses,
      glow && 'ring-2 ring-arena-orange shadow-[0_0_24px_rgba(255,90,31,0.3)]',
    ]"
    :style="brandDef ? brandDef.bgStyle : `background: ${fallbackColor.bg};`"
  >
    <!-- Tier 1: Built-in High-Definition Official Vector SVG -->
    <svg
      v-if="brandDef"
      class="h-full w-full"
      :class="brandDef.textClass || 'text-white'"
      :viewBox="brandDef.viewBox"
      v-html="brandDef.svgHtml"
    />

    <!-- Tier 2: Zero-Maintenance Dynamic CDN Vector for new unseen brands -->
    <img
      v-else-if="!cdnFailed && brandSlug !== 'generic'"
      :src="`https://cdn.simpleicons.org/${brandSlug}/white`"
      :alt="brandSlug"
      class="h-full w-full object-contain p-1"
      @error="onCdnError"
      loading="lazy"
    />

    <!-- Tier 3: High-End Algorithmic Monogram Squircle -->
    <div
      v-else
      class="font-mono font-extrabold uppercase tracking-tight flex items-center justify-center leading-none text-white drop-shadow-sm select-none"
    >
      <span>{{ monogramText }}</span>
    </div>
  </div>
</template>

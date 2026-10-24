<script setup lang="ts">
import { computed } from "vue";
import { ShoppingCart } from "lucide-vue-next";
import BrandSquircle from "./BrandSquircle.vue";
import type { StoreProduct } from "~/composables/useStoreCatalog";

const props = defineProps<{
  product: StoreProduct;
}>();

const emit = defineEmits<{
  (e: "buy", product: StoreProduct): void;
}>();

// Extract pure numeric formatted string (e.g. "12,500", "350,000", "1,250,000")
const numericAmount = computed(() => {
  if (typeof props.product.priceMmk === "number" && !isNaN(props.product.priceMmk) && props.product.priceMmk > 0) {
    return new Intl.NumberFormat("en-US").format(props.product.priceMmk);
  }
  if (props.product.formattedPrice) {
    // Strip non-numeric/non-comma characters (e.g. " Ks", "/ month", etc.)
    const cleaned = props.product.formattedPrice.replace(/[^0-9,.]/g, "").trim();
    if (cleaned) return cleaned;
  }
  if (typeof props.product.priceMmk === "number" && !isNaN(props.product.priceMmk)) {
    return new Intl.NumberFormat("en-US").format(props.product.priceMmk);
  }
  return "0";
});

// Calculate digit count (excluding commas/dots) to dynamically scale font size
const digitCount = computed(() => {
  return numericAmount.value.replace(/[^0-9]/g, "").length;
});

// Dynamic font scaling classes:
// <= 5 digits (e.g. 6,500, 35,000): prominent bold display (text-base sm:text-lg)
// 6 digits (e.g. 120,000 - 999,999): balanced compact display (text-sm sm:text-[15px])
// 7 digits (e.g. 1,250,000 - 9,999,999): streamlined display (text-[13px] sm:text-sm)
// 8+ digits: ultra-compact display (text-xs sm:text-[13px])
const priceTextClass = computed(() => {
  if (digitCount.value >= 8) {
    return "text-xs sm:text-[13px]";
  }
  if (digitCount.value === 7) {
    return "text-[13px] sm:text-sm";
  }
  if (digitCount.value === 6) {
    return "text-sm sm:text-[15px]";
  }
  return "text-base sm:text-lg";
});

const currencyTextClass = computed(() => {
  if (digitCount.value >= 7) {
    return "text-[10px] sm:text-[11px]";
  }
  return "text-[11px] sm:text-xs";
});
</script>

<template>
  <div
    class="group rounded-2xl border border-arena-border bg-arena-surface p-4 sm:p-5 flex flex-col justify-between min-h-[185px] sm:min-h-[200px] transition-all duration-200 hover:border-[#374151] hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(0,0,0,0.6)] relative select-none"
  >
    <!-- Top Content: Squircle + Stock Status + Title & Subtitle -->
    <div class="space-y-3.5">
      <!-- Icon + Stock Status Row -->
      <div class="flex items-start justify-between">
        <BrandSquircle :brand="product.brand" :name="product.name" size="md" />

        <!-- Stock Status Dot matching benchmark -->
        <div
          v-if="product.stockStatus === 'IN_STOCK'"
          class="flex items-center space-x-1.5 text-[11px] font-medium text-emerald-400 pt-0.5"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
          <span>In Stock</span>
        </div>
        <div
          v-else
          class="flex items-center space-x-1.5 text-[11px] font-medium text-arena-subtle pt-0.5"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-arena-subtle" />
          <span>Out of Stock</span>
        </div>
      </div>

      <!-- Title & Subtitle -->
      <div class="space-y-1">
        <h4 class="text-sm sm:text-[15px] font-bold tracking-tight text-white group-hover:text-white transition-colors line-clamp-1">
          {{ product.name }}
        </h4>
        <p class="text-[11px] sm:text-xs text-arena-muted line-clamp-1 leading-normal">
          {{ product.subtitle }}
        </p>
      </div>
    </div>

    <!-- Bottom Content: Single-line Price + Unit + Cart Button -->
    <div class="border-t border-arena-border/60 pt-3 mt-4 flex items-center justify-between gap-2">
      <!-- Single-line price + currency, guaranteed no wrapping -->
      <div class="flex items-baseline whitespace-nowrap min-w-0 pr-1">
        <span
          class="font-mono font-extrabold text-white tracking-tight tabular-nums"
          :class="priceTextClass"
        >
          {{ numericAmount }}
        </span>
        <span
          class="font-bold text-arena-muted ml-1 select-none"
          :class="currencyTextClass"
        >
          Ks
        </span>
      </div>

      <!-- Rounded Square Cart Button matching benchmark -->
      <button
        type="button"
        @click="emit('buy', product)"
        :disabled="product.stockStatus === 'OUT_OF_STOCK'"
        class="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl border border-arena-border bg-[#161920] text-arena-muted transition-all hover:border-arena-orange hover:text-arena-orange hover:bg-arena-orange/10 active:scale-95 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
        :title="product.stockStatus === 'OUT_OF_STOCK' ? 'Out of Stock' : 'Add to cart / Purchase'"
      >
        <ShoppingCart class="h-4 w-4" />
      </button>
    </div>
  </div>
</template>

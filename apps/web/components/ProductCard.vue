<script setup lang="ts">
import { ShoppingCart } from "lucide-vue-next";
import BrandSquircle from "./BrandSquircle.vue";
import type { StoreProduct } from "~/composables/useStoreCatalog";

const props = defineProps<{
  product: StoreProduct;
}>();

const emit = defineEmits<{
  (e: "buy", product: StoreProduct): void;
}>();

const formatPrice = (priceMmk: number): string => {
  return new Intl.NumberFormat("en-US").format(priceMmk) + " Ks";
};
</script>

<template>
  <div
    class="group rounded-2xl border border-arena-border bg-arena-surface p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:border-arena-border-strong hover:bg-arena-surface/80 relative"
  >
    <!-- Top Content: Squircle + Title & Slogan -->
    <div class="space-y-3">
      <!-- Icon + Stock Status Row -->
      <div class="flex items-start justify-between">
        <BrandSquircle :brand="product.brand" :name="product.name" size="md" />

        <!-- Stock Status Dot -->
        <div
          v-if="product.stockStatus === 'IN_STOCK'"
          class="flex items-center space-x-1.5 text-[11px] font-medium text-emerald-400"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <span>In Stock</span>
        </div>
        <div
          v-else
          class="flex items-center space-x-1.5 text-[11px] font-medium text-arena-muted"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-arena-muted" />
          <span>Out of Stock</span>
        </div>
      </div>

      <!-- Title & Subtitle -->
      <div class="space-y-1">
        <h4 class="text-sm sm:text-base font-bold tracking-tight text-white group-hover:text-white transition-colors line-clamp-1">
          {{ product.name }}
        </h4>
        <p class="text-[11px] sm:text-xs text-arena-muted line-clamp-1 leading-snug">
          {{ product.subtitle }}
        </p>
      </div>
    </div>

    <!-- Bottom Content: Price + Dynamic Duration + Cart Button -->
    <div class="border-t border-arena-border/50 pt-3 mt-4 flex items-center justify-between">
      <div class="flex items-baseline space-x-1">
        <span class="font-mono text-sm sm:text-base font-extrabold text-white">
          {{ product.formattedPrice || formatPrice(product.priceMmk) }}
        </span>
        <span class="text-[10px] text-arena-subtle font-medium">
          {{ product.durationLabel || "/ month" }}
        </span>
      </div>

      <!-- Rounded Square Cart Button -->
      <button
        type="button"
        @click="emit('buy', product)"
        :disabled="product.stockStatus === 'OUT_OF_STOCK'"
        class="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border border-arena-border bg-arena-elevated text-arena-muted transition-colors hover:border-arena-orange hover:text-arena-orange active:scale-95 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
        :title="product.stockStatus === 'OUT_OF_STOCK' ? 'Out of Stock' : 'Add to cart / Purchase'"
      >
        <ShoppingCart class="h-4 w-4" />
      </button>
    </div>
  </div>
</template>

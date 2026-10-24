<script setup lang="ts">
import { ChevronRight, PackageOpen } from "lucide-vue-next";
import ProductCard from "./ProductCard.vue";
import ProductCardSkeleton from "./ProductCardSkeleton.vue";
import { useStoreCatalog, type StoreProduct } from "~/composables/useStoreCatalog";

const { filteredProducts, isLoading, selectCategory, searchQuery } = useStoreCatalog();

const emit = defineEmits<{
  (e: "buy-product", product: StoreProduct): void;
}>();

const resetSearch = () => {
  searchQuery.value = "";
  selectCategory("all");
};
</script>

<template>
  <div class="space-y-4">
    <!-- Section Header: Popular Products & View All -->
    <div class="flex items-end justify-between border-b border-arena-border/40 pb-3">
      <div>
        <h3 class="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
          Popular Products
        </h3>
        <p class="text-xs text-arena-muted mt-0.5">
          Most trusted. Most purchased. For a smarter, more creative you.
        </p>
      </div>

      <button
        type="button"
        @click="selectCategory('all')"
        class="group hidden sm:flex items-center space-x-1 text-xs font-semibold text-arena-muted hover:text-white transition-colors"
      >
        <span>View All</span>
        <ChevronRight class="h-3.5 w-3.5 text-arena-muted group-hover:text-white transition-transform group-hover:translate-x-0.5" />
      </button>
    </div>

    <!-- Loading Skeleton State -->
    <div
      v-if="isLoading"
      class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5"
    >
      <ProductCardSkeleton v-for="i in 12" :key="i" />
    </div>

    <!-- Empty State -->
    <div
      v-else-if="filteredProducts.length === 0"
      class="rounded-2xl border border-dashed border-arena-border bg-arena-surface/60 p-12 text-center space-y-4"
    >
      <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-arena-elevated border border-arena-border text-arena-muted">
        <PackageOpen class="h-6 w-6" />
      </div>
      <div class="space-y-1">
        <h4 class="text-sm font-bold text-white">No products found</h4>
        <p class="text-xs text-arena-muted max-w-sm mx-auto">
          Try a different keyword or reset categories to browse our full catalog.
        </p>
      </div>
      <button
        type="button"
        @click="resetSearch"
        class="inline-flex items-center space-x-1.5 rounded-lg border border-arena-border bg-arena-elevated px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:border-arena-border-strong"
      >
        <span>Reset Search & Filters</span>
      </button>
    </div>

    <!-- Active 6-Column Grid matching desktop_storefront.png -->
    <div
      v-else
      class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5 animate-fade-in"
    >
      <ProductCard
        v-for="product in filteredProducts"
        :key="product.id"
        :product="product"
        @buy="emit('buy-product', $event)"
      />
    </div>
  </div>
</template>

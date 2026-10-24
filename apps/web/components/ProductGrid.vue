<script setup lang="ts">
import { ChevronRight, PackageOpen, ServerOff, RefreshCw, MessageCircle } from "lucide-vue-next";
import ProductCard from "./ProductCard.vue";
import ProductCardSkeleton from "./ProductCardSkeleton.vue";
import { useStoreCatalog, type StoreProduct } from "~/composables/useStoreCatalog";
import { SITE_CONFIG } from "~/config/site";

const {
  filteredProducts,
  isLoading,
  isError,
  errorMessage,
  isRetrying,
  retrySync,
  selectCategory,
  searchQuery,
} = useStoreCatalog();

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
        v-if="!isError"
        type="button"
        @click="selectCategory('all')"
        class="group hidden sm:flex items-center space-x-1 text-xs font-semibold text-arena-muted hover:text-white transition-colors"
      >
        <span>View All</span>
        <ChevronRight class="h-3.5 w-3.5 text-arena-muted group-hover:text-white transition-transform group-hover:translate-x-0.5" />
      </button>
    </div>

    <!-- 1. Loading Skeleton State -->
    <div
      v-if="isLoading && !isRetrying"
      class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-3.5"
    >
      <ProductCardSkeleton v-for="i in 12" :key="i" />
    </div>

    <!-- 2. Server Offline / Error State (No Mock Data Fallback) -->
    <div
      v-else-if="isError"
      class="relative overflow-hidden rounded-2xl border border-red-500/25 bg-gradient-to-b from-[#180E13]/90 via-[#10121A]/90 to-[#0A0C10]/95 backdrop-blur-xl p-8 sm:p-12 text-center space-y-6 shadow-2xl animate-fade-in"
    >
      <!-- Background radial glow -->
      <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-500/10 via-transparent to-transparent opacity-70" />

      <!-- Glowing Icon Badge -->
      <div class="relative z-10 mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 shadow-inner">
        <ServerOff class="h-7 w-7" />
      </div>

      <div class="relative z-10 space-y-2 max-w-lg mx-auto">
        <div class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20">
          Connection Notice
        </div>
        <h4 class="text-lg sm:text-xl font-extrabold text-white tracking-tight">
          ဆာဗာ ဆက်သွယ်မှု ယာယီ ပြတ်တောက်နေပါသည်
        </h4>
        <p class="text-xs sm:text-sm text-arena-muted leading-relaxed">
          {{ errorMessage || "ဒေတာဘေ့စ်နှင့် အဆက်အသွယ် ပြတ်တောက်နေသဖြင့် ပစ္စည်းစာရင်းကို ခေတ္တ မဖော်ပြနိုင်သေးပါခင်ဗျာ။ ကျွန်ုပ်တို့အဖွဲ့မှ အမြန်ဆုံး စစ်ဆေးဆောင်ရွက်နေပါသည်။ ခဏအကြာတွင် ပြန်လည် စမ်းသပ်ပေးပါရန် မေတ္တာရပ်ခံအပ်ပါသည်။" }}
        </p>
      </div>

      <!-- Action Buttons: Retry & Telegram Support -->
      <div class="relative z-10 flex flex-wrap items-center justify-center gap-3 pt-2">
        <button
          type="button"
          @click="retrySync"
          :disabled="isRetrying"
          class="inline-flex items-center space-x-2 rounded-xl bg-arena-orange px-5 py-2.5 text-xs font-bold text-white transition-all hover:bg-arena-orange-hover active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-arena-orange/20"
        >
          <RefreshCw :class="['h-3.5 w-3.5', isRetrying ? 'animate-spin' : '']" />
          <span>{{ isRetrying ? "ပြန်လည်စမ်းသပ်နေပါသည်..." : "ပြန်လည် စမ်းသပ်မည် (Retry)" }}</span>
        </button>

        <a
          :href="SITE_CONFIG.supportContact"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center space-x-2 rounded-xl border border-arena-border bg-arena-surface px-5 py-2.5 text-xs font-semibold text-white transition-all hover:border-arena-border-strong hover:bg-arena-elevated"
        >
          <MessageCircle class="h-3.5 w-3.5 text-arena-muted" />
          <span>Customer Support သို့ ဆက်သွယ်ရန်</span>
        </a>
      </div>
    </div>

    <!-- 3. Empty Search State (When search query has 0 matches) -->
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

    <!-- 4. Active Responsive Bento Grid matching desktop and mobile benchmarks -->
    <div
      v-else
      class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-3.5 animate-fade-in"
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

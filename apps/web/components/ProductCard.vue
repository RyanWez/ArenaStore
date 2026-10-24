<script setup lang="ts">
import { computed } from "vue";
import { ShoppingCart, Zap, Link, CheckCircle2 } from "lucide-vue-next";
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
    const cleaned = props.product.formattedPrice.replace(/[^0-9,.]/g, "").trim();
    if (cleaned) return cleaned;
  }
  if (typeof props.product.priceMmk === "number" && !isNaN(props.product.priceMmk)) {
    return new Intl.NumberFormat("en-US").format(props.product.priceMmk);
  }
  return "0";
});

// Normalized duration pill if available (e.g. "6 Months", "1 Year")
const durationBadge = computed(() => {
  if (!props.product.durationLabel) return null;
  const cleaned = props.product.durationLabel.replace(/^\/\s*/, "").trim();
  return cleaned && cleaned !== "month" && cleaned !== "account" ? cleaned : null;
});
</script>

<template>
  <div
    class="group rounded-2xl border border-arena-border/80 bg-gradient-to-b from-[#13151D] via-[#0E1016] to-[#0A0C11] p-5 sm:p-6 flex flex-col justify-between min-h-[215px] sm:min-h-[230px] transition-all duration-200 hover:border-[#374151] hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(0,0,0,0.7)] relative select-none"
  >
    <!-- Top Content: Brand Squircle + Badges + Title & Description -->
    <div class="space-y-4">
      <!-- Row 1: Brand Squircle & Badges (Delivery + Stock) -->
      <div class="flex items-start justify-between gap-3">
        <BrandSquircle :brand="product.brand" :name="product.name" size="md" />

        <div class="flex flex-wrap items-center justify-end gap-2">
          <!-- Delivery Type Badge -->
          <div
            v-if="product.deliveryType === 'INSTANT'"
            class="inline-flex items-center space-x-1 rounded-full bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 text-[10px] font-semibold text-sky-400"
          >
            <Zap class="h-3 w-3" />
            <span>Instant</span>
          </div>
          <div
            v-else-if="product.deliveryType === 'LINK'"
            class="inline-flex items-center space-x-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-400"
          >
            <Link class="h-3 w-3" />
            <span>Invite Link</span>
          </div>
          <div
            v-else
            class="inline-flex items-center space-x-1 rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-[10px] font-medium text-arena-muted"
          >
            <CheckCircle2 class="h-3 w-3 text-emerald-400" />
            <span>Verified</span>
          </div>

          <!-- Stock Status Pill -->
          <div
            v-if="product.stockStatus === 'IN_STOCK'"
            class="inline-flex items-center space-x-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
            <span>In Stock</span>
          </div>
          <div
            v-else
            class="inline-flex items-center space-x-1.5 rounded-full bg-arena-surface border border-arena-border px-2.5 py-0.5 text-[11px] font-medium text-arena-subtle"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-arena-subtle" />
            <span>Out of Stock</span>
          </div>
        </div>
      </div>

      <!-- Row 2: Title, Duration Badge & Subtitle -->
      <div class="space-y-1.5">
        <div class="flex items-start justify-between gap-2">
          <h4 class="text-base sm:text-[17px] font-bold tracking-tight text-white group-hover:text-arena-orange transition-colors line-clamp-2 leading-snug">
            {{ product.name }}
          </h4>
          <span
            v-if="durationBadge"
            class="shrink-0 mt-0.5 inline-flex items-center rounded-md bg-white/5 border border-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-arena-muted"
          >
            {{ durationBadge }}
          </span>
        </div>

        <p class="text-xs text-arena-muted line-clamp-2 leading-relaxed">
          {{ product.subtitle }}
        </p>
      </div>
    </div>

    <!-- Bottom Content: Large Price + Prominent Action Button -->
    <div class="border-t border-arena-border/60 pt-4 mt-5 flex items-center justify-between gap-3">
      <!-- Price Display -->
      <div class="flex items-baseline space-x-1 min-w-0 pr-1">
        <span class="font-mono text-xl sm:text-2xl font-black text-white tracking-tight tabular-nums">
          {{ numericAmount }}
        </span>
        <span class="text-xs font-bold text-arena-muted uppercase select-none">
          Ks
        </span>
      </div>

      <!-- Action Button -->
      <button
        type="button"
        @click="emit('buy', product)"
        :disabled="product.stockStatus === 'OUT_OF_STOCK'"
        class="inline-flex items-center space-x-2 rounded-xl bg-arena-orange px-4 py-2 sm:py-2.5 text-xs font-bold text-white transition-all hover:bg-arena-orange-hover active:scale-95 shadow-md shadow-arena-orange/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-arena-surface disabled:border disabled:border-arena-border disabled:text-arena-subtle disabled:shadow-none"
      >
        <ShoppingCart v-if="product.stockStatus === 'IN_STOCK'" class="h-3.5 w-3.5" />
        <span>{{ product.stockStatus === 'IN_STOCK' ? "ဝယ်ယူမည်" : "လက်ကျန်မရှိ" }}</span>
      </button>
    </div>
  </div>
</template>

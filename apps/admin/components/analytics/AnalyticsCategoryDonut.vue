<script setup lang="ts">
import { ref, computed } from 'vue'

export interface DonutProductItem {
  productId?: number | null
  categoryId?: number | null
  productName?: string
  categoryName?: string
  name?: string
  revenueMmk: number
  costMmk: number
  profitMmk: number
  profitSharePct: number
  orderCount?: number
  unitsSold?: number
}

const props = defineProps<{
  products?: DonutProductItem[]
  categories?: DonutProductItem[]
  items?: DonutProductItem[]
  totalProfitMmk: number
}>()

const hoveredIndex = ref<number | null>(null)

// Vibrant curated colors for the donut slices
const sliceColors = [
  '#10b981', // Emerald
  '#6366f1', // Indigo
  '#06b6d4', // Cyan
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#3b82f6', // Blue
  '#14b8a6', // Teal
  '#f97316', // Orange
  '#64748b', // Slate
]

// Donut geometry constants
const size = 260
const center = size / 2
const radius = 95
const strokeWidth = 28
const circumference = 2 * Math.PI * radius

// Prefer products breakdown, fallback to categories
const displayItems = computed(() => {
  if (props.products && props.products.length > 0) return props.products
  if (props.items && props.items.length > 0) return props.items
  if (props.categories && props.categories.length > 0) return props.categories
  return []
})

const totalProfit = computed(() => {
  if (props.totalProfitMmk > 0) return props.totalProfitMmk
  return displayItems.value.reduce((acc, c) => acc + Math.max(0, c.profitMmk), 0)
})

function getItemName(item: DonutProductItem): string {
  return item.productName || item.name || item.categoryName || 'Product'
}

function getItemSalesCount(item: DonutProductItem): number {
  return item.orderCount ?? item.unitsSold ?? 1
}

// Calculate SVG stroke-dasharray and stroke-dashoffset for each slice
const slices = computed(() => {
  const list = displayItems.value.filter((c) => c.profitMmk > 0)
  if (list.length === 0 || totalProfit.value <= 0) return []

  let accumulatedPercent = 0

  return list.map((item, index) => {
    const percent = Math.max(0, item.profitMmk) / totalProfit.value
    const strokeDasharray = `${(percent * circumference).toFixed(2)} ${(circumference * (1 - percent)).toFixed(2)}`
    const strokeDashoffset = (-accumulatedPercent * circumference).toFixed(2)

    accumulatedPercent += percent

    return {
      item,
      displayName: getItemName(item),
      salesCount: getItemSalesCount(item),
      color: sliceColors[index % sliceColors.length],
      percent: (percent * 100).toFixed(1),
      strokeDasharray,
      strokeDashoffset,
      index,
    }
  })
})

const activeItem = computed(() => {
  if (hoveredIndex.value !== null && slices.value[hoveredIndex.value]) {
    return slices.value[hoveredIndex.value]
  }
  return null
})
</script>

<template>
  <div class="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm transition-all flex flex-col justify-between">
    <!-- Header -->
    <div class="flex items-center justify-between mb-2">
      <div>
        <h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <i class="pi pi-chart-pie text-indigo-500"></i>
          <span>Profit by Product</span>
        </h3>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Contribution breakdown across products
        </p>
      </div>

      <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
        {{ displayItems.length }} {{ displayItems.length === 1 ? 'Product' : 'Products' }}
      </span>
    </div>

    <!-- Center Donut Visualization -->
    <div class="relative flex items-center justify-center py-3">
      <svg
        :viewBox="`0 0 ${size} ${size}`"
        class="w-56 h-56 transform -rotate-90 select-none overflow-visible"
      >
        <!-- Background Track -->
        <circle
          :cx="center"
          :cy="center"
          :r="radius"
          fill="none"
          stroke="currentColor"
          class="text-slate-100 dark:text-slate-800/70"
          :stroke-width="strokeWidth - 4"
        />

        <!-- Product Slices -->
        <template v-if="slices.length > 0">
          <circle
            v-for="(slice, i) in slices"
            :key="'slice-' + i"
            :cx="center"
            :cy="center"
            :r="radius"
            fill="none"
            :stroke="slice.color"
            :stroke-width="hoveredIndex === i ? strokeWidth + 4 : strokeWidth"
            :stroke-dasharray="slice.strokeDasharray"
            :stroke-dashoffset="slice.strokeDashoffset"
            stroke-linecap="round"
            class="transition-all duration-300 ease-out cursor-pointer will-change-[stroke-width,opacity]"
            :class="{ 'opacity-40': hoveredIndex !== null && hoveredIndex !== i }"
            @mouseenter="hoveredIndex = i"
            @mouseleave="hoveredIndex = null"
            @touchstart.passive="hoveredIndex = i"
            @touchend="hoveredIndex = null"
          />
        </template>
      </svg>

      <!-- Center Text Badge with Smooth Fade Transition -->
      <div class="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-4">
        <Transition name="fade-center" mode="out-in">
          <div v-if="activeItem" :key="'item-' + activeItem.index" class="flex flex-col items-center max-w-[140px]">
            <span
              class="text-[11px] font-bold uppercase tracking-wider truncate w-full"
              :style="{ color: activeItem.color }"
              :title="activeItem.displayName"
            >
              {{ activeItem.displayName }}
            </span>
            <span class="text-base font-extrabold text-slate-900 dark:text-white font-mono mt-0.5">
              {{ activeItem.item.profitMmk.toLocaleString() }} Ks
            </span>
            <span class="text-[10px] text-slate-400 font-semibold mt-0.5">
              {{ activeItem.percent }}% share
            </span>
          </div>
          <div v-else key="total-profit" class="flex flex-col items-center">
            <span class="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
              Total Profit
            </span>
            <span class="text-base font-extrabold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
              {{ totalProfit.toLocaleString() }} Ks
            </span>
            <span class="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              Gross Margin
            </span>
          </div>
        </Transition>
      </div>
    </div>

    <!-- Product Breakdown List -->
    <div class="mt-2 space-y-2 max-h-52 overflow-y-auto scrollbar-thin pr-1">
      <template v-if="displayItems.length > 0">
        <div
          v-for="(item, idx) in displayItems"
          :key="'item-row-' + idx"
          class="flex items-center justify-between p-2 rounded-xl text-xs transition-all duration-200 cursor-pointer"
          :class="hoveredIndex === idx
            ? 'bg-slate-100 dark:bg-slate-800 font-medium translate-x-1'
            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:translate-x-0.5'"
          @mouseenter="hoveredIndex = idx"
          @mouseleave="hoveredIndex = null"
        >
          <!-- Left: Dot + Product Name + Category + Sales Count -->
          <div class="flex items-center gap-2 min-w-0 pr-2">
            <span
              class="w-2.5 h-2.5 rounded-full shrink-0"
              :style="{ backgroundColor: sliceColors[idx % sliceColors.length] }"
            ></span>
            <div class="min-w-0">
              <div class="font-medium text-slate-800 dark:text-slate-200 truncate" :title="getItemName(item)">
                {{ getItemName(item) }}
              </div>
              <div v-if="item.categoryName && item.categoryName !== getItemName(item)" class="text-[10px] text-slate-400 truncate">
                {{ item.categoryName }}
              </div>
            </div>
            <span class="text-[10px] text-slate-400 shrink-0">
              ({{ getItemSalesCount(item) }} {{ getItemSalesCount(item) === 1 ? 'sale' : 'sales' }})
            </span>
          </div>

          <!-- Right: Share % + Profit MMK -->
          <div class="flex items-center gap-3 shrink-0 text-right">
            <span class="font-bold text-slate-900 dark:text-white font-mono">
              {{ item.profitMmk.toLocaleString() }} Ks
            </span>
            <span
              class="px-1.5 py-0.5 rounded text-[10px] font-semibold font-mono"
              :style="{
                backgroundColor: `${sliceColors[idx % sliceColors.length]}18`,
                color: sliceColors[idx % sliceColors.length],
              }"
            >
              {{ item.profitSharePct }}%
            </span>
          </div>
        </div>
      </template>

      <!-- Empty State -->
      <div v-else class="py-6 text-center text-slate-400 text-xs">
        <p>No product sales data recorded in this period</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fade-center-enter-active,
.fade-center-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-center-enter-from {
  opacity: 0;
  transform: scale(0.95);
}

.fade-center-leave-to {
  opacity: 0;
  transform: scale(1.05);
}
</style>

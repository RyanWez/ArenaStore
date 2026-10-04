<script setup lang="ts">
import { ref, computed } from 'vue'

export interface TrendPoint {
  label: string
  date: string
  revenueMmk: number
  costMmk: number
  profitMmk: number
  ordersCount: number
}

const props = defineProps<{
  data: TrendPoint[]
  periodLabel?: string
}>()

const visibleSeries = ref({
  revenue: true,
  cost: true,
  profit: true,
})

const hoverIndex = ref<number | null>(null)
const svgRef = ref<SVGSVGElement | null>(null)

// Dimensions & padding inside SVG coordinate space (800x320)
const width = 800
const height = 320
const padding = { top: 30, right: 30, bottom: 45, left: 65 }

const chartWidth = width - padding.left - padding.right
const chartHeight = height - padding.top - padding.bottom

// Find max value across all visible metrics
const maxValue = computed(() => {
  if (!props.data || props.data.length === 0) return 100000
  let max = 0
  for (const p of props.data) {
    if (visibleSeries.value.revenue && p.revenueMmk > max) max = p.revenueMmk
    if (visibleSeries.value.cost && p.costMmk > max) max = p.costMmk
    if (visibleSeries.value.profit && p.profitMmk > max) max = p.profitMmk
  }
  if (max <= 0) return 100000
  // Round up to nice number
  const factor = Math.pow(10, Math.floor(Math.log10(max)))
  return Math.ceil((max * 1.15) / factor) * factor
})

// Y-axis tick values (4 steps)
const yTicks = computed(() => {
  const max = maxValue.value
  return [0, max * 0.33, max * 0.66, max].map((v) => Math.round(v))
})

// Map points to SVG coordinates
function getX(index: number, total: number): number {
  if (total <= 1) return padding.left + chartWidth / 2
  return padding.left + (index / (total - 1)) * chartWidth
}

function getY(val: number): number {
  const max = maxValue.value
  const ratio = Math.max(0, Math.min(1, val / max))
  return padding.top + chartHeight - ratio * chartHeight
}

const points = computed(() => {
  const list = props.data || []
  return list.map((item, index) => {
    const x = getX(index, list.length)
    return {
      item,
      x,
      yRevenue: getY(item.revenueMmk),
      yCost: getY(item.costMmk),
      yProfit: getY(item.profitMmk),
    }
  })
})

function getBezierPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`
  let path = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? i : i - 1]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1]

    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6

    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
  }
  return path
}

const revenuePath = computed(() =>
  getBezierPath(points.value.map((p) => ({ x: p.x, y: p.yRevenue })))
)
const costPath = computed(() =>
  getBezierPath(points.value.map((p) => ({ x: p.x, y: p.yCost })))
)
const profitPath = computed(() =>
  getBezierPath(points.value.map((p) => ({ x: p.x, y: p.yProfit })))
)

const profitAreaPath = computed(() => {
  const pts = points.value
  if (pts.length === 0) return ''
  const bottomY = padding.top + chartHeight
  return `${profitPath.value} L ${pts[pts.length - 1].x.toFixed(1)} ${bottomY} L ${pts[0].x.toFixed(1)} ${bottomY} Z`
})

const revenueAreaPath = computed(() => {
  const pts = points.value
  if (pts.length === 0) return ''
  const bottomY = padding.top + chartHeight
  return `${revenuePath.value} L ${pts[pts.length - 1].x.toFixed(1)} ${bottomY} L ${pts[0].x.toFixed(1)} ${bottomY} Z`
})

function formatCurrency(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(Math.round(n))
}

let cachedRect: DOMRect | null = null
let rafId: number | null = null

function updateCachedRect() {
  if (svgRef.value) {
    cachedRect = svgRef.value.getBoundingClientRect()
  }
}

function computeClosestPoint(clientX: number) {
  if (!svgRef.value || points.value.length === 0) return
  if (!cachedRect) updateCachedRect()
  if (!cachedRect || cachedRect.width === 0) return

  const mouseX = ((clientX - cachedRect.left) / cachedRect.width) * width
  let closestIdx = 0
  let minDiff = Infinity
  for (let i = 0; i < points.value.length; i++) {
    const diff = Math.abs(points.value[i].x - mouseX)
    if (diff < minDiff) {
      minDiff = diff
      closestIdx = i
    }
  }
  hoverIndex.value = closestIdx
}

function handleMouseEnter(e: MouseEvent) {
  updateCachedRect()
  handleMouseMove(e)
}

function handleMouseMove(e: MouseEvent) {
  if (rafId !== null) return
  const clientX = e.clientX
  rafId = requestAnimationFrame(() => {
    rafId = null
    computeClosestPoint(clientX)
  })
}

function handleTouchStart(e: TouchEvent) {
  updateCachedRect()
  handleTouchMove(e)
}

function handleTouchMove(e: TouchEvent) {
  if (e.touches.length > 0) {
    const clientX = e.touches[0].clientX
    if (rafId !== null) return
    rafId = requestAnimationFrame(() => {
      rafId = null
      computeClosestPoint(clientX)
    })
  }
}

function handleMouseLeave() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  cachedRect = null
  hoverIndex.value = null
}

const activeHover = computed(() => {
  if (hoverIndex.value === null || !points.value[hoverIndex.value]) return null
  const p = points.value[hoverIndex.value]
  const margin = p.item.revenueMmk > 0
    ? ((p.item.profitMmk / p.item.revenueMmk) * 100).toFixed(1)
    : '0.0'
  return {
    ...p,
    margin,
  }
})

const hasAnyData = computed(() => {
  return props.data.some((d) => d.revenueMmk > 0 || d.profitMmk > 0 || d.ordersCount > 0)
})
</script>

<template>
  <div class="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm transition-all">
    <!-- Header with Series Legend & Visibility Toggles -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
      <div>
        <h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <i class="pi pi-chart-line text-emerald-500"></i>
          <span>Sales & Profit Trend</span>
        </h3>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Dynamic revenue, cost of goods, and net gross profit trajectory
        </p>
      </div>

      <!-- Series Toggles -->
      <div class="flex items-center gap-2 text-xs flex-wrap">
        <button
          type="button"
          @click="visibleSeries.profit = !visibleSeries.profit"
          class="px-2.5 py-1 rounded-lg border flex items-center gap-1.5 font-medium transition-all cursor-pointer"
          :class="visibleSeries.profit
            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800'
            : 'text-slate-400 border-slate-200 dark:border-slate-800 opacity-50'"
        >
          <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
          <span>Net Profit</span>
        </button>

        <button
          type="button"
          @click="visibleSeries.revenue = !visibleSeries.revenue"
          class="px-2.5 py-1 rounded-lg border flex items-center gap-1.5 font-medium transition-all cursor-pointer"
          :class="visibleSeries.revenue
            ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border-indigo-300 dark:border-indigo-800'
            : 'text-slate-400 border-slate-200 dark:border-slate-800 opacity-50'"
        >
          <span class="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
          <span>Revenue</span>
        </button>

        <button
          type="button"
          @click="visibleSeries.cost = !visibleSeries.cost"
          class="px-2.5 py-1 rounded-lg border flex items-center gap-1.5 font-medium transition-all cursor-pointer"
          :class="visibleSeries.cost
            ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-800'
            : 'text-slate-400 border-slate-200 dark:border-slate-800 opacity-50'"
        >
          <span class="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
          <span>Cost</span>
        </button>
      </div>
    </div>

    <!-- Chart Container -->
    <div class="relative w-full overflow-hidden select-none">
      <!-- SVG Canvas -->
      <svg
        ref="svgRef"
        :viewBox="`0 0 ${width} ${height}`"
        class="w-full h-auto overflow-visible cursor-crosshair touch-none"
        @mouseenter="handleMouseEnter"
        @mousemove="handleMouseMove"
        @mouseleave="handleMouseLeave"
        @touchstart.passive="handleTouchStart"
        @touchmove.passive="handleTouchMove"
        @touchend="handleMouseLeave"
      >
        <defs>
          <!-- Profit Area Gradient -->
          <linearGradient id="trend-profit-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#10b981" stop-opacity="0.3" />
            <stop offset="100%" stop-color="#10b981" stop-opacity="0.0" />
          </linearGradient>

          <!-- Revenue Area Gradient -->
          <linearGradient id="trend-revenue-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#6366f1" stop-opacity="0.18" />
            <stop offset="100%" stop-color="#6366f1" stop-opacity="0.0" />
          </linearGradient>

          <!-- Glow Filter for Profit Line -->
          <filter id="profit-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        <!-- Y-Axis Grid Lines & Labels -->
        <g class="y-grid">
          <template v-for="tick in yTicks" :key="'ytick-' + tick">
            <line
              :x1="padding.left"
              :y1="getY(tick)"
              :x2="width - padding.right"
              :y2="getY(tick)"
              stroke="currentColor"
              class="text-slate-100 dark:text-slate-800/80"
              stroke-width="1"
              stroke-dasharray="3 3"
            />
            <text
              :x="padding.left - 10"
              :y="getY(tick) + 4"
              text-anchor="end"
              class="text-[10px] fill-slate-400 font-mono"
            >
              {{ formatCurrency(tick) }}
            </text>
          </template>
        </g>

        <!-- Area Fills -->
        <path
          v-if="visibleSeries.revenue && revenueAreaPath"
          :d="revenueAreaPath"
          fill="url(#trend-revenue-grad)"
          class="transition-opacity duration-300"
        />
        <path
          v-if="visibleSeries.profit && profitAreaPath"
          :d="profitAreaPath"
          fill="url(#trend-profit-grad)"
          class="transition-opacity duration-300"
        />

        <!-- Revenue Line (Indigo) -->
        <path
          v-if="visibleSeries.revenue && revenuePath"
          :d="revenuePath"
          fill="none"
          stroke="#6366f1"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="transition-all duration-300"
        />

        <!-- Cost Line (Rose) -->
        <path
          v-if="visibleSeries.cost && costPath"
          :d="costPath"
          fill="none"
          stroke="#f43f5e"
          stroke-width="2"
          stroke-dasharray="4 4"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="transition-all duration-300"
        />

        <!-- Gross Profit Line (Vibrant Emerald with subtle glow) -->
        <path
          v-if="visibleSeries.profit && profitPath"
          :d="profitPath"
          fill="none"
          stroke="#10b981"
          stroke-width="3.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          filter="url(#profit-glow)"
          class="transition-all duration-300"
        />

        <!-- X-Axis Labels -->
        <g class="x-labels">
          <template v-for="(p, i) in points" :key="'label-' + i">
            <text
              :x="p.x"
              :y="height - 12"
              text-anchor="middle"
              class="text-[11px] font-medium fill-slate-400"
              :class="{ 'fill-emerald-500 font-bold': hoverIndex === i }"
            >
              {{ p.item.label }}
            </text>
          </template>
        </g>

        <!-- Active Hover Guides & Dots -->
        <g v-if="activeHover" class="hover-elements pointer-events-none">
          <!-- Vertical Tracking Line -->
          <line
            :x1="activeHover.x"
            :y1="padding.top"
            :x2="activeHover.x"
            :y2="height - padding.bottom"
            stroke="currentColor"
            class="text-slate-400 dark:text-slate-600"
            stroke-width="1.5"
            stroke-dasharray="2 3"
          />

          <!-- Revenue Dot -->
          <circle
            v-if="visibleSeries.revenue"
            :cx="activeHover.x"
            :cy="activeHover.yRevenue"
            r="5"
            fill="#6366f1"
            stroke="#ffffff"
            stroke-width="2"
            class="transition-all"
          />

          <!-- Cost Dot -->
          <circle
            v-if="visibleSeries.cost"
            :cx="activeHover.x"
            :cy="activeHover.yCost"
            r="4.5"
            fill="#f43f5e"
            stroke="#ffffff"
            stroke-width="2"
            class="transition-all"
          />

          <!-- Profit Dot (Big with pulse ring) -->
          <circle
            v-if="visibleSeries.profit"
            :cx="activeHover.x"
            :cy="activeHover.yProfit"
            r="7"
            fill="#10b981"
            stroke="#ffffff"
            stroke-width="2.5"
            class="transition-all"
          />
        </g>
      </svg>

      <!-- Floating Modern Tooltip -->
      <div
        v-if="activeHover"
        class="absolute pointer-events-none z-20 top-2 bg-slate-900/95 dark:bg-slate-950/95 text-white backdrop-blur-md border border-slate-700/80 rounded-xl px-3.5 py-2.5 shadow-xl text-xs space-y-1.5 transition-[left] duration-100 ease-out will-change-transform"
        :style="{
          left: `${Math.min(75, Math.max(12, (activeHover.x / width) * 100))}%`,
          transform: 'translate3d(-50%, 0, 0)',
        }"
      >
        <div class="flex items-center justify-between gap-3 border-b border-slate-700 pb-1.5 font-semibold">
          <span class="text-slate-200">{{ activeHover.item.label }} ({{ activeHover.item.date }})</span>
          <span class="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded text-[10px] font-mono">
            {{ activeHover.item.ordersCount }} orders
          </span>
        </div>

        <div class="grid grid-cols-2 gap-x-4 gap-y-1 pt-0.5">
          <div class="flex items-center gap-1.5 text-slate-300">
            <span class="w-2 h-2 rounded-full bg-indigo-500"></span>
            <span>Revenue:</span>
          </div>
          <div class="text-right font-semibold text-indigo-400 font-mono">
            {{ activeHover.item.revenueMmk.toLocaleString() }} Ks
          </div>

          <div class="flex items-center gap-1.5 text-slate-300">
            <span class="w-2 h-2 rounded-full bg-rose-500"></span>
            <span>Cost:</span>
          </div>
          <div class="text-right font-semibold text-rose-400 font-mono">
            {{ activeHover.item.costMmk.toLocaleString() }} Ks
          </div>

          <div class="flex items-center gap-1.5 text-emerald-300 font-bold border-t border-slate-800 pt-1">
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Net Profit:</span>
          </div>
          <div class="text-right font-bold text-emerald-400 font-mono border-t border-slate-800 pt-1">
            +{{ activeHover.item.profitMmk.toLocaleString() }} Ks
          </div>

          <div class="col-span-2 text-right text-[10px] text-slate-400 pt-0.5">
            Margin: <span class="text-emerald-400 font-semibold">{{ activeHover.margin }}%</span>
          </div>
        </div>
      </div>

      <!-- Empty State Note -->
      <div
        v-if="!hasAnyData"
        class="absolute inset-0 flex flex-col items-center justify-center bg-white/60 dark:bg-slate-900/60 backdrop-blur-[1px] pointer-events-none"
      >
        <div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-2">
          <i class="pi pi-chart-line text-lg"></i>
        </div>
        <p class="text-xs font-semibold text-slate-600 dark:text-slate-300">No delivered orders in this timeframe</p>
        <p class="text-[11px] text-slate-400 mt-0.5">Data points will graph automatically as orders are completed</p>
      </div>
    </div>
  </div>
</template>

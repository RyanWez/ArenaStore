<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useSupplierStatus } from '~/composables/useSupplierStatus'
import { useToast } from '~/composables/useToast'
import { useAuth } from '~/composables/useAuth'
import { useStoreSettings } from '~/composables/useStoreSettings'
import { usePermission } from '~/composables/usePermission'

const { xproBalanceUsd, digitalcoreBalanceUsd, isSyncing, syncCatalog: runSync } = useSupplierStatus()
const { getAuthHeaders } = useAuth()
const { settings: storeSettings, fetchSettings: fetchStoreSettings } = useStoreSettings()
const toast = useToast()
const { can } = usePermission()

// View-only gating — the API strips the data server-side too; this only
// controls what the UI renders (columns, buttons, edit drawer).
const canSeeCost = computed(() => can('products.show_cost'))
const canSeeMargin = computed(() => can('products.show_margin'))
const canEditProducts = computed(() => can('products.edit'))
const canSyncSupplier = computed(() => can('supplier.sync'))
const canSeeSupplierWallet = computed(() => can('supplier.view'))

const isLoading = ref(true)
const isFiltering = ref(false)
const togglingId = ref<number | null>(null)
const isBulkUpdating = ref(false)

interface ProductItem {
  id: number
  supplier: 'XPRO' | 'DIGITALCORE'
  upstreamProductId: string | number
  nameMmk: string
  rawName: string
  categoryName: string
  descriptionMmk: string
  supplierPriceUsd: string
  pricingTiers?: any
  retailPriceMmk: number
  supplierStock: number
  localStockLimit: number | null
  isActive: boolean
  deliveryType: string
}

function getProductWalletCapacity(product: ProductItem): number {
  const usdCost = parseFloat(product.supplierPriceUsd) || 0
  const walletBal =
    product.supplier === 'DIGITALCORE'
      ? parseFloat(digitalcoreBalanceUsd.value) || 0
      : parseFloat(xproBalanceUsd.value) || 0
  if (usdCost <= 0) return product.supplierStock
  return Math.floor(walletBal / usdCost)
}

function getProductSellableStock(product: ProductItem): number {
  const walletCap = getProductWalletCapacity(product)
  const safeSupplierStock = product.supplierStock
  const safeLocalLimit = product.localStockLimit !== null && product.localStockLimit !== undefined ? product.localStockLimit : Infinity
  return Math.max(0, Math.min(safeSupplierStock, walletCap, safeLocalLimit))
}

const searchQuery = ref('')
const debouncedSearch = ref('')
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

watch(searchQuery, (newVal) => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => {
    debouncedSearch.value = newVal
  }, 250)
})

const supplierFilter = ref<'ALL' | 'XPRO' | 'DIGITALCORE'>('ALL')
const stockFilter = ref<'ALL' | 'IN_STOCK' | 'OUT_OF_STOCK'>('ALL')
const statusFilter = ref<'ALL' | 'ACTIVE' | 'PAUSED'>('ALL')
const categoryFilter = ref('ALL')

const isDrawerOpen = ref(false)
const selectedProduct = ref<ProductItem | null>(null)
const isSaving = ref(false)

// Edit form state
const editForm = ref({
  nameMmk: '',
  descriptionMmk: '',
  retailPriceMmk: 0,
  marginPct: 25,
  localStockLimit: null as number | null,
  isActive: true,
})

const productsList = ref<ProductItem[]>([])

const categoriesList = computed(() => {
  const set = new Set<string>()
  for (const p of productsList.value) {
    if (p.categoryName) set.add(p.categoryName)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b))
})

const xproCount = computed(() => productsList.value.filter((p) => (p.supplier || 'XPRO') === 'XPRO').length)
const dcCount = computed(() => productsList.value.filter((p) => p.supplier === 'DIGITALCORE').length)
const activeCount = computed(() => productsList.value.filter((p) => p.isActive).length)
const pausedCount = computed(() => productsList.value.filter((p) => !p.isActive).length)
const inStockCount = computed(() => productsList.value.filter((p) => getProductSellableStock(p) > 0).length)
const outOfStockCount = computed(() => productsList.value.filter((p) => getProductSellableStock(p) === 0).length)

async function fetchProducts(isSilent = false) {
  if (!isSilent) {
    if (productsList.value.length > 0) {
      isFiltering.value = true
    } else {
      isLoading.value = true
    }
  }
  try {
    const res: any = await $fetch('/api/admin/products', {
      headers: getAuthHeaders(),
    })

    if (res.ok && Array.isArray(res.products)) {
      productsList.value = res.products.map((p: any) => ({
        id: p.id,
        supplier: (p.supplier || 'XPRO').toUpperCase(),
        upstreamProductId: p.supplierProductId || p.upstreamProductId || p.id,
        nameMmk: p.nameMmk || p.name,
        rawName: p.name || p.nameMmk,
        categoryName: p.categoryName || 'General',
        descriptionMmk: p.descriptionMmk || p.description || '',
        supplierPriceUsd: p.supplierPriceUsd || '0.00',
        pricingTiers: p.pricingTiers || null,
        retailPriceMmk: p.retailPriceMmk || 0,
        supplierStock: p.supplierStock ?? 999,
        localStockLimit: p.localStockLimit,
        isActive: p.isActive !== false,
        deliveryType: p.deliveryType || 'CREDENTIALS',
      }))
    }
  } catch (err: any) {
    if (!isSilent) {
      toast.error('Failed to load products: ' + (err.message || 'Network error'))
    }
  } finally {
    if (!isSilent) {
      isLoading.value = false
      isFiltering.value = false
    }
  }
}

async function handleSyncCatalog(targetSupplier: 'ALL' | 'XPRO' | 'DIGITALCORE' = supplierFilter.value) {
  try {
    await runSync(targetSupplier)
    toast.success(`Catalog synced successfully for ${targetSupplier === 'ALL' ? 'all suppliers' : targetSupplier}!`, 'Sync Complete')
    await fetchProducts(true)
  } catch (err: any) {
    toast.error('Sync failed: ' + (err.message || 'Unknown error'))
  }
}

onMounted(() => {
  fetchProducts()
  fetchStoreSettings()
})

const filteredProducts = computed(() => {
  return productsList.value.filter((p) => {
    const q = debouncedSearch.value.toLowerCase().trim()
    const matchesSearch =
      !q ||
      p.nameMmk.toLowerCase().includes(q) ||
      p.rawName.toLowerCase().includes(q) ||
      p.categoryName.toLowerCase().includes(q) ||
      String(p.upstreamProductId).includes(q)

    const matchesSupplier =
      supplierFilter.value === 'ALL' || (p.supplier || 'XPRO') === supplierFilter.value

    const matchesStock =
      stockFilter.value === 'ALL' ||
      (stockFilter.value === 'IN_STOCK' && getProductSellableStock(p) > 0) ||
      (stockFilter.value === 'OUT_OF_STOCK' && getProductSellableStock(p) === 0)

    const matchesStatus =
      statusFilter.value === 'ALL' ||
      (statusFilter.value === 'ACTIVE' && p.isActive) ||
      (statusFilter.value === 'PAUSED' && !p.isActive)

    const matchesCategory =
      categoryFilter.value === 'ALL' || p.categoryName === categoryFilter.value

    return matchesSearch && matchesSupplier && matchesStock && matchesStatus && matchesCategory
  })
})

// Pagination state
const currentPage = ref(1)
const pageSize = ref(10)

watch([debouncedSearch, supplierFilter, stockFilter, statusFilter, categoryFilter, pageSize], () => {
  currentPage.value = 1
})

const totalFilteredCount = computed(() => filteredProducts.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalFilteredCount.value / pageSize.value)))

const paginatedProducts = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredProducts.value.slice(start, start + pageSize.value)
})

const showingRange = computed(() => {
  if (totalFilteredCount.value === 0) return 'Showing 0-0 of 0'
  const start = (currentPage.value - 1) * pageSize.value + 1
  const end = Math.min(start + pageSize.value - 1, totalFilteredCount.value)
  return `Showing ${start}-${end} of ${totalFilteredCount.value}`
})

const displayedPages = computed(() => {
  const total = totalPages.value
  const current = currentPage.value
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  const pages: number[] = []
  if (current <= 4) {
    for (let i = 1; i <= 5; i++) pages.push(i)
    pages.push(-1)
    pages.push(total)
  } else if (current >= total - 3) {
    pages.push(1)
    pages.push(-1)
    for (let i = total - 4; i <= total; i++) pages.push(i)
  } else {
    pages.push(1)
    pages.push(-1)
    pages.push(current - 1)
    pages.push(current)
    pages.push(current + 1)
    pages.push(-1)
    pages.push(total)
  }
  return pages
})

function goToPage(p: number) {
  if (p >= 1 && p <= totalPages.value) {
    currentPage.value = p
  }
}

function cleanProductName(name: string): string {
  if (!name) return ''
  return name.replace(/\{pe:\d+\}/g, '').trim()
}

function calculateMargin(retailPriceMmk: number, supplierPriceUsd: string): { pct: number; isPositive: boolean } {
  const usd = parseFloat(supplierPriceUsd) || 0
  const rate = storeSettings.value.usdToMmkRate || 4500
  const costMmk = usd * rate
  if (costMmk <= 0) return { pct: 0, isPositive: true }
  const pct = Math.round(((retailPriceMmk - costMmk) / costMmk) * 100)
  return { pct, isPositive: pct >= 0 }
}

function openEditDrawer(product: ProductItem, event?: Event) {
  if (event) event.stopPropagation()
  selectedProduct.value = product
  editForm.value.nameMmk = product.nameMmk
  editForm.value.descriptionMmk = product.descriptionMmk
  editForm.value.retailPriceMmk = product.retailPriceMmk
  editForm.value.localStockLimit = product.localStockLimit
  editForm.value.isActive = product.isActive

  const rate = storeSettings.value.usdToMmkRate || 4500
  const baseCostMmk = parseFloat(product.supplierPriceUsd) * rate
  if (baseCostMmk > 0) {
    editForm.value.marginPct = Math.round(
      ((product.retailPriceMmk - baseCostMmk) / baseCostMmk) * 100
    )
  }

  isDrawerOpen.value = true
}

function recalculatePrice() {
  if (!selectedProduct.value) return
  const usdCost = parseFloat(selectedProduct.value.supplierPriceUsd)
  const exchangeRate = storeSettings.value.usdToMmkRate || 4500
  const costMmk = usdCost * exchangeRate
  const marginMultiplier = 1 + editForm.value.marginPct / 100
  const rawPrice = costMmk * marginMultiplier
  // Round up to nearest 100 MMK (e.g., 450 -> 500, 1490 -> 1500)
  editForm.value.retailPriceMmk = Math.ceil(rawPrice / 100) * 100
}

async function saveProductChanges() {
  if (!selectedProduct.value) return

  isSaving.value = true
  try {
    const res: any = await $fetch(`/api/admin/products/${selectedProduct.value.id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: {
        nameMmk: editForm.value.nameMmk,
        descriptionMmk: editForm.value.descriptionMmk,
        retailPriceMmk: editForm.value.retailPriceMmk,
        localStockLimit: editForm.value.localStockLimit,
        isActive: editForm.value.isActive,
      },
    })

    if (res.ok) {
      selectedProduct.value.nameMmk = editForm.value.nameMmk
      selectedProduct.value.descriptionMmk = editForm.value.descriptionMmk
      selectedProduct.value.retailPriceMmk = editForm.value.retailPriceMmk
      selectedProduct.value.localStockLimit = editForm.value.localStockLimit
      selectedProduct.value.isActive = editForm.value.isActive

      const productName = selectedProduct.value.nameMmk
      isDrawerOpen.value = false
      toast.success(`Pricing and details saved for "${cleanProductName(productName)}"!`, 'Product Saved')
    } else {
      toast.error('Failed to update product: ' + (res.error || 'Server error'))
    }
  } catch (err: any) {
    toast.error('Update failed: ' + (err.message || 'Network error'))
  } finally {
    isSaving.value = false
  }
}

interface ConfirmDialogState {
  isOpen: boolean
  title: string
  message: string
  subMessage: string
  actionType: 'PAUSE' | 'ACTIVATE' | 'BULK_PAUSE' | 'BULK_ACTIVATE'
  confirmText: string
  confirmButtonClass: string
  confirmIcon: string
  product?: ProductItem
  targetActive?: boolean
  targets?: ProductItem[]
  isLoading: boolean
}

const confirmState = ref<ConfirmDialogState>({
  isOpen: false,
  title: '',
  message: '',
  subMessage: '',
  actionType: 'PAUSE',
  confirmText: '',
  confirmButtonClass: '',
  confirmIcon: '',
  isLoading: false,
})

function promptToggleProductStatus(product: ProductItem, event?: Event) {
  if (event) event.stopPropagation()
  if (confirmState.value.isLoading) return

  const targetActive = !product.isActive
  const prodName = cleanProductName(product.nameMmk)

  if (!targetActive) {
    // PAUSE
    confirmState.value = {
      isOpen: true,
      title: 'Pause Product from Telegram Store?',
      message: `Are you sure you want to pause "${prodName}"?`,
      subMessage: 'This product will be immediately hidden from the Telegram Bot catalog, and customer orders will be blocked.',
      actionType: 'PAUSE',
      confirmText: 'Pause Product',
      confirmButtonClass: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/30',
      confirmIcon: 'pi pi-pause',
      product,
      targetActive: false,
      isLoading: false,
    }
  } else {
    // ACTIVATE
    confirmState.value = {
      isOpen: true,
      title: 'Activate Product for Telegram Store?',
      message: `Are you sure you want to activate "${prodName}"?`,
      subMessage: 'This product will be published to the Telegram Bot and available for customers to order.',
      actionType: 'ACTIVATE',
      confirmText: 'Activate Product',
      confirmButtonClass: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30',
      confirmIcon: 'pi pi-play',
      product,
      targetActive: true,
      isLoading: false,
    }
  }
}

function promptBulkStatus(targetActive: boolean) {
  const targets = filteredProducts.value.filter((p) => p.isActive !== targetActive)
  if (targets.length === 0) {
    toast.info(`All filtered products already match this status.`)
    return
  }

  if (!targetActive) {
    // BULK PAUSE
    confirmState.value = {
      isOpen: true,
      title: 'Pause All Products In View?',
      message: `Are you sure you want to pause all ${targets.length} products currently in view?`,
      subMessage: 'These products will be immediately hidden from the Telegram Bot storefront. You can activate individual items anytime.',
      actionType: 'BULK_PAUSE',
      confirmText: `Pause All (${targets.length})`,
      confirmButtonClass: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/30',
      confirmIcon: 'pi pi-pause',
      targets,
      targetActive: false,
      isLoading: false,
    }
  } else {
    // BULK ACTIVATE
    confirmState.value = {
      isOpen: true,
      title: 'Activate All Products In View?',
      message: `Are you sure you want to activate all ${targets.length} products currently in view?`,
      subMessage: 'These products will be published to the Telegram Bot catalog and made available for customer purchases.',
      actionType: 'BULK_ACTIVATE',
      confirmText: `Activate All (${targets.length})`,
      confirmButtonClass: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30',
      confirmIcon: 'pi pi-play',
      targets,
      targetActive: true,
      isLoading: false,
    }
  }
}

async function executeConfirmAction() {
  if (confirmState.value.isLoading) return
  confirmState.value.isLoading = true

  const { actionType, product, targetActive, targets } = confirmState.value

  try {
    if ((actionType === 'PAUSE' || actionType === 'ACTIVATE') && product && targetActive !== undefined) {
      togglingId.value = product.id
      await $fetch(`/api/admin/products/${product.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: {
          isActive: targetActive,
        },
      })
      product.isActive = targetActive
      toast.info(
        targetActive
          ? `"${cleanProductName(product.nameMmk)}" is now ACTIVE for Telegram sale.`
          : `"${cleanProductName(product.nameMmk)}" is now PAUSED (hidden from Bot).`,
        targetActive ? 'Product Activated' : 'Product Paused'
      )
      confirmState.value.isOpen = false
    } else if ((actionType === 'BULK_PAUSE' || actionType === 'BULK_ACTIVATE') && targets && targetActive !== undefined) {
      isBulkUpdating.value = true
      await Promise.all(
        targets.map((p) =>
          $fetch(`/api/admin/products/${p.id}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: {
              isActive: targetActive,
            },
          }).then(() => {
            p.isActive = targetActive
          })
        )
      )
      toast.success(
        `${targets.length} products have been ${targetActive ? 'activated for sale' : 'paused (hidden from Bot)'}.`,
        'Bulk Action Complete'
      )
      confirmState.value.isOpen = false
    }
  } catch (err: any) {
    toast.error('Action failed: ' + (err.data?.error || err.message))
  } finally {
    confirmState.value.isLoading = false
    togglingId.value = null
    isBulkUpdating.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Top Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
          <i class="pi pi-box text-indigo-600 dark:text-indigo-400"></i>
          <span>Products & Catalog Management</span>
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Control MMK retail pricing, profit margins, and Telegram storefront visibility.
        </p>
      </div>

      <div class="flex items-center gap-2.5 flex-wrap">
        <button
          v-if="canSyncSupplier"
          type="button"
          @click="handleSyncCatalog(supplierFilter)"
          :disabled="isSyncing"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 active:scale-95 transition-all disabled:opacity-50"
        >
          <i class="pi pi-sync text-xs" :class="{ 'animate-spin': isSyncing }"></i>
          <span>{{ isSyncing ? 'Syncing Catalog...' : supplierFilter === 'ALL' ? 'Sync All Suppliers' : `Sync ${supplierFilter === 'DIGITALCORE' ? 'DigitalCore' : 'XPro'}` }}</span>
        </button>
      </div>
    </div>

    <!-- Integrated Unified Products Table Card -->
    <div class="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col overflow-hidden">
      <!-- Integrated Toolbar -->
      <div class="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col gap-3">
        <!-- Top Toolbar Row: Filter Pills & Search -->
        <div class="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div class="flex items-center gap-2 overflow-x-auto text-xs font-semibold scrollbar-none flex-wrap">
            <!-- Supplier Filter Tabs (All / XPro / DigitalCore) -->
            <div class="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-semibold shrink-0">
              <button
                type="button"
                @click="supplierFilter = 'ALL'"
                :class="supplierFilter === 'ALL' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
                class="px-3 py-1 rounded-lg transition-all"
              >
                All Suppliers ({{ productsList.length }})
              </button>
              <button
                type="button"
                @click="supplierFilter = 'XPRO'"
                :class="supplierFilter === 'XPRO' ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400'"
                class="px-3 py-1 rounded-lg transition-all flex items-center gap-1.5"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                <span>XPro ({{ xproCount }})</span>
              </button>
              <button
                type="button"
                @click="supplierFilter = 'DIGITALCORE'"
                :class="supplierFilter === 'DIGITALCORE' ? 'bg-cyan-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400'"
                class="px-3 py-1 rounded-lg transition-all flex items-center gap-1.5"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                <span>DigitalCore ({{ dcCount }})</span>
              </button>
            </div>

            <!-- Divider -->
            <div class="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 mx-1 hidden sm:block"></div>

            <!-- Status & Stock Tabs -->
            <div class="flex items-center gap-1.5 flex-wrap">
              <!-- All -->
              <button
                type="button"
                @click="statusFilter = 'ALL'; stockFilter = 'ALL'"
                :class="statusFilter === 'ALL' && stockFilter === 'ALL' ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'"
                class="px-3.5 py-1.5 rounded-xl transition-colors shrink-0 font-semibold"
              >
                All ({{ productsList.length }})
              </button>

              <!-- Active / Selling -->
              <button
                type="button"
                @click="statusFilter = 'ACTIVE'"
                :class="statusFilter === 'ACTIVE' ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'"
                class="px-3.5 py-1.5 rounded-xl transition-colors shrink-0 font-semibold flex items-center gap-1.5"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span>Selling ({{ activeCount }})</span>
              </button>

              <!-- Paused / Disabled -->
              <button
                type="button"
                @click="statusFilter = 'PAUSED'"
                :class="statusFilter === 'PAUSED' ? 'bg-amber-600 text-white shadow-sm shadow-amber-600/20' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'"
                class="px-3.5 py-1.5 rounded-xl transition-colors shrink-0 font-semibold flex items-center gap-1.5"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                <span>Paused ({{ pausedCount }})</span>
              </button>

              <!-- In Stock Divider -->
              <div class="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 mx-1 hidden sm:block"></div>

              <!-- In Stock -->
              <button
                type="button"
                @click="stockFilter = stockFilter === 'IN_STOCK' ? 'ALL' : 'IN_STOCK'"
                :class="stockFilter === 'IN_STOCK' ? 'bg-slate-800 dark:bg-slate-700 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800/60'"
                class="px-3 py-1.5 rounded-xl transition-colors shrink-0 text-xs flex items-center gap-1 font-medium"
              >
                <i class="pi pi-check text-[10px]"></i>
                <span>In Stock ({{ inStockCount }})</span>
              </button>

              <!-- Out of Stock -->
              <button
                type="button"
                @click="stockFilter = stockFilter === 'OUT_OF_STOCK' ? 'ALL' : 'OUT_OF_STOCK'"
                :class="stockFilter === 'OUT_OF_STOCK' ? 'bg-rose-600/90 text-white shadow-sm shadow-rose-600/20' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800/60'"
                class="px-3 py-1.5 rounded-xl transition-colors shrink-0 text-xs flex items-center gap-1 font-medium"
              >
                <i class="pi pi-times-circle text-[10px]"></i>
                <span>Out of Stock ({{ outOfStockCount }})</span>
              </button>
            </div>
          </div>

          <!-- Right Controls: Category Filter + Search Input -->
          <div class="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
            <!-- Category Dropdown Filter -->
            <select
              v-model="categoryFilter"
              class="px-3 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/70 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-500 cursor-pointer shrink-0"
            >
              <option value="ALL">All Categories ({{ categoriesList.length }})</option>
              <option v-for="cat in categoriesList" :key="cat" :value="cat">
                {{ cleanProductName(cat) }}
              </option>
            </select>

            <!-- Search Input -->
            <div class="relative w-full sm:w-60 shrink-0">
              <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Search products or ID..."
                class="w-full pl-8 pr-7 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/70 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition-colors"
                style="outline: none !important; box-shadow: none !important;"
              />
              <button
                v-if="searchQuery"
                @click="searchQuery = ''"
                type="button"
                class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <i class="pi pi-times text-[10px]"></i>
              </button>
            </div>
          </div>
        </div>

        <!-- Quick Bulk Protection Bar (Allows Admin to Pause/Activate products in 1 click) -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/60 text-xs">
          <div class="flex flex-wrap items-center gap-2 text-slate-500 dark:text-slate-400">
            <div class="flex items-center gap-1.5">
              <i class="pi pi-info-circle text-[11px] text-indigo-500"></i>
              <span>
                Telegram Store:
                <strong class="text-emerald-600 dark:text-emerald-400">{{ activeCount }} selling</strong> ·
                <span class="text-slate-400">{{ pausedCount }} paused</span>
              </span>
            </div>
            <span v-if="canSeeSupplierWallet" class="text-slate-300 dark:text-slate-700 hidden sm:inline">|</span>
            <div v-if="canSeeSupplierWallet" class="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-medium">
              <i class="pi pi-wallet text-[11px]"></i>
              <span>XPro: <strong class="font-mono">${{ xproBalanceUsd }}</strong> · DigitalCore: <strong class="font-mono">${{ digitalcoreBalanceUsd }}</strong></span>
            </div>
          </div>

          <div v-if="canEditProducts" class="flex items-center gap-2">
            <button
              type="button"
              @click="promptBulkStatus(false)"
              :disabled="isBulkUpdating || activeCount === 0"
              class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 transition-colors disabled:opacity-40"
              title="Pause all filtered products from the Bot"
            >
              <i class="pi pi-pause mr-1 text-[9px]"></i>
              <span>Pause In View</span>
            </button>
            <button
              type="button"
              @click="promptBulkStatus(true)"
              :disabled="isBulkUpdating || pausedCount === 0"
              class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 transition-colors disabled:opacity-40"
              title="Activate all filtered products for sale"
            >
              <i class="pi pi-play mr-1 text-[9px]"></i>
              <span>Activate In View</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Shimmer Loading Bar -->
      <div class="h-0.5 w-full bg-slate-100 dark:bg-slate-800/40 overflow-hidden relative">
        <div
          v-if="isFiltering"
          class="h-full bg-indigo-500 animate-indeterminate-bar rounded-full"
        ></div>
      </div>

      <!-- Scrollable Table Viewport -->
      <div class="overflow-x-auto overflow-y-auto max-h-[calc(100vh-320px)] min-h-[380px] relative scrollbar-thin">
        <table class="w-full text-left border-collapse text-sm">
          <thead class="sticky top-0 z-10 bg-slate-50 dark:bg-[#0e172a] shadow-sm border-b border-slate-200 dark:border-slate-800">
            <tr class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <th class="py-3 px-4">Product Name & Category</th>
              <th v-if="canSeeCost" class="py-3 px-4">USD Cost</th>
              <th class="py-3 px-4">Supplier Stock</th>
              <th class="py-3 px-4">MMK Retail Price</th>
              <th class="py-3 px-4">Our Sellable Stock</th>
              <th class="py-3 px-4">Storefront Status</th>
              <th class="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody
            class="divide-y divide-slate-100 dark:divide-slate-800/60 text-sm transition-opacity duration-300 ease-in-out"
            :class="{ 'opacity-40 pointer-events-none': isFiltering }"
          >
            <!-- Skeleton Loading State -->
            <template v-if="isLoading">
              <tr v-for="n in 5" :key="'prod-skel-' + n" class="animate-pulse">
                <td class="py-3.5 px-4"><div class="h-4 w-40 rounded bg-slate-200 dark:bg-slate-800 mb-1.5"></div><div class="h-3 w-20 rounded bg-slate-200 dark:bg-slate-800"></div></td>
                <td class="py-3.5 px-4"><div class="h-4 w-14 rounded bg-slate-200 dark:bg-slate-800"></div></td>
                <td class="py-3.5 px-4"><div class="h-4 w-20 rounded bg-slate-200 dark:bg-slate-800"></div></td>
                <td class="py-3.5 px-4"><div class="h-4 w-24 rounded bg-slate-200 dark:bg-slate-800"></div></td>
                <td class="py-3.5 px-4"><div class="h-4 w-24 rounded bg-slate-200 dark:bg-slate-800"></div></td>
                <td class="py-3.5 px-4"><div class="h-5 w-12 rounded-full bg-slate-200 dark:bg-slate-800"></div></td>
                <td class="py-3.5 px-4 text-right"><div class="h-7 w-20 rounded-xl bg-slate-200 dark:bg-slate-800 ml-auto"></div></td>
              </tr>
            </template>

            <!-- Empty state -->
            <tr v-else-if="paginatedProducts.length === 0">
              <td :colspan="canSeeCost ? 7 : 6" class="py-14 text-center">
                <div class="flex flex-col items-center justify-center max-w-sm mx-auto">
                  <div class="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 text-2xl mb-3">
                    <i class="pi pi-box"></i>
                  </div>
                  <h3 class="text-sm font-semibold text-slate-800 dark:text-slate-200">No Products Match Filters</h3>
                  <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {{ searchQuery ? 'Try adjusting your search query or reset status filters' : 'Synced products will appear here' }}
                  </p>
                  <button
                    type="button"
                    @click="searchQuery = ''; stockFilter = 'ALL'; statusFilter = 'ALL'; categoryFilter = 'ALL'"
                    class="mt-4 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm"
                  >
                    Reset All Filters
                  </button>
                </div>
              </td>
            </tr>

            <!-- Product Rows -->
            <template v-else>
              <tr
                v-for="p in paginatedProducts"
                :key="p.id"
                @click="canEditProducts && openEditDrawer(p, $event)"
                class="transition-colors group"
                :class="!p.isActive ? 'bg-slate-50/50 dark:bg-slate-950/40 text-slate-400' : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'"
              >
                <!-- Product Name & Category Pill -->
                <td class="py-3.5 px-4 max-w-sm">
                  <div class="flex items-center gap-2">
                    <span
                      class="font-semibold truncate max-w-xs group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors"
                      :class="p.isActive ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'"
                      :title="cleanProductName(p.nameMmk)"
                    >
                      {{ cleanProductName(p.nameMmk) }}
                    </span>
                    <!-- Supplier Badge -->
                    <span
                      v-if="p.supplier === 'DIGITALCORE'"
                      class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 uppercase tracking-wide shrink-0"
                    >
                      DigitalCore
                    </span>
                    <span
                      v-else
                      class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 uppercase tracking-wide shrink-0"
                    >
                      XPro
                    </span>
                  </div>
                  <div class="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span class="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60">
                      {{ cleanProductName(p.categoryName) }}
                    </span>
                    <span class="text-[11px] text-slate-400 font-mono">
                      ID: {{ p.upstreamProductId }} · {{ p.deliveryType }}
                    </span>
                    <span
                      v-if="p.pricingTiers && p.pricingTiers.length > 0"
                      class="px-1.5 py-0.2 rounded text-[9px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                      :title="`${p.pricingTiers.length} wholesale tiers available`"
                    >
                      Wholesale Tiers
                    </span>
                  </div>
                </td>

                <!-- Upstream USD Cost (hidden without products.show_cost) -->
                <td v-if="canSeeCost" class="py-3.5 px-4 font-mono font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                  ${{ p.supplierPriceUsd }}
                </td>

                <!-- Upstream Physical Supplier Stock (Wholesale Side) -->
                <td class="py-3.5 px-4 whitespace-nowrap">
                  <div class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60 font-mono">
                    {{ p.supplierStock }} in stock
                  </div>
                  <div class="text-[10px] text-slate-400 mt-0.5">
                    Upstream
                  </div>
                </td>

                <!-- MMK Retail Price & Clear Positive/Negative Margin -->
                <td class="py-3.5 px-4 whitespace-nowrap">
                  <div class="font-bold text-slate-900 dark:text-white font-mono">
                    {{ p.retailPriceMmk.toLocaleString() }} Ks
                  </div>
                  <div
                    v-if="canSeeMargin && p.supplierPriceUsd"
                    class="text-[11px] font-semibold"
                    :class="calculateMargin(p.retailPriceMmk, p.supplierPriceUsd).isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'"
                  >
                    Margin: {{ calculateMargin(p.retailPriceMmk, p.supplierPriceUsd).isPositive ? '+' : '' }}{{ calculateMargin(p.retailPriceMmk, p.supplierPriceUsd).pct }}%
                  </div>
                </td>

                <!-- Our Sellable Stock (Wallet Affordable - Retail Side) -->
                <td class="py-3.5 px-4 whitespace-nowrap">
                  <div class="flex items-center gap-1.5">
                    <span
                      class="px-2.5 py-0.5 rounded-full text-xs font-bold font-mono"
                      :class="getProductSellableStock(p) > 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'"
                    >
                      {{ getProductSellableStock(p) }} available
                    </span>
                    <span
                      v-if="getProductWalletCapacity(p) < p.supplierStock && p.supplierStock > 0"
                      class="text-[11px] text-amber-500 cursor-help"
                      :title="`Constrained by ${p.supplier} wallet balance ($${p.supplier === 'DIGITALCORE' ? digitalcoreBalanceUsd : xproBalanceUsd} USD). Can only fulfill ${getProductWalletCapacity(p)} units.`"
                    >
                      <i class="pi pi-exclamation-triangle"></i>
                    </span>
                  </div>
                  <div v-if="getProductSellableStock(p) === 0 && getProductWalletCapacity(p) === 0" class="text-[11px] text-rose-500 dark:text-rose-400 font-medium mt-0.5 flex items-center gap-1">
                    <i class="pi pi-wallet text-[10px]"></i>
                    <span>Wallet low (${{ (parseFloat(p.supplier === 'DIGITALCORE' ? digitalcoreBalanceUsd : xproBalanceUsd) || 0).toFixed(2) }} vs ${{ p.supplierPriceUsd }})</span>
                  </div>
                  <div v-else-if="getProductWalletCapacity(p) < p.supplierStock" class="text-[11px] text-amber-600 dark:text-amber-400 font-medium mt-0.5">
                    Wallet cap: {{ getProductWalletCapacity(p) }} units
                  </div>
                  <div v-else-if="p.localStockLimit !== null" class="text-[11px] text-indigo-400 mt-0.5">
                    Local limit: {{ p.localStockLimit }}
                  </div>
                  <div v-else class="text-[11px] text-slate-400 mt-0.5">
                    Full supplier stock
                  </div>
                </td>

                <!-- Active Status Toggle & Badge -->
                <td class="py-3.5 px-4" @click.stop>
                  <div class="flex items-center gap-2">
                    <button
                      v-if="canEditProducts"
                      type="button"
                      @click="promptToggleProductStatus(p, $event)"
                      :disabled="togglingId === p.id"
                      class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50"
                      :class="p.isActive ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'"
                      :title="p.isActive ? 'Active on Bot (Click to pause)' : 'Paused on Bot (Click to activate)'"
                    >
                      <span
                        class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out flex items-center justify-center"
                        :class="p.isActive ? 'translate-x-4' : 'translate-x-0'"
                      >
                        <i v-if="togglingId === p.id" class="pi pi-spinner animate-spin text-[8px] text-slate-600"></i>
                      </span>
                    </button>

                    <span
                      class="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                      :class="p.isActive ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'"
                    >
                      {{ p.isActive ? 'Selling' : 'Paused' }}
                    </span>
                  </div>
                </td>

                <!-- Action Edit Button (view-only roles see the status only) -->
                <td class="py-3.5 px-4 text-right">
                  <button
                    v-if="canEditProducts"
                    type="button"
                    @click="openEditDrawer(p, $event)"
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors"
                  >
                    <i class="pi pi-pencil text-[11px]"></i>
                    <span>Edit</span>
                  </button>
                  <span v-else class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">View only</span>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <!-- Unified Pagination Footer -->
      <div class="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
        <div>
          <span>{{ showingRange }}</span>
        </div>

        <div class="flex items-center gap-1.5">
          <!-- Prev Button -->
          <button
            type="button"
            @click="goToPage(currentPage - 1)"
            :disabled="currentPage === 1"
            class="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700/80 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors text-slate-700 dark:text-slate-300"
          >
            <i class="pi pi-chevron-left text-[10px]"></i>
          </button>

          <!-- Numbered Pages -->
          <template v-for="(p, idx) in displayedPages" :key="'p-' + idx">
            <span v-if="p === -1" class="px-1 text-slate-400">...</span>
            <button
              v-else
              type="button"
              @click="goToPage(p)"
              :class="currentPage === p ? 'bg-indigo-600 text-white font-bold' : 'border border-slate-200 dark:border-slate-700/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'"
              class="w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-colors"
            >
              {{ p }}
            </button>
          </template>

          <!-- Next Button -->
          <button
            type="button"
            @click="goToPage(currentPage + 1)"
            :disabled="currentPage === totalPages"
            class="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700/80 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors text-slate-700 dark:text-slate-300"
          >
            <i class="pi pi-chevron-right text-[10px]"></i>
          </button>

          <!-- Page Size Selector -->
          <select
            v-model="pageSize"
            class="ml-2 px-2.5 py-1 rounded-lg text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          >
            <option :value="10">10 / page</option>
            <option :value="20">20 / page</option>
            <option :value="50">50 / page</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Edit Product Modal (Teleported to body for 100% full-screen coverage with no gap!) -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="isDrawerOpen && selectedProduct"
          class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          @click.self="isDrawerOpen = false"
        >
          <div class="modal-card relative w-full max-w-lg bg-white dark:bg-[#0e1726] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <!-- Modal Header -->
            <div class="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center text-lg shrink-0">
                  <i class="pi pi-pencil"></i>
                </div>
                <div>
                  <h3 class="text-base font-bold text-slate-900 dark:text-white">Edit Product Settings</h3>
                  <p class="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[280px]" :title="cleanProductName(selectedProduct.nameMmk)">
                    {{ cleanProductName(selectedProduct.nameMmk) }}
                  </p>
                </div>
              </div>
              <button
                type="button"
                @click="isDrawerOpen = false"
                class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center text-xs transition-colors"
              >
                <i class="pi pi-times"></i>
              </button>
            </div>

            <div class="space-y-4 text-xs">
              <!-- Upstream Cost Info Card (hidden without products.show_cost) -->
              <div v-if="canSeeCost && selectedProduct.supplierPriceUsd" class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
                <div>
                  <span class="text-slate-500 dark:text-slate-400">Upstream Cost:</span>
                  <span class="font-mono font-bold text-slate-800 dark:text-white text-sm ml-2">
                    ${{ selectedProduct.supplierPriceUsd }} USD
                  </span>
                </div>
                <div class="text-slate-500">
                  Base MMK: <strong class="font-mono text-slate-700 dark:text-slate-300">{{ (parseFloat(selectedProduct.supplierPriceUsd) * (storeSettings.usdToMmkRate || 4500)).toLocaleString() }} Ks</strong>
                </div>
              </div>

              <!-- Product Display Name MMK -->
              <div>
                <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Display Name (Storefront)
                </label>
                <input
                  v-model="editForm.nameMmk"
                  type="text"
                  class="w-full px-3.5 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                  style="outline: none !important; box-shadow: none !important;"
                />
              </div>

              <!-- Myanmar Description / Warranty Notes -->
              <div>
                <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Description & Warranty Terms (Visible in Telegram Bot)
                </label>
                <textarea
                  v-model="editForm.descriptionMmk"
                  rows="3"
                  placeholder="e.g. ⚡ Instant delivery • 30-Day Warranty"
                  class="w-full px-3.5 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500 resize-none"
                  style="outline: none !important; box-shadow: none !important;"
                ></textarea>
              </div>

              <!-- Profit Margin & Price Grid (margin slider only with products.show_margin) -->
              <div class="grid grid-cols-2 gap-3">
                <!-- Desired Profit Margin -->
                <div v-if="canSeeMargin && selectedProduct.supplierPriceUsd">
                  <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Profit Margin (%)
                  </label>
                  <div class="flex items-center gap-2">
                    <input
                      v-model.number="editForm.marginPct"
                      @input="recalculatePrice"
                      type="number"
                      min="0"
                      max="500"
                      class="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                      style="outline: none !important; box-shadow: none !important;"
                    />
                    <span class="text-xs text-slate-400 font-bold">%</span>
                  </div>
                </div>

                <!-- Retail Price MMK (Rounded to 500) -->
                <div>
                  <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Retail Price (500 Step)
                  </label>
                  <div class="relative">
                    <input
                      v-model.number="editForm.retailPriceMmk"
                      type="number"
                      step="500"
                      class="w-full px-3.5 py-2 rounded-xl text-xs font-bold font-mono bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                      style="outline: none !important; box-shadow: none !important;"
                    />
                    <span class="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-semibold">MMK</span>
                  </div>
                </div>
              </div>

              <!-- Local Stock Cap -->
              <div>
                <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Local Stock Limit (Optional)
                </label>
                <input
                  v-model.number="editForm.localStockLimit"
                  type="number"
                  :placeholder="`Leave empty for full supplier stock (${selectedProduct.supplierStock} available)`"
                  class="w-full px-3.5 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                  style="outline: none !important; box-shadow: none !important;"
                />
              </div>

              <!-- Live Stock Availability Preview Card -->
              <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-2">
                <div class="flex items-center justify-between text-xs">
                  <span class="text-slate-500 dark:text-slate-400">Supplier Warehouse Stock:</span>
                  <span class="font-mono font-bold text-slate-700 dark:text-slate-300">{{ selectedProduct.supplierStock }} in stock</span>
                </div>
                <div class="flex items-center justify-between text-xs">
                  <span class="text-slate-500 dark:text-slate-400">Wallet Capacity (${{ supplierBalanceUsd }} balance):</span>
                  <span class="font-mono font-bold" :class="getProductWalletCapacity(selectedProduct) > 0 ? 'text-emerald-500' : 'text-rose-500'">
                    {{ getProductWalletCapacity(selectedProduct) }} units affordable
                  </span>
                </div>
                <div class="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-xs font-semibold">
                  <span class="text-slate-700 dark:text-slate-200">Current Sellable on Telegram Bot:</span>
                  <span class="font-mono font-bold" :class="getProductSellableStock(selectedProduct) > 0 ? 'text-emerald-500' : 'text-rose-500'">
                    {{ getProductSellableStock(selectedProduct) }} available
                  </span>
                </div>
              </div>

              <!-- Allow Customer Purchases (Storefront Switch) -->
              <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
                <div>
                  <span class="text-xs font-bold text-slate-800 dark:text-slate-200 block">Telegram Storefront Status</span>
                  <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {{ editForm.isActive ? 'Active: Customers can view and purchase on Telegram Bot' : 'Paused: Completely hidden from Telegram Bot' }}
                  </p>
                </div>
                <button
                  type="button"
                  @click="editForm.isActive = !editForm.isActive"
                  class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ml-3"
                  :class="editForm.isActive ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'"
                >
                  <span
                    class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out"
                    :class="editForm.isActive ? 'translate-x-4' : 'translate-x-0'"
                  ></span>
                </button>
              </div>
            </div>

            <!-- Modal Footer Actions -->
            <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                @click="isDrawerOpen = false"
                class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                @click="saveProductChanges"
                :disabled="isSaving"
                class="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                <i v-if="isSaving" class="pi pi-spinner animate-spin text-xs"></i>
                <span>{{ isSaving ? 'Saving...' : 'Save Product Changes' }}</span>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Confirmation Dialog Modal (Teleported to body for silky-smooth transition & full backdrop coverage) -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="confirmState.isOpen"
          class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          @click.self="!confirmState.isLoading && (confirmState.isOpen = false)"
          @keydown.escape="!confirmState.isLoading && (confirmState.isOpen = false)"
        >
          <div class="modal-card relative w-full max-w-md bg-white dark:bg-[#0e1726] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 space-y-4">
            <!-- Header Icon & Title -->
            <div class="flex items-start gap-3.5">
              <div
                class="w-11 h-11 rounded-2xl flex items-center justify-center text-lg shrink-0"
                :class="confirmState.targetActive ? 'bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/20' : 'bg-amber-500/10 text-amber-500 dark:bg-amber-500/20'"
              >
                <i :class="confirmState.confirmIcon"></i>
              </div>
              <div class="flex-1 min-w-0 pt-0.5">
                <h3 class="text-base font-bold text-slate-900 dark:text-white leading-snug">
                  {{ confirmState.title }}
                </h3>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  {{ confirmState.message }}
                </p>
              </div>
              <button
                v-if="!confirmState.isLoading"
                type="button"
                @click="confirmState.isOpen = false"
                class="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center text-[11px] transition-colors"
              >
                <i class="pi pi-times"></i>
              </button>
            </div>

            <!-- Submessage / Warning Pill Box -->
            <div
              v-if="confirmState.subMessage"
              class="p-3 rounded-2xl text-xs leading-relaxed"
              :class="confirmState.targetActive ? 'bg-emerald-50/80 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300' : 'bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 text-amber-800 dark:text-amber-300'"
            >
              <div class="flex items-start gap-2">
                <i :class="confirmState.targetActive ? 'pi pi-check-circle' : 'pi pi-exclamation-triangle'" class="text-[12px] mt-0.5 shrink-0"></i>
                <span>{{ confirmState.subMessage }}</span>
              </div>
            </div>

            <!-- Footer Action Buttons -->
            <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                @click="confirmState.isOpen = false"
                :disabled="confirmState.isLoading"
                class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                @click="executeConfirmAction"
                :disabled="confirmState.isLoading"
                class="px-5 py-2 rounded-xl text-xs font-bold shadow-lg transition-all flex items-center gap-1.5 disabled:opacity-50"
                :class="confirmState.confirmButtonClass"
              >
                <i v-if="confirmState.isLoading" class="pi pi-spinner animate-spin text-xs"></i>
                <i v-else :class="confirmState.confirmIcon" class="text-[11px]"></i>
                <span>{{ confirmState.isLoading ? 'Processing...' : confirmState.confirmText }}</span>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
@keyframes indeterminate-bar {
  0% {
    transform: translateX(-100%);
    width: 35%;
  }
  50% {
    transform: translateX(100%);
    width: 60%;
  }
  100% {
    transform: translateX(300%);
    width: 35%;
  }
}

.animate-indeterminate-bar {
  animation: indeterminate-bar 1.2s infinite ease-in-out;
}
</style>

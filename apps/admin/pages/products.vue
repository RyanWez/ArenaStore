<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useSupplierStatus } from '~/composables/useSupplierStatus'
import { useToast } from '~/composables/useToast'
import { useAuth } from '~/composables/useAuth'
import { useStoreSettings } from '~/composables/useStoreSettings'

const { isSyncing, syncCatalog: runSync } = useSupplierStatus()
const { getAuthHeaders } = useAuth()
const { settings: storeSettings, fetchSettings: fetchStoreSettings } = useStoreSettings()
const toast = useToast()
const isLoading = ref(true)

interface ProductItem {
  id: number
  upstreamProductId: number
  nameMmk: string
  rawName: string
  categoryName: string
  supplierPriceUsd: string
  retailPriceMmk: number
  sellableStock: number
  supplierStock: number
  localStockLimit: number | null
  isActive: boolean
  isWalletConstrained: boolean
  deliveryType: string
}

const searchQuery = ref('')
const selectedCategory = ref('ALL')
const stockFilter = ref('ALL')
const isDrawerOpen = ref(false)
const selectedProduct = ref<ProductItem | null>(null)
const isSaving = ref(false)

// Edit form state
const editForm = ref({
  retailPriceMmk: 0,
  marginPct: 25,
  localStockLimit: null as number | null,
  isActive: true,
})

const productsList = ref<ProductItem[]>([])

async function fetchProducts() {
  isLoading.value = true
  try {
    const res: any = await $fetch('/api/admin/products', {
      headers: getAuthHeaders(),
    })

    if (res.ok && Array.isArray(res.products)) {
      productsList.value = res.products.map((p: any) => {
        const usdCost = parseFloat(p.supplierPriceUsd) || 0
        const isConstrained = usdCost > 1.0 // If supplier balance < cost
        return {
          id: p.id,
          upstreamProductId: p.supplierProductId || p.upstreamProductId || p.id,
          nameMmk: p.nameMmk || p.name,
          rawName: p.name || p.nameMmk,
          categoryName: p.categoryName || 'General',
          supplierPriceUsd: p.supplierPriceUsd || '0.00',
          retailPriceMmk: p.retailPriceMmk || 0,
          sellableStock: p.localStockLimit !== null ? p.localStockLimit : (p.supplierStock || 999),
          supplierStock: p.supplierStock || 999,
          localStockLimit: p.localStockLimit,
          isActive: p.isActive !== false,
          isWalletConstrained: isConstrained,
          deliveryType: p.deliveryType || 'CREDENTIALS',
        }
      })
    }
  } catch (err: any) {
    toast.error('Failed to load products: ' + (err.message || 'Network error'))
  } finally {
    isLoading.value = false
  }
}

async function handleSyncCatalog() {
  try {
    await runSync()
    toast.success('Catalog synced successfully from upstream!', 'Sync Complete')
    await fetchProducts()
  } catch (err: any) {
    toast.error('Sync failed: ' + (err.message || 'Unknown error'))
  }
}

onMounted(() => {
  fetchProducts()
  fetchStoreSettings()
})

const categoriesList = computed(() => {
  const cats = new Set(productsList.value.map((p) => p.categoryName).filter(Boolean))
  return ['ALL', ...Array.from(cats)]
})

const filteredProducts = computed(() => {
  return productsList.value.filter((p) => {
    const matchesSearch =
      p.nameMmk.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      p.rawName.toLowerCase().includes(searchQuery.value.toLowerCase())

    const matchesCategory =
      selectedCategory.value === 'ALL' || p.categoryName === selectedCategory.value

    const matchesStock =
      stockFilter.value === 'ALL' ||
      (stockFilter.value === 'IN_STOCK' && p.sellableStock > 0) ||
      (stockFilter.value === 'OUT_OF_STOCK' && p.sellableStock === 0)

    return matchesSearch && matchesCategory && matchesStock
  })
})

function openEditDrawer(product: ProductItem) {
  selectedProduct.value = product
  editForm.value.retailPriceMmk = product.retailPriceMmk
  editForm.value.localStockLimit = product.localStockLimit
  editForm.value.isActive = product.isActive

  // Calculate margin % from base cost
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
  // Round to nearest 50
  editForm.value.retailPriceMmk = Math.ceil(rawPrice / 50) * 50
}

async function saveProductChanges() {
  if (!selectedProduct.value) return

  isSaving.value = true
  try {
    const res: any = await $fetch(`/api/admin/products/${selectedProduct.value.id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: {
        retailPriceMmk: editForm.value.retailPriceMmk,
        localStockLimit: editForm.value.localStockLimit,
        isActive: editForm.value.isActive,
      },
    })

    if (res.ok) {
      selectedProduct.value.retailPriceMmk = editForm.value.retailPriceMmk
      selectedProduct.value.localStockLimit = editForm.value.localStockLimit
      selectedProduct.value.isActive = editForm.value.isActive

      const productName = selectedProduct.value.nameMmk
      isDrawerOpen.value = false
      toast.success(`Pricing and stock limits saved to database for "${productName}"!`, 'Product Saved')
    } else {
      toast.error('Failed to update product: ' + (res.error || 'Server error'))
    }
  } catch (err: any) {
    toast.error('Update failed: ' + (err.message || 'Network error'))
  } finally {
    isSaving.value = false
  }
}

async function toggleProductStatus(product: ProductItem) {
  const newStatus = !product.isActive
  try {
    await $fetch(`/api/admin/products/${product.id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: {
        retailPriceMmk: product.retailPriceMmk,
        isActive: newStatus,
      },
    })
    product.isActive = newStatus
    toast.info(`Product status updated to ${newStatus ? 'Active' : 'Paused'}.`)
  } catch (err: any) {
    toast.error('Status update failed: ' + err.message)
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Top Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Products & Catalog Management
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Control MMK retail pricing, profit margins, and local sales limits for upstream digital products.
        </p>
      </div>

      <button
        type="button"
        @click="handleSyncCatalog"
        :disabled="isSyncing"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 active:scale-95 transition-all"
      >
        <i class="pi pi-sync" :class="{ 'animate-spin': isSyncing }"></i>
        <span>{{ isSyncing ? 'Syncing Catalog...' : 'Sync Upstream Catalog' }}</span>
      </button>
    </div>

    <!-- Search & Filter Controls -->
    <div class="p-4 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800/80 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
      <!-- Search Input -->
      <div class="relative w-full md:w-80">
        <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search products..."
          class="w-full pl-9 pr-4 py-2 rounded-xl text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
        />
      </div>

      <!-- Filters -->
      <div class="flex items-center gap-3 w-full md:w-auto">
        <select
          v-model="selectedCategory"
          class="px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="ALL">All Categories</option>
          <option value="AI & Developer">AI & Developer</option>
          <option value="Design & Creative">Design & Creative</option>
          <option value="Gaming">Gaming</option>
        </select>

        <select
          v-model="stockFilter"
          class="px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="ALL">All Stock Status</option>
          <option value="IN_STOCK">In Stock Only</option>
          <option value="OUT_OF_STOCK">Out of Stock</option>
        </select>
      </div>
    </div>

    <!-- Products Table -->
    <div class="rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800/80 shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse text-sm">
          <thead>
            <tr class="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase bg-slate-50/50 dark:bg-slate-950/40">
              <th class="py-3 px-4">Product Name</th>
              <th class="py-3 px-4">Category</th>
              <th class="py-3 px-4">USD Cost</th>
              <th class="py-3 px-4">MMK Retail Price</th>
              <th class="py-3 px-4">Sellable Stock</th>
              <th class="py-3 px-4">Status</th>
              <th class="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60">
            <!-- Skeleton Loading State -->
            <template v-if="isLoading">
              <tr v-for="n in 5" :key="'prod-skel-' + n">
                <td class="py-3.5 px-4"><Skeleton height="1.1rem" width="160px" class="mb-1.5" border-radius="6px" /><Skeleton height="0.9rem" width="100px" border-radius="6px" /></td>
                <td class="py-3.5 px-4"><Skeleton height="1.1rem" width="100px" border-radius="6px" /></td>
                <td class="py-3.5 px-4"><Skeleton height="1.1rem" width="60px" border-radius="6px" /></td>
                <td class="py-3.5 px-4"><Skeleton height="1.2rem" width="90px" border-radius="6px" /></td>
                <td class="py-3.5 px-4"><Skeleton height="1.1rem" width="70px" border-radius="6px" /></td>
                <td class="py-3.5 px-4"><Skeleton height="1.3rem" width="65px" border-radius="9999px" /></td>
                <td class="py-3.5 px-4 text-right"><Skeleton height="1.6rem" width="65px" class="ml-auto" border-radius="8px" /></td>
              </tr>
            </template>
            <template v-else>
              <tr
                v-for="p in filteredProducts"
                :key="p.id"
                class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
              >
              <!-- Product Name -->
              <td class="py-3.5 px-4">
                <div class="font-medium text-slate-900 dark:text-white">
                  {{ p.nameMmk }}
                </div>
                <div class="text-[11px] text-slate-400 font-mono mt-0.5">
                  ID: {{ p.upstreamProductId }} · {{ p.deliveryType }}
                </div>
              </td>

              <!-- Category -->
              <td class="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-300">
                {{ p.categoryName }}
              </td>

              <!-- Upstream USD Cost -->
              <td class="py-3.5 px-4 font-mono font-medium text-slate-700 dark:text-slate-300">
                ${{ p.supplierPriceUsd }}
              </td>

              <!-- MMK Retail Price -->
              <td class="py-3.5 px-4">
                <div class="font-bold text-slate-900 dark:text-white">
                  {{ p.retailPriceMmk.toLocaleString() }} Ks
                </div>
                <div class="text-[11px] text-emerald-600 dark:text-emerald-400">
                  Margin: ~{{ Math.round(((p.retailPriceMmk - (parseFloat(p.supplierPriceUsd) * (storeSettings.usdToMmkRate || 5000))) / (parseFloat(p.supplierPriceUsd) * (storeSettings.usdToMmkRate || 5000))) * 100) }}%
                </div>
              </td>

              <!-- Sellable Stock with Wallet Warning -->
              <td class="py-3.5 px-4">
                <div class="flex items-center gap-2">
                  <span
                    class="px-2 py-0.5 rounded-full text-xs font-semibold"
                    :class="p.sellableStock > 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'"
                  >
                    {{ p.sellableStock }} available
                  </span>
                  <span
                    v-if="p.isWalletConstrained && p.supplierStock > p.sellableStock"
                    class="text-[11px] text-amber-500 cursor-help"
                    title="Constrained by XPro wallet balance ($1.00 USD)"
                  >
                    <i class="pi pi-exclamation-triangle"></i>
                  </span>
                </div>
                <div class="text-[11px] text-slate-400 mt-0.5">
                  Supplier: {{ p.supplierStock }} in stock
                </div>
              </td>

              <!-- Active Status Toggle -->
              <td class="py-3.5 px-4">
                <button
                  type="button"
                  @click="toggleProductStatus(p)"
                  class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
                  :class="p.isActive ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'"
                >
                  <span
                    class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out"
                    :class="p.isActive ? 'translate-x-4' : 'translate-x-0'"
                  ></span>
                </button>
              </td>

              <!-- Action Edit Button -->
              <td class="py-3.5 px-4 text-right">
                <button
                  type="button"
                  @click="openEditDrawer(p)"
                  class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors"
                >
                  <i class="pi pi-pencil text-[11px]"></i>
                  <span>Edit Pricing</span>
                </button>
              </td>
            </tr>
          </template>
        </tbody>
        </table>
      </div>
    </div>

    <!-- Edit Pricing Drawer / Modal -->
    <Transition name="modal">
      <div
        v-if="isDrawerOpen && selectedProduct"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        @click.self="isDrawerOpen = false"
      >
        <div class="modal-card w-full max-w-md p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5">
          <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h3 class="font-bold text-base text-slate-900 dark:text-white">
                Edit Product Pricing
              </h3>
              <p class="text-xs text-slate-400 mt-0.5 truncate max-w-[280px]">
                {{ selectedProduct.nameMmk }}
              </p>
            </div>
            <button
              type="button"
              @click="isDrawerOpen = false"
              class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <i class="pi pi-times"></i>
            </button>
          </div>

          <div class="space-y-4 text-sm">
            <!-- Upstream Cost Info -->
            <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between text-xs">
              <span class="text-slate-500 dark:text-slate-400">Upstream USD Cost:</span>
              <span class="font-mono font-bold text-slate-800 dark:text-white">
                ${{ selectedProduct.supplierPriceUsd }} USD (~{{ (parseFloat(selectedProduct.supplierPriceUsd) * 4500).toLocaleString() }} Ks)
              </span>
            </div>

            <!-- Profit Margin Percentage -->
            <div>
              <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Desired Profit Margin (%)
              </label>
              <div class="flex items-center gap-2">
                <input
                  v-model.number="editForm.marginPct"
                  @input="recalculatePrice"
                  type="number"
                  min="0"
                  max="500"
                  class="w-full px-3 py-2 rounded-xl text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span class="text-xs text-slate-400 font-bold">%</span>
              </div>
            </div>

            <!-- Retail Price MMK -->
            <div>
              <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Final MMK Retail Price
              </label>
              <div class="relative">
                <input
                  v-model.number="editForm.retailPriceMmk"
                  type="number"
                  step="50"
                  class="w-full px-3 py-2 rounded-xl text-sm font-bold bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-semibold">MMK</span>
              </div>
            </div>

            <!-- Local Stock Cap -->
            <div>
              <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Local Stock Limit (Optional)
              </label>
              <input
                v-model.number="editForm.localStockLimit"
                type="number"
                placeholder="Leave empty for unlimited"
                class="w-full px-3 py-2 rounded-xl text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <!-- Active Switch in modal -->
            <div class="flex items-center justify-between pt-2">
              <span class="text-xs font-semibold text-slate-700 dark:text-slate-300">Allow Customer Purchases</span>
              <button
                type="button"
                @click="editForm.isActive = !editForm.isActive"
                class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out"
                :class="editForm.isActive ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'"
              >
                <span
                  class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out"
                  :class="editForm.isActive ? 'translate-x-4' : 'translate-x-0'"
                ></span>
              </button>
            </div>
          </div>

          <div class="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              @click="isDrawerOpen = false"
              class="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              @click="saveProductChanges"
              class="px-5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition-all"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

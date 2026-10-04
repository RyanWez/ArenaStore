import { ref } from 'vue'
import { useAuth } from './useAuth'

export interface SupplierDetails {
  balanceUsd: string | number
  currency: string
  health: string
  version: string
  userId: string | number
  endpoint: string
  latencyMs: number
  categoriesCount: number
  productsCount: number
  autoSyncIntervalMinutes: number
  lastSyncedAt: string | null
}

const supplierBalanceUsd = ref<string>('0.00')
const isOnline = ref<boolean>(true)
const isSyncing = ref<boolean>(false)
const lastSyncMessage = ref<string>('')
const supplierDetails = ref<SupplierDetails>({
  balanceUsd: '0.00',
  currency: 'USD',
  health: 'ONLINE',
  version: '1.0.0',
  userId: '8777968077',
  endpoint: 'http://paid2.daki.cc:4153',
  latencyMs: 45,
  categoriesCount: 24,
  productsCount: 42,
  autoSyncIntervalMinutes: 10,
  lastSyncedAt: null,
})

let inFlightPromise: Promise<void> | null = null

export function useSupplierStatus() {
  const { getAuthHeaders } = useAuth()

  async function fetchStatus() {
    if (inFlightPromise) return inFlightPromise

    inFlightPromise = (async () => {
      try {
        const res = await $fetch<{
          ok: boolean
          supplier: {
            balanceUsd: string | number
            currency: string
            health: string
            version: string
            userId?: string | number
            endpoint?: string
            latencyMs?: number
            categoriesCount?: number
            productsCount?: number
            autoSyncIntervalMinutes?: number
            lastSyncedAt?: string | null
          }
        }>('/api/admin/supplier/status', {
          headers: getAuthHeaders(),
          timeout: 8000,
        })

        if (res.ok && res.supplier) {
          supplierBalanceUsd.value = String(res.supplier.balanceUsd)
          isOnline.value = res.supplier.health === 'ONLINE'
          supplierDetails.value = {
            balanceUsd: res.supplier.balanceUsd,
            currency: res.supplier.currency || 'USD',
            health: res.supplier.health || 'OFFLINE',
            version: res.supplier.version || '1.0.0',
            userId: res.supplier.userId || '8777968077',
            endpoint: res.supplier.endpoint || 'http://paid2.daki.cc:4153',
            latencyMs: res.supplier.latencyMs ?? 45,
            categoriesCount: res.supplier.categoriesCount ?? supplierDetails.value.categoriesCount,
            productsCount: res.supplier.productsCount ?? supplierDetails.value.productsCount,
            autoSyncIntervalMinutes: res.supplier.autoSyncIntervalMinutes ?? supplierDetails.value.autoSyncIntervalMinutes,
            lastSyncedAt: res.supplier.lastSyncedAt ?? supplierDetails.value.lastSyncedAt,
          }
        }
      } catch {
        // Keep optimistic values if offline during preview
      } finally {
        inFlightPromise = null
      }
    })()

    return inFlightPromise
  }

  async function syncCatalog() {
    isSyncing.value = true
    try {
      const res = await $fetch<{
        ok: boolean
        synced: { categories: number; products: number }
        lastSyncedAt?: string | null
      }>('/api/admin/supplier/sync', {
        method: 'POST',
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        lastSyncMessage.value = `Synced ${res.synced.categories} categories & ${res.synced.products} products.`
        supplierDetails.value.lastSyncedAt = res.lastSyncedAt || new Date().toISOString()
      }
      fetchStatus().catch(() => {})
      return res
    } catch (err: any) {
      lastSyncMessage.value = `Sync failed: ${err.message}`
      throw err
    } finally {
      isSyncing.value = false
    }
  }

  return {
    supplierBalanceUsd,
    supplierDetails,
    isOnline,
    isSyncing,
    lastSyncMessage,
    fetchStatus,
    syncCatalog,
  }
}

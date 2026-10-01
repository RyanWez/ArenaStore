import { ref } from 'vue'
import { useAuth } from './useAuth'

const supplierBalanceUsd = ref<string>('1.00')
const isOnline = ref<boolean>(true)
const isSyncing = ref<boolean>(false)
const lastSyncMessage = ref<string>('')

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
          }
        }>('/api/admin/supplier/status', {
          headers: getAuthHeaders(),
          timeout: 4000,
        })

        if (res.ok && res.supplier) {
          supplierBalanceUsd.value = String(res.supplier.balanceUsd)
          isOnline.value = res.supplier.health === 'ONLINE'
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
      }>('/api/admin/supplier/sync', {
        method: 'POST',
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        lastSyncMessage.value = `Synced ${res.synced.categories} categories & ${res.synced.products} products.`
      }
      await fetchStatus()
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
    isOnline,
    isSyncing,
    lastSyncMessage,
    fetchStatus,
    syncCatalog,
  }
}

import { ref } from 'vue'
import { useAuth } from './useAuth'

export interface SupplierDetails {
  id?: string
  name?: string
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
const xproBalanceUsd = ref<string>('0.00')
const digitalcoreBalanceUsd = ref<string>('0.00')
const aivaulthubBalanceUsd = ref<string>('0.00')
const isOnline = ref<boolean>(true)
const isXProOnline = ref<boolean>(true)
const isDigitalcoreOnline = ref<boolean>(true)
const isAivaulthubOnline = ref<boolean>(true)
const isSyncing = ref<boolean>(false)
const lastSyncMessage = ref<string>('')

const suppliersList = ref<SupplierDetails[]>([
  {
    id: 'XPRO',
    name: 'XPro',
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
  },
  {
    id: 'DIGITALCORE',
    name: 'DigitalCore',
    balanceUsd: '0.00',
    currency: 'USD',
    health: 'ONLINE',
    version: '1.0.0',
    userId: 'digitalcore',
    endpoint: 'https://digitalcore.top',
    latencyMs: 50,
    categoriesCount: 1,
    productsCount: 0,
    autoSyncIntervalMinutes: 10,
    lastSyncedAt: null,
  },
  {
    id: 'AIVAULTHUB',
    name: 'AIVault Hub',
    balanceUsd: '0.00',
    currency: 'USD',
    health: 'ONLINE',
    version: '1.0.0',
    userId: 'aivaulthub',
    endpoint: 'https://reseller.aivaulthub.store/api/v1',
    latencyMs: 50,
    categoriesCount: 1,
    productsCount: 0,
    autoSyncIntervalMinutes: 10,
    lastSyncedAt: null,
  },
])

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
let lastFetchedAt = 0
const STATUS_CACHE_TTL_MS = 10000 // 10 seconds client cache TTL

export function useSupplierStatus() {
  const { getAuthHeaders } = useAuth()

  async function fetchStatus(force = false) {
    if (!force && Date.now() - lastFetchedAt < STATUS_CACHE_TTL_MS) {
      return
    }
    if (inFlightPromise) return inFlightPromise

    inFlightPromise = (async () => {
      try {
        const res = await $fetch<{
          ok: boolean
          supplier: SupplierDetails
          suppliers?: SupplierDetails[]
        }>('/api/admin/supplier/status', {
          headers: getAuthHeaders(),
          timeout: 8000,
        })

        if (res.ok) {
          lastFetchedAt = Date.now()
          if (res.supplier) {
            supplierBalanceUsd.value = String(res.supplier.balanceUsd)
            xproBalanceUsd.value = String(res.supplier.balanceUsd)
            isOnline.value = res.supplier.health === 'ONLINE'
            isXProOnline.value = res.supplier.health === 'ONLINE'
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

          if (Array.isArray(res.suppliers)) {
            suppliersList.value = res.suppliers
            const xpro = res.suppliers.find((s) => s.id === 'XPRO')
            const dc = res.suppliers.find((s) => s.id === 'DIGITALCORE')
            const avh = res.suppliers.find((s) => s.id === 'AIVAULTHUB')

            if (xpro) {
              xproBalanceUsd.value = String(xpro.balanceUsd)
              isXProOnline.value = xpro.health === 'ONLINE'
            }
            if (dc) {
              digitalcoreBalanceUsd.value = String(dc.balanceUsd)
              isDigitalcoreOnline.value = dc.health === 'ONLINE'
            }
            if (avh) {
              aivaulthubBalanceUsd.value = String(avh.balanceUsd)
              isAivaulthubOnline.value = avh.health === 'ONLINE'
            }
          }
        }
      } catch {
        // Keep optimistic values if offline
      } finally {
        inFlightPromise = null
      }
    })()

    return inFlightPromise
  }

  async function syncCatalog(supplier: 'ALL' | 'XPRO' | 'DIGITALCORE' | 'AIVAULTHUB' = 'ALL') {
    isSyncing.value = true
    try {
      const endpoint =
        supplier === 'ALL'
          ? '/api/admin/supplier/sync'
          : `/api/admin/suppliers/${supplier.toLowerCase()}/sync`

      const res = await $fetch<{
        ok: boolean
        synced: any
        lastSyncedAt?: string | null
      }>(endpoint, {
        method: 'POST',
        headers: getAuthHeaders(),
      })

      if (res.ok) {
        lastSyncMessage.value = `Catalog synced successfully for ${supplier}.`
        if (res.lastSyncedAt) {
          supplierDetails.value.lastSyncedAt = res.lastSyncedAt
        }
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
    xproBalanceUsd,
    digitalcoreBalanceUsd,
    aivaulthubBalanceUsd,
    isOnline,
    isXProOnline,
    isDigitalcoreOnline,
    isAivaulthubOnline,
    suppliersList,
    supplierDetails,
    isSyncing,
    lastSyncMessage,
    fetchStatus,
    syncCatalog,
  }
}

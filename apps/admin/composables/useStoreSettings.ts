import { useState } from '#imports'
import { useAuth } from '~/composables/useAuth'

export interface StoreSettings {
  usdToMmkRate: number
  defaultMarginPct: number
  orderTimeoutMinutes: number
  supportTelegramHandle: string
  isMaintenanceMode: boolean
  kpayAccountName: string
  kpayPhone: string
  wavepayAccountName: string
  wavepayPhone: string
  ayapayAccountName: string
  ayapayPhone: string
  uabpayAccountName: string
  uabpayPhone: string
}

export const defaultSettings: StoreSettings = {
  usdToMmkRate: 4500,
  defaultMarginPct: 25,
  orderTimeoutMinutes: 15,
  supportTelegramHandle: '@ArenaStoreSupport',
  isMaintenanceMode: false,
  kpayAccountName: 'Arena Digital Services',
  kpayPhone: '09 987 654 321',
  wavepayAccountName: 'Arena Store',
  wavepayPhone: '09 789 123 456',
  ayapayAccountName: 'Arena Store',
  ayapayPhone: '09 987 654 321',
  uabpayAccountName: 'Arena Store',
  uabpayPhone: '09 789 123 456',
}

export function useStoreSettings() {
  const { getAuthHeaders } = useAuth()
  const settings = useState<StoreSettings>('arena_store_settings', () => ({ ...defaultSettings }))
  const isLoading = useState<boolean>('arena_store_settings_loading', () => false)
  const isSaving = useState<boolean>('arena_store_settings_saving', () => false)
  const hasLoaded = useState<boolean>('arena_store_settings_loaded', () => false)

  async function fetchSettings(force = false) {
    if (hasLoaded.value && !force) return
    isLoading.value = true
    try {
      const res: any = await $fetch('/api/admin/settings', {
        headers: getAuthHeaders(),
      })
      if (res.ok && res.settings) {
        settings.value = {
          usdToMmkRate: Number(res.settings.usdToMmkRate) || defaultSettings.usdToMmkRate,
          defaultMarginPct: Number(res.settings.defaultMarginPct) || defaultSettings.defaultMarginPct,
          orderTimeoutMinutes: Number(res.settings.orderTimeoutMinutes) || defaultSettings.orderTimeoutMinutes,
          supportTelegramHandle: res.settings.supportTelegramHandle || defaultSettings.supportTelegramHandle,
          isMaintenanceMode: res.settings.isMaintenanceMode === 'true',
          kpayAccountName: res.settings.kpayAccountName || defaultSettings.kpayAccountName,
          kpayPhone: res.settings.kpayPhone || defaultSettings.kpayPhone,
          wavepayAccountName: res.settings.wavepayAccountName || defaultSettings.wavepayAccountName,
          wavepayPhone: res.settings.wavepayPhone || defaultSettings.wavepayPhone,
          ayapayAccountName: res.settings.ayapayAccountName || defaultSettings.ayapayAccountName,
          ayapayPhone: res.settings.ayapayPhone || defaultSettings.ayapayPhone,
          uabpayAccountName: res.settings.uabpayAccountName || defaultSettings.uabpayAccountName,
          uabpayPhone: res.settings.uabpayPhone || defaultSettings.uabpayPhone,
        }
        hasLoaded.value = true
      }
    } catch (err: any) {
      console.warn('Failed to load store settings:', err)
    } finally {
      isLoading.value = false
    }
  }

  async function saveSettings(newSettings: Partial<StoreSettings>) {
    isSaving.value = true
    try {
      const payload: Record<string, string> = {}
      for (const [key, val] of Object.entries(newSettings)) {
        payload[key] = String(val)
      }
      const res: any = await $fetch('/api/admin/settings', {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: payload,
      })
      if (res.ok) {
        settings.value = {
          ...settings.value,
          ...newSettings,
        }
        return { success: true }
      }
      return { success: false, error: res.error || 'Failed to save settings' }
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error saving settings' }
    } finally {
      isSaving.value = false
    }
  }

  return {
    settings,
    isLoading,
    isSaving,
    hasLoaded,
    fetchSettings,
    saveSettings,
  }
}

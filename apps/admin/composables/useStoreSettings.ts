import { useState } from '#imports'
import { useAuth } from '~/composables/useAuth'

export interface StoreSettings {
  usdToMmkRate: number
  defaultMarginPct: number
  orderTimeoutMinutes: number
  supportTelegramHandle: string
  isMaintenanceMode: boolean
  restockNotificationsEnabled: boolean
  kpayAccountName: string
  kpayPhone: string
  wavepayAccountName: string
  wavepayPhone: string
  ayapayAccountName: string
  ayapayPhone: string
  uabpayAccountName: string
  uabpayPhone: string
  telegramGroupChatId: string
  telegramDepositTopicId: string
  telegramBotAlertTopicId: string
  telegramAdminMentions: string
  telegramApproverIds: string
  balanceAlertThresholdUsd: number
}

export const defaultSettings: StoreSettings = {
  usdToMmkRate: 4500,
  defaultMarginPct: 25,
  orderTimeoutMinutes: 15,
  supportTelegramHandle: '@ArenaStoreSupport',
  isMaintenanceMode: false,
  restockNotificationsEnabled: true,
  kpayAccountName: 'Arena Digital Services',
  kpayPhone: '09 987 654 321',
  wavepayAccountName: 'Arena Store',
  wavepayPhone: '09 789 123 456',
  ayapayAccountName: 'Arena Store',
  ayapayPhone: '09 987 654 321',
  uabpayAccountName: 'Arena Store',
  uabpayPhone: '09 789 123 456',
  telegramGroupChatId: '',
  telegramDepositTopicId: '',
  telegramBotAlertTopicId: '',
  telegramAdminMentions: '',
  telegramApproverIds: '',
  balanceAlertThresholdUsd: 5,
}

export function useStoreSettings() {
  const { getAuthHeaders } = useAuth()
  const settings = useState<StoreSettings>('arena_store_settings', () => ({ ...defaultSettings }))
  const isLoading = useState<boolean>('arena_store_settings_loading', () => false)
  const isSaving = useState<boolean>('arena_store_settings_saving', () => false)
  const hasLoaded = useState<boolean>('arena_store_settings_loaded', () => false)
  // Keys the server actually returned for this role (settings GET is filtered
  // by permission). Saves only include these, so a role without, say,
  // settings.payments never echoes payment-account keys back in a PUT.
  const visibleKeys = useState<Set<string>>('arena_store_settings_visible_keys', () => new Set())

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
          restockNotificationsEnabled: res.settings.restockNotificationsEnabled !== 'false',
          kpayAccountName: res.settings.kpayAccountName || defaultSettings.kpayAccountName,
          kpayPhone: res.settings.kpayPhone || defaultSettings.kpayPhone,
          wavepayAccountName: res.settings.wavepayAccountName || defaultSettings.wavepayAccountName,
          wavepayPhone: res.settings.wavepayPhone || defaultSettings.wavepayPhone,
          ayapayAccountName: res.settings.ayapayAccountName || defaultSettings.ayapayAccountName,
          ayapayPhone: res.settings.ayapayPhone || defaultSettings.ayapayPhone,
          uabpayAccountName: res.settings.uabpayAccountName || defaultSettings.uabpayAccountName,
          uabpayPhone: res.settings.uabpayPhone || defaultSettings.uabpayPhone,
          telegramGroupChatId: res.settings.telegramGroupChatId || '',
          telegramDepositTopicId: res.settings.telegramDepositTopicId || '',
          telegramBotAlertTopicId: res.settings.telegramBotAlertTopicId || '',
          telegramAdminMentions: res.settings.telegramAdminMentions || '',
          telegramApproverIds: res.settings.telegramApproverIds || '',
          balanceAlertThresholdUsd: Number(res.settings.balanceAlertThresholdUsd || res.settings['supplier.balanceAlertThresholdUsd'] || 5),
        }
        visibleKeys.value = new Set(Object.keys(res.settings))
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
        // Never send keys this role could not even see (the API would 403).
        if (visibleKeys.value.size > 0 && !visibleKeys.value.has(key)) continue
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

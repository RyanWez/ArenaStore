<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useToast } from '~/composables/useToast'
import { useAuth } from '~/composables/useAuth'
import { useStoreSettings } from '~/composables/useStoreSettings'
import { usePermission } from '~/composables/usePermission'

const toast = useToast()
const { getAuthHeaders, getTotpSetup, verifyTotpCode } = useAuth()
const { settings, fetchSettings, saveSettings, isSaving, isLoading } = useStoreSettings()
const { can } = usePermission()

// Granular card-level permissions
const canEditPayments = computed(() => can('settings.payments'))
const canEditOperations = computed(() => can('settings.operations'))
const canEditAnySettings = computed(() => canEditPayments.value || canEditOperations.value)

// Section-level saving indicator ('payments' | 'rules' | 'relay' | 'all')
const savingSection = ref<string | null>(null)
const showSuccessBanner = ref(false)
const bannerMessage = ref('')
const isTestingGroupNotify = ref(false)

// Password Change State
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const showCurrentPw = ref(false)
const showNewPw = ref(false)
const isChangingPassword = ref(false)
const passwordError = ref('')
const passwordSuccess = ref('')

// 2FA / TOTP State
const isTotpModalOpen = ref(false)
const isLoadingTotp = ref(false)
const totpData = ref<{ isEnabled: boolean; secret: string; uri: string; qrDataUrl: string | null; issuer: string } | null>(null)
const testTotpCode = ref('')
const isTestingTotp = ref(false)
const testTotpResult = ref<{ valid?: boolean; message?: string } | null>(null)
const isKeyCopied = ref(false)

async function fetchTotpSetup() {
  isLoadingTotp.value = true
  try {
    const res = await getTotpSetup()
    if (res.success && res.data) {
      totpData.value = res.data
    } else {
      console.warn('Could not load 2FA configuration:', res.error)
    }
  } finally {
    isLoadingTotp.value = false
  }
}

async function openTotpModal() {
  testTotpCode.value = ''
  testTotpResult.value = null
  isTotpModalOpen.value = true
  await fetchTotpSetup()
}

function closeTotpModal() {
  isTotpModalOpen.value = false
}

async function copyTotpKey() {
  if (!totpData.value?.secret) return
  try {
    await navigator.clipboard.writeText(totpData.value.secret)
    isKeyCopied.value = true
    toast.success('2FA Setup Key copied to clipboard!', 'Copied')
    setTimeout(() => {
      isKeyCopied.value = false
    }, 3000)
  } catch {
    toast.error('Failed to copy to clipboard')
  }
}

async function handleTestTotpCode() {
  if (!testTotpCode.value || testTotpCode.value.trim().length !== 6) {
    testTotpResult.value = {
      valid: false,
      message: 'Please enter a valid 6-digit code.',
    }
    return
  }

  isTestingTotp.value = true
  testTotpResult.value = null
  try {
    const res = await verifyTotpCode(testTotpCode.value.trim())
    if (res.success) {
      testTotpResult.value = {
        valid: res.valid,
        message: res.message,
      }
      if (res.valid) {
        toast.success('Authenticator code verified successfully!')
      } else {
        toast.error('Invalid 2FA code. Please check device time and retry.')
      }
    } else {
      testTotpResult.value = {
        valid: false,
        message: res.error || 'Verification failed.',
      }
    }
  } finally {
    isTestingTotp.value = false
  }
}

onMounted(async () => {
  await Promise.all([
    fetchSettings(true),
    fetchTotpSetup(),
  ])
})


function triggerSuccessBanner(msg: string) {
  bannerMessage.value = msg
  showSuccessBanner.value = true
  setTimeout(() => {
    showSuccessBanner.value = false
  }, 4500)
}

// 1. Save only Myanmar Payment Accounts card
async function handleSavePayments() {
  if (!canEditPayments.value) {
    toast.error('Permission denied: You cannot edit payment accounts.')
    return
  }

  savingSection.value = 'payments'
  try {
    const res = await saveSettings({
      kpayAccountName: settings.value.kpayAccountName,
      kpayPhone: settings.value.kpayPhone,
      wavepayAccountName: settings.value.wavepayAccountName,
      wavepayPhone: settings.value.wavepayPhone,
      ayapayAccountName: settings.value.ayapayAccountName,
      ayapayPhone: settings.value.ayapayPhone,
      uabpayAccountName: settings.value.uabpayAccountName,
      uabpayPhone: settings.value.uabpayPhone,
    })

    if (res.success) {
      toast.success('Myanmar payment accounts saved successfully!', 'Payments Updated')
      triggerSuccessBanner('Payment accounts successfully saved to database & updated for Telegram Bot checkouts!')
    } else {
      toast.error('Failed to save payments: ' + (res.error || 'Unknown error'))
    }
  } finally {
    savingSection.value = null
  }
}

// 2. Save Customer Support & Store Rules card
async function handleSaveRules() {
  if (!canEditOperations.value) {
    toast.error('Permission denied: You cannot edit store rules.')
    return
  }

  savingSection.value = 'rules'
  try {
    const res = await saveSettings({
      supportTelegramHandle: settings.value.supportTelegramHandle,
      orderTimeoutMinutes: settings.value.orderTimeoutMinutes,
      isMaintenanceMode: settings.value.isMaintenanceMode,
      restockNotificationsEnabled: settings.value.restockNotificationsEnabled,
      balanceAlertThresholdUsd: settings.value.balanceAlertThresholdUsd,
    })

    if (res.success) {
      toast.success('Customer support handle and store operating rules saved!', 'Store Rules Updated')
      triggerSuccessBanner('Customer support and operating rules updated successfully!')
    } else {
      toast.error('Failed to save store rules: ' + (res.error || 'Unknown error'))
    }
  } finally {
    savingSection.value = null
  }
}

// 3. Save Telegram Deposit Relay card
async function handleSaveRelay() {
  if (!canEditOperations.value) {
    toast.error('Permission denied: You cannot edit Arena Store Group settings.')
    return
  }

  savingSection.value = 'relay'
  try {
    const res = await saveSettings({
      telegramGroupChatId: settings.value.telegramGroupChatId,
      telegramDepositTopicId: settings.value.telegramDepositTopicId,
      telegramBotAlertTopicId: settings.value.telegramBotAlertTopicId,
      telegramAdminMentions: settings.value.telegramAdminMentions,
      telegramApproverIds: settings.value.telegramApproverIds,
    })

    if (res.success) {
      toast.success('Arena Store Group settings saved!', 'Group Settings Updated')
      triggerSuccessBanner('Arena Store Group settings (slip relay, Bot Alert topic, mentions) successfully saved!')
    } else {
      toast.error('Failed to save group settings: ' + (res.error || 'Unknown error'))
    }
  } finally {
    savingSection.value = null
  }
}

// 4. Save All Permitted Settings (Header Action)
async function handleSaveAll() {
  if (!canEditAnySettings.value) {
    toast.error('Permission denied: No settings edit permissions granted.')
    return
  }

  savingSection.value = 'all'
  try {
    const payload: Record<string, any> = {}

    if (canEditPayments.value) {
      payload.kpayAccountName = settings.value.kpayAccountName
      payload.kpayPhone = settings.value.kpayPhone
      payload.wavepayAccountName = settings.value.wavepayAccountName
      payload.wavepayPhone = settings.value.wavepayPhone
      payload.ayapayAccountName = settings.value.ayapayAccountName
      payload.ayapayPhone = settings.value.ayapayPhone
      payload.uabpayAccountName = settings.value.uabpayAccountName
      payload.uabpayPhone = settings.value.uabpayPhone
    }

    if (canEditOperations.value) {
      payload.supportTelegramHandle = settings.value.supportTelegramHandle
      payload.orderTimeoutMinutes = settings.value.orderTimeoutMinutes
      payload.isMaintenanceMode = settings.value.isMaintenanceMode
      payload.restockNotificationsEnabled = settings.value.restockNotificationsEnabled
      payload.telegramGroupChatId = settings.value.telegramGroupChatId
      payload.telegramDepositTopicId = settings.value.telegramDepositTopicId
      payload.telegramBotAlertTopicId = settings.value.telegramBotAlertTopicId
      payload.telegramAdminMentions = settings.value.telegramAdminMentions
      payload.telegramApproverIds = settings.value.telegramApproverIds
    }

    const res = await saveSettings(payload)
    if (res.success) {
      toast.success('All permitted store settings saved successfully!', 'Settings Saved')
      triggerSuccessBanner('All permitted store settings updated and synced across Telegram Bot!')
    } else {
      toast.error('Failed to save settings: ' + (res.error || 'Unknown error'))
    }
  } finally {
    savingSection.value = null
  }
}

// Test Telegram Group Relay
async function handleTestGroupNotify() {
  if (!settings.value.telegramGroupChatId.trim()) {
    toast.error('Group Chat ID အရင်ထည့်ပါဆာ။', 'Deposit Relay')
    return
  }
  isTestingGroupNotify.value = true
  try {
    const res: any = await $fetch('/api/admin/settings/test-group-notify', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: {
        chatId: settings.value.telegramGroupChatId,
        topicId: settings.value.telegramDepositTopicId,
        mentions: settings.value.telegramAdminMentions,
      },
    })
    if (res.ok) {
      toast.success(res.message || 'Test message delivered', 'Deposit Relay')
    } else {
      toast.error(res.error || 'Test failed', 'Deposit Relay')
    }
  } catch (err: any) {
    toast.error(err?.data?.error || err?.message || 'Test failed', 'Deposit Relay')
  } finally {
    isTestingGroupNotify.value = false
  }
}

// Change Admin Password
async function handleChangePassword() {
  passwordError.value = ''
  passwordSuccess.value = ''

  if (!currentPassword.value || !newPassword.value || !confirmPassword.value) {
    passwordError.value = 'Please fill in all password fields.'
    return
  }

  if (newPassword.value.length < 8) {
    passwordError.value = 'New password must be at least 8 characters long.'
    return
  }

  if (newPassword.value !== confirmPassword.value) {
    passwordError.value = 'New password and confirmation do not match.'
    return
  }

  isChangingPassword.value = true
  try {
    const res: any = await $fetch('/api/admin/auth/change-password', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: {
        currentPassword: currentPassword.value,
        newPassword: newPassword.value,
      },
    })

    if (res.ok) {
      passwordSuccess.value = 'Password changed successfully! Keep your new password secure.'
      toast.success('Admin password updated successfully!', 'Security Updated')
      currentPassword.value = ''
      newPassword.value = ''
      confirmPassword.value = ''
    } else {
      passwordError.value = res.error || 'Failed to update password.'
      toast.error(passwordError.value)
    }
  } catch (err: any) {
    const msg = err.data?.error || err.message || 'Error changing password'
    passwordError.value = msg
    toast.error(msg)
  } finally {
    isChangingPassword.value = false
  }
}
</script>

<template>
  <div class="space-y-6 max-w-5xl mx-auto pb-12">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-bold text-base">
            <i class="pi pi-cog"></i>
          </div>
          Store Settings (ဆိုင်အထွေထွေ ပြင်ဆင်ချက်များ)
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Manage Myanmar payment accounts, Telegram bot operations, order reservation timeouts, and admin password
        </p>
      </div>

      <div class="flex items-center gap-2.5 shrink-0">
        <button
          type="button"
          @click="fetchSettings(true)"
          :disabled="isLoading"
          title="Reload latest settings from database"
          class="px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-all flex items-center gap-1.5 cursor-pointer"
        >
          <i class="pi pi-sync text-xs" :class="{ 'animate-spin': isLoading }"></i>
          <span class="hidden sm:inline">Refresh</span>
        </button>

        <button
          v-if="canEditAnySettings"
          type="button"
          @click="handleSaveAll"
          :disabled="savingSection !== null || isSaving"
          class="px-5 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-md shadow-indigo-600/20 flex items-center gap-2 disabled:opacity-50 cursor-pointer"
        >
          <i v-if="savingSection === 'all'" class="pi pi-spin pi-spinner text-xs"></i>
          <i v-else class="pi pi-check text-xs"></i>
          <span>{{ savingSection === 'all' ? 'Saving All...' : 'Save All Permitted Settings' }}</span>
        </button>
      </div>
    </div>

    <!-- Success Toast Banner -->
    <div
      v-if="showSuccessBanner"
      class="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center justify-between shadow-sm animate-fade-in"
    >
      <div class="flex items-center gap-2">
        <i class="pi pi-check-circle text-base text-emerald-500"></i>
        <span>{{ bannerMessage }}</span>
      </div>
      <button type="button" @click="showSuccessBanner = false" class="hover:opacity-75 cursor-pointer">
        <i class="pi pi-times text-xs"></i>
      </button>
    </div>

    <!-- CARD 1: Myanmar Payment Accounts (hidden entirely without settings.payments) -->
    <div v-if="canEditPayments" class="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6">
      <div class="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-bold text-sm">
            <i class="pi pi-credit-card"></i>
          </div>
          <div>
            <h2 class="text-base font-bold text-slate-900 dark:text-white">Payment Accounts (ငွေလက်ခံမည့် အကောင့်များ)</h2>
            <p class="text-xs text-slate-500">Displayed dynamically to customers in Telegram Bot during wallet top-ups and checkouts</p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <span
            class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1"
          >
            <i class="pi pi-check-circle text-[10px]"></i>
            Editable
          </span>
        </div>
      </div>

      <fieldset class="space-y-6 min-w-0">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- KBZPay Card -->
          <div class="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 space-y-3">
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 rounded-full bg-blue-600"></span>
              <span class="font-bold text-sm text-blue-950 dark:text-blue-200">KBZPay (KPay)</span>
            </div>
            <div class="space-y-2">
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">Account Name</label>
                <input
                  v-model="settings.kpayAccountName"
                  type="text"
                  required
                  placeholder="e.g. Arena Digital Services"
                  class="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">Phone Number</label>
                <input
                  v-model="settings.kpayPhone"
                  type="text"
                  required
                  placeholder="09 987 654 321"
                  class="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900 rounded-lg text-xs font-mono font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <!-- WavePay Card -->
          <div class="p-4 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 space-y-3">
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 rounded-full bg-amber-500"></span>
              <span class="font-bold text-sm text-amber-950 dark:text-amber-200">WavePay</span>
            </div>
            <div class="space-y-2">
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">Account Name</label>
                <input
                  v-model="settings.wavepayAccountName"
                  type="text"
                  required
                  placeholder="e.g. Arena Store"
                  class="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">Phone Number</label>
                <input
                  v-model="settings.wavepayPhone"
                  type="text"
                  required
                  placeholder="09 789 123 456"
                  class="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900 rounded-lg text-xs font-mono font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
            </div>
          </div>

          <!-- AYA Pay Card -->
          <div class="p-4 rounded-xl bg-red-50/50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 space-y-3">
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 rounded-full bg-red-600"></span>
              <span class="font-bold text-sm text-red-950 dark:text-red-200">AYA Pay</span>
            </div>
            <div class="space-y-2">
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">Account Name</label>
                <input
                  v-model="settings.ayapayAccountName"
                  type="text"
                  placeholder="e.g. Arena Store"
                  class="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">Phone Number</label>
                <input
                  v-model="settings.ayapayPhone"
                  type="text"
                  placeholder="09 987 654 321"
                  class="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900 rounded-lg text-xs font-mono font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>
            </div>
          </div>

          <!-- UAB Pay Card -->
          <div class="p-4 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/50 space-y-3">
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 rounded-full bg-purple-600"></span>
              <span class="font-bold text-sm text-purple-950 dark:text-purple-200">UAB Pay</span>
            </div>
            <div class="space-y-2">
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">Account Name</label>
                <input
                  v-model="settings.uabpayAccountName"
                  type="text"
                  placeholder="e.g. Arena Store"
                  class="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-900 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">Phone Number</label>
                <input
                  v-model="settings.uabpayPhone"
                  type="text"
                  placeholder="09 789 123 456"
                  class="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-900 rounded-lg text-xs font-mono font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Inline Save Action for Payments Card -->
        <div class="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800/80">
          <span class="text-[11px] text-slate-400">Save changes to Myanmar bank & wallet numbers</span>
          <button
            type="button"
            @click="handleSavePayments"
            :disabled="savingSection !== null || isSaving"
            class="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-sm flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <i v-if="savingSection === 'payments'" class="pi pi-spin pi-spinner text-xs"></i>
            <i v-else class="pi pi-check text-xs"></i>
            <span>{{ savingSection === 'payments' ? 'Saving Payments...' : 'Save Payment Accounts' }}</span>
          </button>
        </div>
      </fieldset>
    </div>

    <!-- CARD 2: Customer Support & Store Operating Rules (hidden entirely without settings.operations) -->
    <div v-if="canEditOperations" class="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6">
      <div class="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold text-sm">
            <i class="pi pi-headphones"></i>
          </div>
          <div>
            <h2 class="text-base font-bold text-slate-900 dark:text-white">Customer Support & Store Rules (ဖောက်သည် ဝန်ဆောင်မှုနှင့် စည်းမျဉ်းများ)</h2>
            <p class="text-xs text-slate-500">Contact endpoints, reservation timeout rules, and maintenance status</p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <span
            class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1"
          >
            <i class="pi pi-check-circle text-[10px]"></i>
            Editable
          </span>
        </div>
      </div>

      <fieldset class="space-y-6 min-w-0">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Support Handle -->
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Customer Support Telegram Handle
            </label>
            <input
              v-model="settings.supportTelegramHandle"
              type="text"
              required
              placeholder="@ArenaStoreSupport"
              class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
            <p class="text-[11px] text-slate-400">Attached to order confirmations and /help messages in Telegram Bot</p>
          </div>

          <!-- Order Reservation Timeout -->
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Payment Submission Timeout (Minutes)
            </label>
            <div class="relative">
              <input
                v-model.number="settings.orderTimeoutMinutes"
                type="number"
                min="5"
                max="60"
                required
                class="w-full pl-4 pr-16 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
              <span class="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                mins
              </span>
            </div>
            <p class="text-[11px] text-slate-400">Time window allowed for customers to upload payment slip receipts</p>
          </div>

          <!-- Supplier Low-Balance Alert Threshold -->
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
              <span>Supplier Low-Balance Alert Threshold (USD)</span>
              <span class="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">Auto-Alert</span>
            </label>
            <div class="relative">
              <input
                v-model.number="settings.balanceAlertThresholdUsd"
                type="number"
                min="1"
                max="100"
                step="0.5"
                required
                class="w-full pl-4 pr-16 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
              <span class="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                USD
              </span>
            </div>
            <p class="text-[11px] text-slate-400">Telegram Admin Alert triggers when XPro or DigitalCore balance drops below this amount (default: $5.00)</p>
          </div>
        </div>

        <!-- Restock Notifications Toggle -->
        <label class="flex items-start gap-3 cursor-pointer select-none">
          <input
            v-model="settings.restockNotificationsEnabled"
            type="checkbox"
            class="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/30"
          />
          <span>
            <span class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Restock Notifications (ပြန်ရနိုင်တဲ့ အချက်ပေးစာများ)
            </span>
            <span class="block text-[11px] text-slate-400">
              Product တစ်ခု ပြန်ရနိုင်သည့်အခါ (supplier restock သို့မဟုတ် wallet/limit ဖြည့်ခြင်း) bot user အားလုံးကို
              "Restocked!" notification ပို့သည်။ Catalog sync တစ်ခေါက် (default 10 မိနစ်) တစ်ခါ စစ်ဆေးသည်။
            </span>
          </span>
        </label>

        <!-- Maintenance Mode Toggle -->
        <div
          class="p-4 rounded-xl border transition-colors"
          :class="settings.isMaintenanceMode
            ? 'bg-amber-500/10 border-amber-500/30 dark:bg-amber-950/20 dark:border-amber-500/30'
            : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <span class="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <i class="pi pi-wrench text-xs text-amber-500"></i>
                  Maintenance Mode (စနစ် ပြုပြင်ထိန်းသိမ်းမှု Mode)
                </span>
                <span
                  class="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border"
                  :class="settings.isMaintenanceMode
                    ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30'
                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'"
                >
                  {{ settings.isMaintenanceMode ? 'Active (ဖွင့်ထားသည်)' : 'Offline (ပိတ်ထားသည်)' }}
                </span>
              </div>
              <p class="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                ဖွင့်ထားပါက customer များ Telegram Bot တွင် ဈေးဝယ်ခြင်း၊ အော်ဒါကြည့်ခြင်းနှင့် ငွေဖြည့်သွင်းခြင်းတို့ကို ယာယီ ရပ်ဆိုင်းထားမည်ဖြစ်ပြီး
                ပြုပြင်ထိန်းသိမ်းမှု အသိပေးစာ ပြသပေးပါမည်။ <b>(Admin များသာ Bot အား စမ်းသပ်အသုံးပြုနိုင်ပါမည်)</b>
              </p>
            </div>

            <label class="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
              <input
                type="checkbox"
                v-model="settings.isMaintenanceMode"
                class="sr-only peer"
              />
              <div
                class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-amber-500"
              ></div>
            </label>
          </div>
        </div>

        <!-- Inline Save Action for Support & Rules -->
        <div class="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800/80">
          <span class="text-[11px] text-slate-400">Save changes to support handle and payment timeout</span>
          <button
            type="button"
            @click="handleSaveRules"
            :disabled="savingSection !== null || isSaving"
            class="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-sm flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <i v-if="savingSection === 'rules'" class="pi pi-spin pi-spinner text-xs"></i>
            <i v-else class="pi pi-check text-xs"></i>
            <span>{{ savingSection === 'rules' ? 'Saving Rules...' : 'Save Store Rules' }}</span>
          </button>
        </div>
      </fieldset>
    </div>

    <!-- CARD 3: Arena Store Group settings — group id, slip relay + bot alert topics, mentions, approvers (hidden entirely without settings.operations) -->
    <div v-if="canEditOperations" class="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6">
      <div class="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center font-bold text-sm">
            <i class="pi pi-send"></i>
          </div>
          <div>
            <h2 class="text-base font-bold text-slate-900 dark:text-white">Arena Store Group (Group ဆက်တင်များ)</h2>
            <p class="text-xs text-slate-500">Group ID တစ်ခုတည်း + ရည်ရွယ်ချက်အလိုက် Topic ID များ — payment slip relay, Bot Alert topic နှင့် admin mentions</p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <span
            class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1"
          >
            <i class="pi pi-check-circle text-[10px]"></i>
            Editable
          </span>
        </div>
      </div>

      <fieldset class="space-y-4 min-w-0">
        <p class="text-[11px] text-slate-500">
          Group ID တစ်ခုတည်း သတ်မှတ်ပြီး ရည်ရွယ်ချက်အလိုက် Topic ID များ ဖြည့်ပါ — ဝယ်ယူသူတိုင်း၏
          payment slip ကို Deposit Topic ထဲသို့၊ Bot Alert များကို Bot Alert Topic ထဲသို့ bot က အလိုအလျောက် ပို့ပေးပါမည်။
          Bot ကို group admin အဖြစ် ထည့်ထားရပါမည်။ Group ID သည် <code>-100…</code> ပုံစံဖြစ်ပြီး
          Topic ID မှာ topic link (<code>t.me/c/xxx/&lt;TopicID&gt;</code>) ထဲက နံပါတ်ဖြစ်သည် — စွန့်ခွာထားလျှင် General သို့ ပို့မည်။
        </p>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">Group Chat ID</label>
            <input
              v-model="settings.telegramGroupChatId"
              type="text"
              placeholder="-1001234567890"
              class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">Deposit Topic ID (message_thread_id)</label>
            <input
              v-model="settings.telegramDepositTopicId"
              type="text"
              placeholder="e.g. 42 (empty = General)"
              class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">Bot Alert Topic ID (message_thread_id)</label>
            <input
              v-model="settings.telegramBotAlertTopicId"
              type="text"
              placeholder="e.g. 59 (empty = General)"
              class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <p class="text-[11px] text-slate-400">
              Low Supplier Balance Alert စသည့် Bot Alert များ ပို့မည့် topic — စွန့်ခွာထားလျှင် General သို့ ပို့မည်။
            </p>
          </div>
        </div>

        <div class="space-y-1.5">
          <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">Admin Mentions (Slip အောက်ဆုံးမှာ @ခေါ်ရမည်သူများ)</label>
          <input
            v-model="settings.telegramAdminMentions"
            type="text"
            placeholder="e.g. ryanwez, H_M_A_2026"
            class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <p class="text-[11px] text-slate-400">
            Telegram username များကို comma/spacing ဖြင့် ခွာထားပါ — slip တိုင်း၏ အောက်ဆုံးတွင်
            <code>@ryanwez | @H_M_A_2026</code> ပုံစံ ပေါ်မည့်အပြင် ၎င်းတို့ notification ရရှိပါမည်။
          </p>
        </div>

        <div class="space-y-1.5">
          <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">Deposit Approvers Allowlist (Telegram User IDs / Usernames)</label>
          <input
            v-model="settings.telegramApproverIds"
            type="text"
            placeholder="e.g. 123456789, ryanwez (အလွတ် = group အတွင်း မည်သူမဆို အတည်ပြုနိုင်သည်)"
            class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <p class="text-[11px] text-slate-400">
            အတည်ပြုခွင့်ရှိသူများ၏ Telegram ID သို့မဟုတ် Username များကို comma/space ဖြင့် ခွာ၍ ထည့်ပါ။ (အလွတ်ထားပါက group အတွင်း မည်သူမဆို အတည်ပြုနိုင်သည်)
          </p>
        </div>

        <!-- Inline Actions for Relay Card -->
        <div class="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800/80">
          <button
            type="button"
            :disabled="isTestingGroupNotify"
            class="px-3.5 py-2 rounded-xl text-xs font-semibold bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/30 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            @click="handleTestGroupNotify"
          >
            <i v-if="isTestingGroupNotify" class="pi pi-spin pi-spinner text-xs"></i>
            <i v-else class="pi pi-paperplane text-xs"></i>
            <span>{{ isTestingGroupNotify ? 'Testing...' : 'Send Test Post' }}</span>
          </button>

          <button
            type="button"
            @click="handleSaveRelay"
            :disabled="savingSection !== null || isSaving"
            class="px-4 py-2 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white transition-all shadow-sm flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <i v-if="savingSection === 'relay'" class="pi pi-spin pi-spinner text-xs"></i>
            <i v-else class="pi pi-check text-xs"></i>
            <span>{{ savingSection === 'relay' ? 'Saving Group Settings...' : 'Save Group Settings' }}</span>
          </button>
        </div>
      </fieldset>
    </div>

    <!-- CARD 4: Admin Security & Password Change -->
    <div class="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6">
      <div class="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center font-bold text-sm">
            <i class="pi pi-lock"></i>
          </div>
          <div>
            <h2 class="text-base font-bold text-slate-900 dark:text-white">Admin Security & Password (လျှို့ဝှက်နံပါတ် ပြောင်းလဲခြင်း)</h2>
            <p class="text-xs text-slate-500">Update your administrator password securely. Must be at least 8 characters long.</p>
          </div>
        </div>
        <span class="px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/20">
          scrypt Encrypted
        </span>
      </div>

      <!-- Password Error Alert -->
      <div
        v-if="passwordError"
        class="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5"
      >
        <i class="pi pi-exclamation-circle text-rose-400"></i>
        <span>{{ passwordError }}</span>
      </div>

      <!-- Password Success Alert -->
      <div
        v-if="passwordSuccess"
        class="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5"
      >
        <i class="pi pi-check-circle text-emerald-400"></i>
        <span>{{ passwordSuccess }}</span>
      </div>

      <form @submit.prevent="handleChangePassword" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <!-- Current Password -->
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Current Password (လက်ရှိ လျှို့ဝှက်နံပါတ်)
            </label>
            <div class="relative">
              <input
                v-model="currentPassword"
                :type="showCurrentPw ? 'text' : 'password'"
                required
                autocomplete="current-password"
                placeholder="••••••••••••"
                class="w-full pl-3 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
              <button
                type="button"
                @click="showCurrentPw = !showCurrentPw"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <i :class="showCurrentPw ? 'pi pi-eye-slash' : 'pi pi-eye'" class="text-xs"></i>
              </button>
            </div>
          </div>

          <!-- New Password -->
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              New Password (အသစ်ထားမည့် လျှို့ဝှက်နံပါတ်)
            </label>
            <div class="relative">
              <input
                v-model="newPassword"
                :type="showNewPw ? 'text' : 'password'"
                required
                autocomplete="new-password"
                placeholder="Min 8 characters"
                class="w-full pl-3 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
              <button
                type="button"
                @click="showNewPw = !showNewPw"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <i :class="showNewPw ? 'pi pi-eye-slash' : 'pi pi-eye'" class="text-xs"></i>
              </button>
            </div>
          </div>

          <!-- Confirm New Password -->
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Confirm New Password (အတည်ပြုရန် ထပ်ရိုက်ပါ)
            </label>
            <div class="relative">
              <input
                v-model="confirmPassword"
                :type="showNewPw ? 'text' : 'password'"
                required
                autocomplete="new-password"
                placeholder="Repeat new password"
                class="w-full pl-3 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between pt-2">
          <p class="text-[11px] text-slate-400">
            Note: Changing the admin password takes effect immediately and updates securely in Neon DB.
          </p>
          <button
            type="submit"
            :disabled="isChangingPassword"
            class="px-5 py-2.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-all shadow-md shadow-rose-600/20 flex items-center gap-2 disabled:opacity-50 cursor-pointer shrink-0"
          >
            <i v-if="isChangingPassword" class="pi pi-spin pi-spinner text-xs"></i>
            <i v-else class="pi pi-key text-xs"></i>
            <span>{{ isChangingPassword ? 'Updating Password...' : 'Update Admin Password' }}</span>
          </button>
        </div>
      </form>
    </div>

    <!-- CARD 5: Store-wide Two-Factor Authentication (2FA) -->
    <div class="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6">
      <div class="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center font-bold text-sm">
            <i class="pi pi-shield"></i>
          </div>
          <div>
            <h2 class="text-base font-bold text-slate-900 dark:text-white">Two-Factor Authentication (2FA / Google Authenticator)</h2>
            <p class="text-xs text-slate-500">Store-wide administrative two-factor protection using time-based one-time passwords (TOTP).</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span
            v-if="totpData?.isEnabled"
            class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            2FA Active (Enforced)
          </span>
          <span
            v-else
            class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20 flex items-center gap-1.5"
          >
            2FA Inactive
          </span>
        </div>
      </div>

      <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div class="space-y-1">
          <div class="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <i class="pi pi-info-circle text-cyan-500"></i>
            <span>Google Authenticator / Authy Setup</span>
          </div>
          <p class="text-[12px] text-slate-500 max-w-xl leading-relaxed">
            Scan the QR code or manually enter the Base32 setup key into your authenticator app to generate rotating 6-digit verification codes for logging in.
          </p>
        </div>

        <button
          type="button"
          @click="openTotpModal"
          :disabled="isLoadingTotp"
          class="px-4 py-2.5 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-slate-950 transition-all shadow-md shadow-cyan-600/20 flex items-center gap-2 cursor-pointer shrink-0 disabled:opacity-50"
        >
          <i v-if="isLoadingTotp" class="pi pi-spin pi-spinner text-xs"></i>
          <i v-else class="pi pi-qrcode text-xs"></i>
          <span>View Authenticator QR & Setup Key</span>
        </button>
      </div>
    </div>

    <!-- 2FA Setup & QR Code Modal -->
    <Teleport to="body">
      <div
        v-if="isTotpModalOpen"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="totp-modal-title"
        @keydown.esc="closeTotpModal"
      >
        <div
          class="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative overflow-hidden space-y-6 text-white"
          tabindex="-1"
        >
          <!-- Top Accent Line -->
          <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500"></div>

          <!-- Header -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <i class="pi pi-qrcode text-lg"></i>
              </div>
              <div>
                <h3 id="totp-modal-title" class="text-base font-bold text-white">Authenticator App Setup</h3>
                <p class="text-xs text-slate-400">Scan QR or enter key in Google Authenticator</p>
              </div>
            </div>
            <button
              type="button"
              @click="closeTotpModal"
              aria-label="Close setup modal"
              class="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <i class="pi pi-times text-xs"></i>
            </button>
          </div>

          <!-- Content: QR & Key -->
          <div v-if="totpData?.qrDataUrl" class="space-y-5">
            <!-- QR Code Display Container -->
            <div class="flex flex-col items-center justify-center p-5 bg-white rounded-2xl shadow-inner mx-auto w-fit">
              <img
                :src="totpData.qrDataUrl"
                alt="Two-factor authentication scannable QR code"
                class="w-52 h-52 object-contain rounded-lg"
              />
              <span class="text-[11px] font-semibold text-slate-700 mt-2 font-mono">Arena Store • TOTP</span>
            </div>

            <!-- Manual Setup Key Box -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <label for="totp-manual-key" class="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Manual Setup Key (လျှို့ဝှက်ကီး)
                </label>
                <span class="text-[11px] text-cyan-400 font-mono">Time-based (30s)</span>
              </div>
              <div class="flex items-center gap-2">
                <input
                  id="totp-manual-key"
                  type="text"
                  readonly
                  :value="totpData.secret"
                  class="w-full px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-xs font-mono text-cyan-300 select-all focus:outline-none"
                />
                <button
                  type="button"
                  @click="copyTotpKey"
                  :aria-label="isKeyCopied ? 'Setup key copied' : 'Copy secret setup key to clipboard'"
                  class="px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white flex items-center gap-2 cursor-pointer transition-colors shrink-0"
                >
                  <i :class="isKeyCopied ? 'pi pi-check text-emerald-400' : 'pi pi-copy text-slate-400'" class="text-xs"></i>
                  <span>{{ isKeyCopied ? 'Copied!' : 'Copy' }}</span>
                </button>
              </div>
              <!-- Live polite screen reader status -->
              <span class="sr-only" role="status" aria-live="polite">
                {{ isKeyCopied ? 'Setup key copied to clipboard' : '' }}
              </span>
            </div>

            <!-- Live Test Code Verification Widget -->
            <div class="p-4 rounded-2xl bg-slate-950/50 border border-slate-800 space-y-3">
              <div class="flex items-center justify-between">
                <label for="totp-test-code-input" class="text-xs font-semibold text-slate-300 flex items-center gap-2">
                  <i class="pi pi-check-circle text-cyan-400"></i>
                  <span>Test Code Verification (ကုဒ်စမ်းသပ်ရန်)</span>
                </label>
                <span class="text-[11px] text-slate-400">Verify before logging out</span>
              </div>
              <div class="flex items-center gap-2">
                <input
                  id="totp-test-code-input"
                  v-model="testTotpCode"
                  type="text"
                  inputmode="numeric"
                  maxlength="6"
                  placeholder="6-digit code (e.g. 123456)"
                  class="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 tracking-widest"
                  @keydown.enter.prevent="handleTestTotpCode"
                />
                <button
                  type="button"
                  @click="handleTestTotpCode"
                  :disabled="isTestingTotp || testTotpCode.trim().length !== 6"
                  class="px-4 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0 font-bold"
                >
                  <i v-if="isTestingTotp" class="pi pi-spin pi-spinner text-xs"></i>
                  <span>Verify</span>
                </button>
              </div>

              <!-- Test Code Result Feedback -->
              <div
                v-if="testTotpResult"
                :class="testTotpResult.valid ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'"
                class="p-3 rounded-xl border text-xs flex items-center gap-2"
                role="status"
              >
                <i :class="testTotpResult.valid ? 'pi pi-check-circle text-emerald-400' : 'pi pi-times-circle text-rose-400'" class="text-sm shrink-0"></i>
                <span>{{ testTotpResult.message }}</span>
              </div>
            </div>
          </div>

          <div v-else-if="isLoadingTotp" class="py-12 flex flex-col items-center justify-center space-y-3">
            <i class="pi pi-spin pi-spinner text-2xl text-cyan-400"></i>
            <p class="text-xs text-slate-400">Generating QR code & setup credentials...</p>
          </div>

          <div v-else class="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
            <p>2FA is currently disabled because ADMIN_TOTP_SECRET is not configured in the environment.</p>
          </div>

          <!-- Modal Footer -->
          <div class="pt-2 flex justify-end">
            <button
              type="button"
              @click="closeTotpModal"
              class="px-5 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
            >
              Done / Close
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>


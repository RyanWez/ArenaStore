<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useToast } from '~/composables/useToast'
import { useAuth } from '~/composables/useAuth'
import { useStoreSettings } from '~/composables/useStoreSettings'
import { usePermission } from '~/composables/usePermission'

const toast = useToast()
const { getAuthHeaders } = useAuth()
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

onMounted(async () => {
  await fetchSettings(true)
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
    toast.error('Permission denied: You cannot edit Telegram relay settings.')
    return
  }

  savingSection.value = 'relay'
  try {
    const res = await saveSettings({
      telegramGroupChatId: settings.value.telegramGroupChatId,
      telegramDepositTopicId: settings.value.telegramDepositTopicId,
      telegramAdminMentions: settings.value.telegramAdminMentions,
      telegramApproverIds: settings.value.telegramApproverIds,
    })

    if (res.success) {
      toast.success('Deposit slip relay configuration saved!', 'Relay Updated')
      triggerSuccessBanner('Telegram deposit slip relay and mentions successfully saved!')
    } else {
      toast.error('Failed to save relay settings: ' + (res.error || 'Unknown error'))
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
      payload.telegramGroupChatId = settings.value.telegramGroupChatId
      payload.telegramDepositTopicId = settings.value.telegramDepositTopicId
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

    <!-- CARD 3: Deposit Slip Relay to Telegram Group (hidden entirely without settings.operations) -->
    <div v-if="canEditOperations" class="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6">
      <div class="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center font-bold text-sm">
            <i class="pi pi-send"></i>
          </div>
          <div>
            <h2 class="text-base font-bold text-slate-900 dark:text-white">Deposit Slip Relay (Group ထဲ Slip ပို့ပေးတာ)</h2>
            <p class="text-xs text-slate-500">Automatically sends newly uploaded payment slips into your admin Telegram group or forum topic</p>
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
          ဝယ်ယူသူတိုင်း၏ payment slip ကို bot က ဤ group/topic ထဲသို့ အလိုအလျောက် ပို့ပေးပါမည်။
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
            <span>{{ savingSection === 'relay' ? 'Saving Relay...' : 'Save Relay Settings' }}</span>
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
  </div>
</template>

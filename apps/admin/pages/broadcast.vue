<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useToast } from '~/composables/useToast'
import { useAuth } from '~/composables/useAuth'
import { usePermission } from '~/composables/usePermission'

const toast = useToast()
const { getAuthHeaders, user } = useAuth()
const { can } = usePermission()

const canViewBroadcast = computed(() => can('broadcast.view'))
const canSendBroadcast = computed(() => can('broadcast.send'))

// Audience stats
interface AudienceStats {
  allUsers: number
  customers: number
  withBalance: number
}

const audience = ref<AudienceStats>({
  allUsers: 0,
  customers: 0,
  withBalance: 0,
})

// Broadcast history item
interface BroadcastItem {
  id: number
  actorId: number | null
  actorName: string | null
  actorUsername: string | null
  title: string | null
  message: string
  imageUrl: string | null
  buttonText: string | null
  buttonUrl: string | null
  targetAudience: string
  totalRecipients: number
  sentCount: number
  failedCount: number
  blockedCount: number
  status: 'PENDING' | 'SENDING' | 'COMPLETED' | 'FAILED'
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}

const broadcasts = ref<BroadcastItem[]>([])
const totalBroadcasts = ref(0)
const isLoading = ref(false)
const isSending = ref(false)
const isSendingTest = ref(false)

// Composer form state
const form = ref({
  title: '',
  targetAudience: 'ALL' as 'ALL' | 'CUSTOMERS' | 'WITH_BALANCE',
  message: '',
  imageUrl: '',
  buttonText: '',
  buttonUrl: '',
})

// Test send state
const testTelegramId = ref('')

// Confirmation modal
const isConfirmModalOpen = ref(false)

// Detail modal
const selectedBroadcast = ref<BroadcastItem | null>(null)
const isDetailModalOpen = ref(false)

// Max character limit
const maxCharLimit = computed(() => (form.value.imageUrl.trim() ? 1024 : 4096))
const charCount = computed(() => form.value.message.length)
const isOverLimit = computed(() => charCount.value > maxCharLimit.value)

// Target recipient count
const recipientCount = computed(() => {
  switch (form.value.targetAudience) {
    case 'CUSTOMERS':
      return audience.value.customers
    case 'WITH_BALANCE':
      return audience.value.withBalance
    case 'ALL':
    default:
      return audience.value.allUsers
  }
})

// Live preview HTML renderer
const previewHtml = computed(() => {
  if (!form.value.message) {
    return '<span class="text-slate-400 italic">မက်ဆေ့ခ်ျ ရိုက်ထည့်ပါက ဤနေရာတွင် အစမ်းပြသမည် ဖြစ်ပါသည်။</span>'
  }
  // Safe basic preview allowing Telegram-supported tags
  return form.value.message
    .replace(/\n/g, '<br/>')
})

async function fetchBroadcastData() {
  if (!canViewBroadcast.value) return
  isLoading.value = true
  try {
    const res: any = await $fetch('/api/admin/broadcasts', {
      headers: getAuthHeaders(),
    })
    if (res) {
      broadcasts.value = res.broadcasts || []
      totalBroadcasts.value = res.total || 0
      if (res.audience) {
        audience.value = res.audience
      }
    }
  } catch (err: any) {
    console.error('Failed to load broadcasts:', err)
    toast.error('Failed to load broadcasts: ' + (err?.data?.error || err.message))
  } finally {
    isLoading.value = false
  }
}

// Quick formatting tag injection
function insertTag(openTag: string, closeTag: string) {
  const textarea = document.getElementById('broadcast-message-input') as HTMLTextAreaElement | null
  if (!textarea) {
    form.value.message += `${openTag}text${closeTag}`
    return
  }

  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const selected = form.value.message.substring(start, end)
  const replacement = `${openTag}${selected || 'text'}${closeTag}`

  form.value.message =
    form.value.message.substring(0, start) + replacement + form.value.message.substring(end)

  setTimeout(() => {
    textarea.focus()
    textarea.setSelectionRange(start + openTag.length, start + openTag.length + (selected.length || 4))
  }, 10)
}

function insertBold() { insertTag('<b>', '</b>') }
function insertItalic() { insertTag('<i>', '</i>') }
function insertCode() { insertTag('<code>', '</code>') }
function insertQuote() { insertTag('<blockquote>', '</blockquote>') }
function insertLink() { insertTag('<a href="https://t.me/ArenaStoreBot">', '</a>') }

// Send Test Message
async function handleSendTest() {
  if (!testTelegramId.value.trim()) {
    toast.error('ကျေးဇူးပြု၍ စမ်းသပ်ပေးပို့မည့် Telegram ID ကို ထည့်သွင်းပါခင်ဗျာ။', 'Telegram ID Required')
    return
  }
  if (!form.value.message.trim()) {
    toast.error('ကျေးဇူးပြု၍ မက်ဆေ့ခ်ျ ရိုက်ထည့်ပါခင်ဗျာ။', 'Message Required')
    return
  }

  isSendingTest.value = true
  try {
    const res: any = await $fetch('/api/admin/broadcasts/test', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: {
        targetTelegramId: testTelegramId.value.trim(),
        message: form.value.message,
        imageUrl: form.value.imageUrl.trim() || undefined,
        buttonText: form.value.buttonText.trim() || undefined,
        buttonUrl: form.value.buttonUrl.trim() || undefined,
      },
    })

    if (res.success) {
      toast.success(`စမ်းသပ် မက်ဆေ့ခ်ျကို Telegram ID (${testTelegramId.value}) သို့ အောင်မြင်စွာ ပို့ဆောင်ပြီးပါပြီ!`, 'Test Sent')
    } else {
      toast.error('စမ်းသပ်မက်ဆေ့ခ်ျ ပို့ဆောင်မှု မအောင်မြင်ပါ: ' + (res.error || 'Unknown error'))
    }
  } catch (err: any) {
    toast.error('စမ်းသပ်ပို့ဆောင်မှု မအောင်မြင်ပါ: ' + (err?.data?.error || err.message))
  } finally {
    isSendingTest.value = false
  }
}

// Open Confirmation Modal
function openConfirmModal() {
  if (!form.value.message.trim()) {
    toast.error('မက်ဆေ့ခ်ျ ရိုက်ထည့်ရန် လိုအပ်ပါသည်။', 'Message Required')
    return
  }
  if (isOverLimit.value) {
    toast.error(`မက်ဆေ့ခ်ျ စာလုံးရေ ကန့်သတ်ချက် (${maxCharLimit.value}) ကျော်လွန်နေပါသည်။`, 'Limit Exceeded')
    return
  }
  if (form.value.buttonText && !form.value.buttonUrl) {
    toast.error('Button Link (URL) ကိုပါ ထည့်သွင်းရန် လိုအပ်ပါသည်။', 'Button URL Required')
    return
  }

  isConfirmModalOpen.value = true
}

// Execute Mass Broadcast
async function handleConfirmBroadcast() {
  isConfirmModalOpen.value = false
  isSending.value = true

  try {
    const res: any = await $fetch('/api/admin/broadcasts', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: {
        title: form.value.title.trim() || undefined,
        message: form.value.message,
        imageUrl: form.value.imageUrl.trim() || undefined,
        buttonText: form.value.buttonText.trim() || undefined,
        buttonUrl: form.value.buttonUrl.trim() || undefined,
        targetAudience: form.value.targetAudience,
      },
    })

    if (res.success) {
      toast.success(
        `အသုံးပြုသူ ${res.totalRecipients.toLocaleString()} ဦးထံသို့ Broadcast ပို့ဆောင်ခြင်း စတင်လိုက်ပါပြီ!`,
        'Broadcast Started'
      )
      // Reset form
      form.value = {
        title: '',
        targetAudience: 'ALL',
        message: '',
        imageUrl: '',
        buttonText: '',
        buttonUrl: '',
      }
      await fetchBroadcastData()
    } else {
      toast.error('Broadcast ပို့ဆောင်မှု မအောင်မြင်ပါ: ' + (res.error || 'Unknown error'))
    }
  } catch (err: any) {
    toast.error('Broadcast ပို့ဆောင်မှု မအောင်မြင်ပါ: ' + (err?.data?.error || err.message))
  } finally {
    isSending.value = false
  }
}

function openDetailModal(item: BroadcastItem) {
  selectedBroadcast.value = item
  isDetailModalOpen.value = true
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

onMounted(() => {
  fetchBroadcastData()
})
</script>

<template>
  <div class="space-y-6 pb-12">
    <!-- Page Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-bold text-lg shadow-sm">
            <i class="pi pi-megaphone"></i>
          </div>
          <div>
            <h1 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              Broadcast Announcements
              <span class="text-sm font-normal text-slate-400">(မက်ဆေ့ခ်ျ/ကြေညာချက် ပို့ရန်)</span>
            </h1>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              Compose and send real-time announcements, promos, and alerts to Telegram bot subscribers
            </p>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <button
          type="button"
          @click="fetchBroadcastData"
          :disabled="isLoading"
          class="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <i class="pi pi-refresh text-xs" :class="{ 'pi-spin': isLoading }"></i>
          <span>Refresh Stats</span>
        </button>
      </div>
    </div>

    <!-- Audience Overview KPI Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <!-- Card 1: All Users -->
      <div class="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group">
        <div class="flex items-center justify-between pb-2">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">All Bot Subscribers</span>
          <div class="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center text-xs">
            <i class="pi pi-users"></i>
          </div>
        </div>
        <div class="text-2xl font-black text-slate-900 dark:text-white font-mono">
          {{ audience.allUsers.toLocaleString() }}
        </div>
        <div class="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
          Active Telegram Users
        </div>
      </div>

      <!-- Card 2: Customers Only -->
      <div class="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group">
        <div class="flex items-center justify-between pb-2">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Registered Customers</span>
          <div class="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-xs">
            <i class="pi pi-user-check"></i>
          </div>
        </div>
        <div class="text-2xl font-black text-slate-900 dark:text-white font-mono">
          {{ audience.customers.toLocaleString() }}
        </div>
        <div class="text-[10px] text-slate-400 mt-1">Role: CUSTOMER</div>
      </div>

      <!-- Card 3: Users With Balance -->
      <div class="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group">
        <div class="flex items-center justify-between pb-2">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Users With Wallet Balance</span>
          <div class="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center text-xs">
            <i class="pi pi-wallet"></i>
          </div>
        </div>
        <div class="text-2xl font-black text-slate-900 dark:text-white font-mono">
          {{ audience.withBalance.toLocaleString() }}
        </div>
        <div class="text-[10px] text-slate-400 mt-1">Balance &gt; 0 MMK</div>
      </div>

      <!-- Card 4: Total Broadcasts Sent -->
      <div class="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group">
        <div class="flex items-center justify-between pb-2">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Past Broadcasts</span>
          <div class="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center text-xs">
            <i class="pi pi-send"></i>
          </div>
        </div>
        <div class="text-2xl font-black text-slate-900 dark:text-white font-mono">
          {{ totalBroadcasts.toLocaleString() }}
        </div>
        <div class="text-[10px] text-slate-400 mt-1">Total Announcements</div>
      </div>
    </div>

    <!-- Main Workspace: Composer (Left) + Telegram Mockup (Right) -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <!-- Left Column: Broadcast Composer Form -->
      <div class="lg:col-span-7 space-y-6">
        <div class="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6">
          <div class="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center text-sm font-bold">
                <i class="pi pi-pencil"></i>
              </div>
              <div>
                <h2 class="text-sm font-bold text-slate-900 dark:text-white">Compose Broadcast Message</h2>
                <p class="text-[11px] text-slate-400">Draft your announcement with formatting and optional attachments</p>
              </div>
            </div>

            <span class="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              HTML Supported
            </span>
          </div>

          <form @submit.prevent="openConfirmModal" class="space-y-5">
            <!-- 1. Target Audience Selection -->
            <div class="space-y-2">
              <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Target Audience (ပို့ဆောင်မည့် ပစ်မှတ်)
              </label>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label
                  class="p-3 rounded-xl border cursor-pointer transition flex items-center gap-3"
                  :class="form.targetAudience === 'ALL'
                    ? 'bg-indigo-500/10 border-indigo-500 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'"
                >
                  <input
                    type="radio"
                    v-model="form.targetAudience"
                    value="ALL"
                    class="sr-only"
                  />
                  <div class="flex-1 min-w-0">
                    <div class="text-xs font-bold truncate">All Subscribers</div>
                    <div class="text-[10px] opacity-75 font-mono">({{ audience.allUsers.toLocaleString() }} users)</div>
                  </div>
                  <i v-if="form.targetAudience === 'ALL'" class="pi pi-check text-xs"></i>
                </label>

                <label
                  class="p-3 rounded-xl border cursor-pointer transition flex items-center gap-3"
                  :class="form.targetAudience === 'CUSTOMERS'
                    ? 'bg-indigo-500/10 border-indigo-500 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'"
                >
                  <input
                    type="radio"
                    v-model="form.targetAudience"
                    value="CUSTOMERS"
                    class="sr-only"
                  />
                  <div class="flex-1 min-w-0">
                    <div class="text-xs font-bold truncate">Customers Only</div>
                    <div class="text-[10px] opacity-75 font-mono">({{ audience.customers.toLocaleString() }} users)</div>
                  </div>
                  <i v-if="form.targetAudience === 'CUSTOMERS'" class="pi pi-check text-xs"></i>
                </label>

                <label
                  class="p-3 rounded-xl border cursor-pointer transition flex items-center gap-3"
                  :class="form.targetAudience === 'WITH_BALANCE'
                    ? 'bg-indigo-500/10 border-indigo-500 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'"
                >
                  <input
                    type="radio"
                    v-model="form.targetAudience"
                    value="WITH_BALANCE"
                    class="sr-only"
                  />
                  <div class="flex-1 min-w-0">
                    <div class="text-xs font-bold truncate">With Balance</div>
                    <div class="text-[10px] opacity-75 font-mono">({{ audience.withBalance.toLocaleString() }} users)</div>
                  </div>
                  <i v-if="form.targetAudience === 'WITH_BALANCE'" class="pi pi-check text-xs"></i>
                </label>
              </div>
            </div>

            <!-- 2. Internal Title / Note -->
            <div class="space-y-1.5">
              <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Campaign Title / Reference (ရည်ညွှန်းအမည် - အတွင်းမှတ်တမ်းအတွက်သာ)
              </label>
              <input
                v-model="form.title"
                type="text"
                placeholder="ဥပမာ - Songkran Special Promotion, Server Maintenance Notice"
                class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <!-- 3. Message Textarea with Quick Format Toolbar -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Message Body (ပေးပို့မည့် စာသား) <span class="text-rose-500">*</span>
                </label>
                <!-- Character Counter -->
                <span
                  class="text-[11px] font-mono"
                  :class="isOverLimit ? 'text-rose-500 font-bold' : 'text-slate-400'"
                >
                  {{ charCount }} / {{ maxCharLimit }} chars
                </span>
              </div>

              <!-- Quick Formatting Bar -->
              <div class="flex items-center flex-wrap gap-1.5 p-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  @click="insertBold"
                  class="px-2.5 py-1 text-xs font-bold rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
                  title="Bold"
                >
                  <b>B</b>
                </button>
                <button
                  type="button"
                  @click="insertItalic"
                  class="px-2.5 py-1 text-xs italic rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
                  title="Italic"
                >
                  <i>I</i>
                </button>
                <button
                  type="button"
                  @click="insertCode"
                  class="px-2.5 py-1 text-xs font-mono rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
                  title="Inline Code / Copyable text"
                >
                  &lt;code&gt;
                </button>
                <button
                  type="button"
                  @click="insertQuote"
                  class="px-2.5 py-1 text-xs rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
                  title="Quote"
                >
                  Quote
                </button>
                <button
                  type="button"
                  @click="insertLink"
                  class="px-2.5 py-1 text-xs rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition flex items-center gap-1"
                  title="Link"
                >
                  <i class="pi pi-link text-[10px]"></i> Link
                </button>
              </div>

              <textarea
                id="broadcast-message-input"
                v-model="form.message"
                rows="7"
                required
                placeholder="မက်ဆေ့ခ်ျ စာသား ရိုက်ထည့်ပါ... (HTML formatting သုံးနိုင်ပါသည်)"
                class="w-full p-4 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-sans text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-y"
              ></textarea>
              <p class="text-[11px] text-slate-400">
                သတိပြုရန်: ဓာတ်ပုံ ပူးတွဲပါက စာသားအရှည် အများဆုံး 1,024 လုံးသာ ရရှိပြီး၊ စာသားသီးသန့်ဖြစ်ပါက အများဆုံး 4,096 လုံး ရရှိပါသည်။
              </p>
            </div>

            <!-- 4. Optional Photo / Image URL -->
            <div class="space-y-1.5">
              <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span>Photo / Banner Image URL (ဓာတ်ပုံ URL - ရွေးချယ်စရာ)</span>
                <span v-if="form.imageUrl" class="text-[10px] text-emerald-500 font-semibold flex items-center gap-1">
                  <i class="pi pi-check text-[9px]"></i> Image Attached
                </span>
              </label>
              <div class="relative">
                <input
                  v-model="form.imageUrl"
                  type="url"
                  placeholder="https://example.com/banner.jpg"
                  class="w-full pl-10 pr-24 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                <i class="pi pi-image absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                <button
                  v-if="form.imageUrl"
                  type="button"
                  @click="form.imageUrl = ''"
                  class="absolute right-2.5 top-1/2 -translate-y-1/2 px-2 py-1 text-[11px] text-slate-400 hover:text-slate-600 rounded"
                >
                  Clear
                </button>
              </div>
            </div>

            <!-- 5. Optional CTA Inline Button -->
            <div class="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Action Button (ခလုတ် ထည့်သွင်းရန် - ရွေးချယ်စရာ)
              </label>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  v-model="form.buttonText"
                  type="text"
                  placeholder="ခလုတ်အမည် (ဥပမာ - 🛍️ စျေးဝယ်ရန်)"
                  class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                <input
                  v-model="form.buttonUrl"
                  type="url"
                  placeholder="Link URL (ဥပမာ - https://t.me/ArenaStoreBot)"
                  class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
            </div>

            <!-- Test Send Section -->
            <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <i class="pi pi-send text-indigo-500 text-xs"></i>
                  Send Test Message (မိမိ Telegram သို့ အရင်စမ်းသပ်ပို့ရန်)
                </span>
                <span class="text-[10px] text-slate-400">စစ်ဆေးရန် အကြံပြုပါသည်</span>
              </div>

              <div class="flex items-center gap-2">
                <input
                  v-model="testTelegramId"
                  type="text"
                  placeholder="Telegram ID (ဥပမာ - 612345678)"
                  class="flex-1 px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                <button
                  type="button"
                  @click="handleSendTest"
                  :disabled="isSendingTest || !testTelegramId.trim() || !form.message.trim()"
                  class="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shrink-0"
                >
                  <i v-if="isSendingTest" class="pi pi-spin pi-spinner text-xs"></i>
                  <i v-else class="pi pi-arrow-right text-xs"></i>
                  <span>{{ isSendingTest ? 'Sending...' : 'Send Test' }}</span>
                </button>
              </div>
            </div>

            <!-- Launch Broadcast Submit -->
            <div class="pt-2">
              <button
                type="submit"
                :disabled="isSending || !form.message.trim() || isOverLimit || !canSendBroadcast"
                class="w-full py-3.5 px-6 rounded-xl text-sm font-bold bg-gradient-to-r from-indigo-600 via-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white transition-all shadow-md shadow-indigo-500/20 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <i v-if="isSending" class="pi pi-spin pi-spinner text-sm"></i>
                <i v-else class="pi pi-megaphone text-sm"></i>
                <span>
                  {{ isSending ? 'Broadcasting in progress...' : `Broadcast to ${recipientCount.toLocaleString()} Users Now` }}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Right Column: Interactive Telegram Chat Mockup Preview -->
      <div class="lg:col-span-5 sticky top-6 space-y-4">
        <div class="rounded-2xl bg-slate-900 border border-slate-800 shadow-xl overflow-hidden">
          <!-- Mockup Top Bar -->
          <div class="px-4 py-3 bg-slate-950/80 border-b border-slate-800/80 flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shadow-inner">
                A
              </div>
              <div>
                <div class="text-xs font-bold text-white flex items-center gap-1">
                  Arena Store Bot
                  <i class="pi pi-verified text-[10px] text-sky-400"></i>
                </div>
                <div class="text-[10px] text-slate-400">bot</div>
              </div>
            </div>

            <span class="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
              Live Preview
            </span>
          </div>

          <!-- Mockup Chat Body -->
          <div
            class="p-4 min-h-[380px] max-h-[540px] overflow-y-auto space-y-3 bg-[#0e1621] relative"
            style="background-image: radial-gradient(#1e293b 1px, transparent 1px); background-size: 16px 16px;"
          >
            <!-- Telegram Chat Bubble -->
            <div class="max-w-[92%] rounded-2xl rounded-tl-sm bg-[#182533] border border-[#243447] text-white shadow-lg overflow-hidden transition-all">
              <!-- Attached Image -->
              <div v-if="form.imageUrl" class="relative bg-slate-950 max-h-56 overflow-hidden">
                <img
                  :src="form.imageUrl"
                  alt="Broadcast Banner Preview"
                  class="w-full object-cover"
                  @error="(e: any) => e.target.style.display = 'none'"
                />
              </div>

              <!-- Message Text -->
              <div class="p-3.5 space-y-2 text-xs leading-relaxed break-words font-sans text-slate-100">
                <div v-html="previewHtml"></div>
              </div>

              <!-- Bubble Footer: Timestamp & Checkmarks -->
              <div class="px-3.5 pb-2 text-[10px] text-slate-400 flex items-center justify-end gap-1 font-mono">
                <span>12:00 PM</span>
                <span class="text-sky-400">✓✓</span>
              </div>
            </div>

            <!-- Inline CTA Button Mockup -->
            <div v-if="form.buttonText" class="max-w-[92%]">
              <a
                :href="form.buttonUrl || '#'"
                target="_blank"
                class="block w-full py-2.5 px-4 rounded-xl text-center text-xs font-bold bg-[#243447] hover:bg-[#2e425a] text-[#64b5f6] border border-[#2f435c] shadow transition flex items-center justify-center gap-1.5"
              >
                <span>{{ form.buttonText }}</span>
                <i class="pi pi-external-link text-[10px]"></i>
              </a>
            </div>
          </div>

          <!-- Mockup Footer Helper -->
          <div class="p-3 bg-slate-950/90 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Target: <b class="text-white">{{ form.targetAudience }}</b></span>
            <span>Recipients: <b class="text-emerald-400 font-mono">{{ recipientCount.toLocaleString() }}</b></span>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom Section: Broadcast History Table -->
    <div class="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      <div class="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center text-xs font-bold">
            <i class="pi pi-history"></i>
          </div>
          <div>
            <h3 class="text-sm font-bold text-slate-900 dark:text-white">Broadcast History & Reports</h3>
            <p class="text-[11px] text-slate-400">Audit logs and delivery delivery metrics of all broadcast campaigns</p>
          </div>
        </div>

        <span class="text-xs font-mono text-slate-400">
          Total: {{ totalBroadcasts.toLocaleString() }}
        </span>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead class="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
            <tr>
              <th class="py-3 px-4">Date & Time</th>
              <th class="py-3 px-4">Title / Message</th>
              <th class="py-3 px-4">Audience</th>
              <th class="py-3 px-4">Sent</th>
              <th class="py-3 px-4">Blocked</th>
              <th class="py-3 px-4">Failed</th>
              <th class="py-3 px-4">Status</th>
              <th class="py-3 px-4">Author</th>
              <th class="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800 font-normal">
            <tr v-if="broadcasts.length === 0" class="text-center text-slate-400 py-8">
              <td colspan="9" class="py-8">
                <i class="pi pi-inbox text-2xl mb-2 block text-slate-300"></i>
                ယခင် ပို့ဆောင်ထားသော Broadcast မှတ်တမ်း မရှိသေးပါ။
              </td>
            </tr>

            <tr
              v-for="item in broadcasts"
              :key="item.id"
              class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition"
            >
              <td class="py-3 px-4 whitespace-nowrap font-mono text-slate-500">
                {{ formatDate(item.createdAt) }}
              </td>

              <td class="py-3 px-4 max-w-xs">
                <div class="font-bold text-slate-900 dark:text-white truncate">
                  {{ item.title || 'Untitled Announcement' }}
                </div>
                <div class="text-[11px] text-slate-400 truncate">
                  {{ item.message.replace(/<[^>]*>/g, '') }}
                </div>
              </td>

              <td class="py-3 px-4 whitespace-nowrap">
                <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  {{ item.targetAudience }}
                </span>
              </td>

              <td class="py-3 px-4 whitespace-nowrap font-mono font-bold text-emerald-600 dark:text-emerald-400">
                {{ item.sentCount.toLocaleString() }}
              </td>

              <td class="py-3 px-4 whitespace-nowrap font-mono text-amber-500">
                {{ item.blockedCount.toLocaleString() }}
              </td>

              <td class="py-3 px-4 whitespace-nowrap font-mono text-rose-500">
                {{ item.failedCount.toLocaleString() }}
              </td>

              <td class="py-3 px-4 whitespace-nowrap">
                <span
                  class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                  :class="{
                    'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20': item.status === 'COMPLETED',
                    'bg-indigo-500/10 text-indigo-500 border border-indigo-500/20': item.status === 'SENDING',
                    'bg-rose-500/10 text-rose-600 border border-rose-500/20': item.status === 'FAILED',
                    'bg-slate-500/10 text-slate-500': item.status === 'PENDING',
                  }"
                >
                  {{ item.status }}
                </span>
              </td>

              <td class="py-3 px-4 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                {{ item.actorName || item.actorUsername || 'System' }}
              </td>

              <td class="py-3 px-4 text-right whitespace-nowrap">
                <button
                  type="button"
                  @click="openDetailModal(item)"
                  class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer"
                >
                  View
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Confirmation Modal -->
    <div
      v-if="isConfirmModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
    >
      <div class="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center text-lg font-bold shrink-0">
            <i class="pi pi-exclamation-triangle"></i>
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-900 dark:text-white">Confirm Broadcast Launch</h3>
            <p class="text-xs text-slate-500">မက်ဆေ့ခ်ျ ပို့ဆောင်မှုကို အတည်ပြုပါ</p>
          </div>
        </div>

        <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-2">
          <div class="flex justify-between">
            <span class="text-slate-400">Target Segment:</span>
            <span class="font-bold text-slate-800 dark:text-slate-200">{{ form.targetAudience }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Total Recipients:</span>
            <span class="font-black font-mono text-indigo-600 dark:text-indigo-400">{{ recipientCount.toLocaleString() }} users</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Has Image:</span>
            <span>{{ form.imageUrl ? 'Yes (Photo)' : 'No (Text)' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Has Action Button:</span>
            <span>{{ form.buttonText ? form.buttonText : 'No Button' }}</span>
          </div>
        </div>

        <p class="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
          ⚠️ အတည်ပြုပြီးပါက အသုံးပြုသူများထံသို့ မက်ဆေ့ခ်ျများကို အလိုအလျောက် စတင်ပို့ဆောင်မည် ဖြစ်ပါသည်။ ဆက်လက်လုပ်ဆောင်လိုပါသလားခင်ဗျာ။
        </p>

        <div class="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            @click="isConfirmModalOpen = false"
            class="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            @click="handleConfirmBroadcast"
            class="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition shadow-sm cursor-pointer"
          >
            Yes, Send Broadcast
          </button>
        </div>
      </div>
    </div>

    <!-- Detail View Modal -->
    <div
      v-if="isDetailModalOpen && selectedBroadcast"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
    >
      <div class="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
        <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <h3 class="text-sm font-bold text-slate-900 dark:text-white">
            {{ selectedBroadcast.title || 'Broadcast Announcement' }}
          </h3>
          <button
            type="button"
            @click="isDetailModalOpen = false"
            class="text-slate-400 hover:text-slate-600 text-sm"
          >
            ✕
          </button>
        </div>

        <div v-if="selectedBroadcast.imageUrl" class="rounded-xl overflow-hidden max-h-48">
          <img :src="selectedBroadcast.imageUrl" alt="Broadcast Image" class="w-full object-cover" />
        </div>

        <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs font-sans space-y-2 max-h-60 overflow-y-auto">
          <div v-html="selectedBroadcast.message.replace(/\n/g, '<br/>')"></div>
        </div>

        <div v-if="selectedBroadcast.buttonText" class="p-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/20 text-xs text-indigo-600 dark:text-indigo-400 flex items-center justify-between">
          <span>Button: <b>{{ selectedBroadcast.buttonText }}</b></span>
          <span class="font-mono text-[10px] truncate max-w-xs">{{ selectedBroadcast.buttonUrl }}</span>
        </div>

        <div class="grid grid-cols-3 gap-2 text-center text-xs">
          <div class="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
            <div class="font-mono font-bold">{{ selectedBroadcast.sentCount }}</div>
            <div class="text-[10px]">Delivered</div>
          </div>
          <div class="p-2 rounded-lg bg-amber-500/10 text-amber-600">
            <div class="font-mono font-bold">{{ selectedBroadcast.blockedCount }}</div>
            <div class="text-[10px]">Blocked</div>
          </div>
          <div class="p-2 rounded-lg bg-rose-500/10 text-rose-600">
            <div class="font-mono font-bold">{{ selectedBroadcast.failedCount }}</div>
            <div class="text-[10px]">Failed</div>
          </div>
        </div>

        <div class="flex justify-end pt-2">
          <button
            type="button"
            @click="isDetailModalOpen = false"
            class="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

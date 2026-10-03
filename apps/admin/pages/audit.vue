<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { useToast } from '~/composables/useToast'

interface AuditEntry {
  id: number
  actor: string
  actorEmail: string | null
  action: string
  entityType: string
  entityId: string
  details: any
  createdAt: string
}

const { getAuthHeaders } = useAuth()
const { showToast } = useToast()

const entries = ref<AuditEntry[]>([])
const isLoading = ref(true)
const actionFilter = ref('')

async function loadData() {
  isLoading.value = true
  try {
    const res: any = await $fetch('/api/admin/audit?limit=200', { headers: getAuthHeaders() })
    entries.value = res.entries ?? []
  } catch (err: any) {
    showToast({ title: 'Load failed', message: err?.data?.error || 'Could not load the audit log.', type: 'error' })
  } finally {
    isLoading.value = false
  }
}

onMounted(loadData)

const actions = ref<string[]>([])
function refreshActions() {
  actions.value = Array.from(new Set(entries.value.map((e) => e.action))).sort()
}
watch(entries, refreshActions)

const visibleEntries = computed(() =>
  actionFilter.value ? entries.value.filter((e) => e.action === actionFilter.value) : entries.value
)

function actionChipClass(action: string): string {
  if (action.includes('DELETE') || action.includes('HARD_DELETE')) return 'bg-rose-500/10 text-rose-500 border-rose-500/20'
  if (action.includes('CREATE')) return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
  if (action.includes('UPDATE') || action.includes('ADJUST')) return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
  if (action.includes('APPROVE') || action.includes('REVIEW')) return 'bg-amber-500/10 text-amber-500 border-amber-500/20'
  return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
}

function formatDetails(details: any): string {
  if (!details) return ''
  try {
    return JSON.stringify(details, null, 0)
  } catch {
    return String(details)
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
          <i class="pi pi-history text-indigo-600 dark:text-indigo-400"></i>
          Audit Log
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Who changed what — money movements, settings edits, role changes and account actions.
        </p>
      </div>
      <select
        v-model="actionFilter"
        class="px-3.5 py-2 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/60 rounded-xl text-slate-900 dark:text-white text-xs focus:outline-none focus:border-indigo-500"
      >
        <option value="">All actions</option>
        <option v-for="a in actions" :key="a" :value="a">{{ a }}</option>
      </select>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="p-10 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center text-sm text-slate-400">
      <i class="pi pi-spin pi-spinner mr-2"></i> Loading audit entries...
    </div>

    <div v-else class="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
            <th class="px-5 py-3 font-semibold">When</th>
            <th class="px-5 py-3 font-semibold">Actor</th>
            <th class="px-5 py-3 font-semibold">Action</th>
            <th class="px-5 py-3 font-semibold">Entity</th>
            <th class="px-5 py-3 font-semibold">Details</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60">
          <tr v-if="visibleEntries.length === 0">
            <td colspan="5" class="px-5 py-8 text-center text-xs text-slate-400">No audit entries recorded yet.</td>
          </tr>
          <tr v-for="e in visibleEntries" :key="e.id">
            <td class="px-5 py-3 text-xs text-slate-400 whitespace-nowrap">
              {{ e.createdAt ? new Date(e.createdAt).toLocaleString() : '—' }}
            </td>
            <td class="px-5 py-3 text-xs text-slate-700 dark:text-slate-200">
              {{ e.actor }}<span v-if="e.actorEmail" class="block text-[10px] text-slate-400">{{ e.actorEmail }}</span>
            </td>
            <td class="px-5 py-3">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold border" :class="actionChipClass(e.action)">{{ e.action }}</span>
            </td>
            <td class="px-5 py-3 text-xs text-slate-500 dark:text-slate-400">
              {{ e.entityType }} #{{ e.entityId }}
            </td>
            <td class="px-5 py-3 text-[11px] text-slate-400 font-mono max-w-xs truncate" :title="formatDetails(e.details)">
              {{ formatDetails(e.details) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

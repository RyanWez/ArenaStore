<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { useToast } from '~/composables/useToast'
import {
  formatMyanmarDateTime,
  formatMyanmarDate,
  getMyanmarDateString,
  getTodayMyanmarDate,
  matchesMyanmarDateFilter,
  formatRelativeTime,
  type DateFilterPreset,
} from '~/utils/date'

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
const isRefreshing = ref(false)

// --- Search & Filters ---
const searchQuery = ref('')
const actionFilter = ref('')
const entityFilter = ref('')
const selectedDateFilter = ref<DateFilterPreset>('ALL')
const customDateFilter = ref(getTodayMyanmarDate())
const sortOrder = ref<'desc' | 'asc'>('desc')

// --- Pagination ---
const currentPage = ref(1)
const pageSize = ref(15)

// --- Detail Inspector Modal ---
const inspectingEntry = ref<AuditEntry | null>(null)
const isCopied = ref(false)

async function loadData(isSilent = false) {
  if (!isSilent) {
    isLoading.value = true
  } else {
    isRefreshing.value = true
  }

  try {
    const res: any = await $fetch('/api/admin/audit?limit=200', { headers: getAuthHeaders() })
    entries.value = res.entries ?? []
  } catch (err: any) {
    showToast({ title: 'Load failed', message: err?.data?.error || 'Could not load the audit log.', type: 'error' })
  } finally {
    isLoading.value = false
    isRefreshing.value = false
  }
}

onMounted(() => loadData(false))

// Distinct action list
const actions = computed(() => {
  return Array.from(new Set(entries.value.map((e) => e.action))).sort()
})

// Distinct entity types
const entityTypes = computed(() => {
  return Array.from(new Set(entries.value.map((e) => e.entityType))).filter(Boolean).sort()
})

// Filtered and Sorted entries
const filteredEntries = computed(() => {
  let list = entries.value

  if (actionFilter.value) {
    list = list.filter((e) => e.action === actionFilter.value)
  }

  if (entityFilter.value) {
    list = list.filter((e) => e.entityType === entityFilter.value)
  }

  // Date Filter
  if (selectedDateFilter.value !== 'ALL') {
    list = list.filter((e) =>
      matchesMyanmarDateFilter(e.createdAt, selectedDateFilter.value, customDateFilter.value)
    )
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim()
    list = list.filter((e) => {
      const actor = (e.actor || '').toLowerCase()
      const email = (e.actorEmail || '').toLowerCase()
      const action = (e.action || '').toLowerCase()
      const entity = `${e.entityType} #${e.entityId}`.toLowerCase()
      let detailsStr = ''
      try {
        detailsStr = typeof e.details === 'object' ? JSON.stringify(e.details).toLowerCase() : String(e.details).toLowerCase()
      } catch {
        // ignore
      }
      return actor.includes(q) || email.includes(q) || action.includes(q) || entity.includes(q) || detailsStr.includes(q)
    })
  }

  if (sortOrder.value === 'asc') {
    list = [...list].reverse()
  }

  return list
})

// Reset pagination on filter change
watch([searchQuery, actionFilter, entityFilter, selectedDateFilter, customDateFilter, pageSize], () => {
  currentPage.value = 1
})

// Pagination Computations
const totalEntries = computed(() => filteredEntries.value.length)
const totalPages = computed(() => Math.ceil(totalEntries.value / pageSize.value) || 1)

const paginatedEntries = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredEntries.value.slice(start, start + pageSize.value)
})

const showingRange = computed(() => {
  if (totalEntries.value === 0) return '0 of 0 entries'
  const start = (currentPage.value - 1) * pageSize.value + 1
  const end = Math.min(start + pageSize.value - 1, totalEntries.value)
  return `Showing ${start} to ${end} of ${totalEntries.value} entries`
})

const displayedPages = computed(() => {
  const total = totalPages.value
  const current = currentPage.value
  const pages: number[] = []

  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i)
  } else {
    pages.push(1)
    if (current > 3) pages.push(-1) // Ellipsis

    const start = Math.max(2, current - 1)
    const end = Math.min(total - 1, current + 1)
    for (let i = start; i <= end; i++) {
      if (!pages.includes(i)) pages.push(i)
    }

    if (current < total - 2) pages.push(-1) // Ellipsis
    if (!pages.includes(total)) pages.push(total)
  }
  return pages
})

function goToPage(page: number) {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page
  }
}

function clearFilters() {
  searchQuery.value = ''
  actionFilter.value = ''
  entityFilter.value = ''
  selectedDateFilter.value = 'ALL'
  sortOrder.value = 'desc'
}

function actionChipClass(action: string): string {
  if (action.includes('DELETE') || action.includes('HARD_DELETE') || action.includes('REJECT')) {
    return 'bg-rose-500/10 text-rose-500 border-rose-500/20'
  }
  if (action.includes('CREATE') || action.includes('APPROVE') || action.includes('RESTORE')) {
    return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
  }
  if (action.includes('UPDATE') || action.includes('ADJUST') || action.includes('EDIT')) {
    return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
  }
  if (action.includes('REVIEW') || action.includes('RECALCULATE') || action.includes('SYNC')) {
    return 'bg-amber-500/10 text-amber-500 border-amber-500/20'
  }
  return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
}

// Smart Humanized Summary of Event Details
function summarizeDetails(entry: AuditEntry): { label?: string; chips: Array<{ text: string; highlight?: boolean }> } {
  const d = entry.details
  if (!d || typeof d !== 'object') {
    return { chips: [{ text: d ? String(d) : 'No details' }] }
  }

  const chips: Array<{ text: string; highlight?: boolean }> = []

  switch (entry.action) {
    case 'ROLE_CREATE':
    case 'ROLE_UPDATE':
    case 'ROLE_DELETE':
      if (d.name) chips.push({ text: `Name: "${d.name}"`, highlight: true })
      if (d.key) chips.push({ text: `Key: ${d.key}` })
      if (Array.isArray(d.permissions)) chips.push({ text: `${d.permissions.length} perms` })
      break

    case 'STAFF_CREATE':
      if (d.email) chips.push({ text: d.email, highlight: true })
      if (d.roleName) chips.push({ text: `Role: ${d.roleName}` })
      else if (d.roleId) chips.push({ text: `Role #${d.roleId}` })
      break

    case 'STAFF_UPDATE':
      if (d.email) chips.push({ text: d.email })
      if (d.newStatus) chips.push({ text: `Status: ${d.newStatus}`, highlight: true })
      if (d.roleId) chips.push({ text: `Role #${d.roleId}` })
      if (d.mustChangePassword !== undefined) chips.push({ text: `tempPw: ${d.mustChangePassword}` })
      break

    case 'DEPOSIT_REVIEW':
      if (d.action) chips.push({ text: d.action, highlight: true })
      if (d.amountMmk) chips.push({ text: `${Number(d.amountMmk).toLocaleString()} MMK` })
      if (d.method) chips.push({ text: d.method })
      if (d.actorKind) chips.push({ text: `via ${d.actorKind}` })
      break

    case 'RECALCULATE_PRICES':
      if (d.updatedCount !== undefined) chips.push({ text: `${d.updatedCount} products updated`, highlight: true })
      if (d.exchangeRate) chips.push({ text: `Rate: ${Number(d.exchangeRate).toLocaleString()} MMK` })
      if (d.marginPct !== undefined) chips.push({ text: `Margin: ${d.marginPct}%` })
      break

    case 'SETTINGS_UPDATE':
      if (Array.isArray(d.keys)) chips.push({ text: `Keys: ${d.keys.join(', ')}`, highlight: true })
      else if (typeof d === 'object') chips.push({ text: `Keys: ${Object.keys(d).join(', ')}` })
      break

    default:
      // Generic breakdown of top 2-3 keys
      const keys = Object.keys(d)
      if (keys.length === 0) {
        chips.push({ text: 'Empty payload' })
      } else {
        for (const k of keys.slice(0, 3)) {
          const val = typeof d[k] === 'object' ? JSON.stringify(d[k]) : String(d[k])
          chips.push({ text: `${k}: ${val.slice(0, 24)}` })
        }
        if (keys.length > 3) chips.push({ text: `+${keys.length - 3} more` })
      }
      break
  }

  return { chips }
}

function openInspector(entry: AuditEntry) {
  inspectingEntry.value = entry
  isCopied.value = false
}

function formatPrettyJson(val: any): string {
  try {
    return JSON.stringify(val, null, 2)
  } catch {
    return String(val)
  }
}

async function copyJson() {
  if (!inspectingEntry.value) return
  try {
    await navigator.clipboard.writeText(formatPrettyJson(inspectingEntry.value.details))
    isCopied.value = true
    setTimeout(() => {
      isCopied.value = false
    }, 2000)
  } catch {
    showToast({ title: 'Copy failed', message: 'Could not copy to clipboard.', type: 'warn' })
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
          Chronological ledger of admin operations — money movements, setting adjustments, role changes and security actions.
        </p>
      </div>

      <div class="flex items-center gap-2 self-start sm:self-auto">
        <button
          type="button"
          @click="loadData(true)"
          :disabled="isRefreshing || isLoading"
          class="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
          title="Reload recent audit entries"
        >
          <i :class="isRefreshing ? 'pi pi-spin pi-spinner' : 'pi pi-refresh'" class="text-xs"></i>
          <span>Refresh</span>
        </button>
      </div>
    </div>

    <!-- Filter & Search Bar -->
    <div class="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
      <!-- Search Input -->
      <div class="relative flex-1 max-w-md">
        <i class="pi pi-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search by actor, action, entity #ID or details..."
          class="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700/60 rounded-xl text-slate-900 dark:text-white text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
        />
        <button
          v-if="searchQuery"
          type="button"
          @click="searchQuery = ''"
          class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white p-0.5"
        >
          <i class="pi pi-times text-xs"></i>
        </button>
      </div>

      <!-- Dropdown Filters & Controls -->
      <div class="flex items-center gap-2 flex-wrap">
        <!-- Action Filter -->
        <select
          v-model="actionFilter"
          class="px-3 py-2 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700/60 rounded-xl text-slate-900 dark:text-white text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
        >
          <option value="">All Actions ({{ actions.length }})</option>
          <option v-for="a in actions" :key="a" :value="a">{{ a }}</option>
        </select>

        <!-- Entity Type Filter -->
        <select
          v-model="entityFilter"
          class="px-3 py-2 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700/60 rounded-xl text-slate-900 dark:text-white text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
        >
          <option value="">All Entities</option>
          <option v-for="e in entityTypes" :key="e" :value="e">{{ e }}</option>
        </select>

        <!-- Date Filter Preset -->
        <select
          v-model="selectedDateFilter"
          class="px-3 py-2 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700/60 rounded-xl text-slate-900 dark:text-white text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
        >
          <option value="ALL">All Dates</option>
          <option value="TODAY">Today</option>
          <option value="YESTERDAY">Yesterday</option>
          <option value="LAST_7_DAYS">Last 7 Days</option>
          <option value="THIS_MONTH">This Month</option>
          <option value="CUSTOM">Custom Date</option>
        </select>

        <!-- Custom Date input when CUSTOM is selected -->
        <div v-if="selectedDateFilter === 'CUSTOM'" class="relative flex items-center">
          <i class="pi pi-calendar absolute left-2.5 text-slate-400 text-xs pointer-events-none"></i>
          <input
            type="date"
            v-model="customDateFilter"
            class="pl-8 pr-2.5 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-700/70 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 cursor-pointer ring-1 ring-indigo-500"
          />
        </div>

        <!-- Sort Order -->
        <button
          type="button"
          @click="sortOrder = sortOrder === 'desc' ? 'asc' : 'desc'"
          class="px-3 py-2 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700/60 rounded-xl text-slate-700 dark:text-slate-300 text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer"
          :title="sortOrder === 'desc' ? 'Showing Newest First' : 'Showing Oldest First'"
        >
          <i :class="sortOrder === 'desc' ? 'pi pi-sort-amount-down' : 'pi pi-sort-amount-up-alt'" class="text-[10px]"></i>
          <span>{{ sortOrder === 'desc' ? 'Newest' : 'Oldest' }}</span>
        </button>

        <!-- Clear Button -->
        <button
          v-if="searchQuery || actionFilter || entityFilter || selectedDateFilter !== 'ALL' || sortOrder !== 'desc'"
          type="button"
          @click="clearFilters"
          class="px-3 py-2 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white border border-dashed border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <i class="pi pi-filter-slash text-[10px]"></i>
          <span>Clear</span>
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="p-12 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center text-sm text-slate-400">
      <i class="pi pi-spin pi-spinner mr-2 text-indigo-500"></i> Loading audit entries...
    </div>

    <!-- Audit Table Card -->
    <div v-else class="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
      <!-- Scrollable Table Container with Sticky Header -->
      <div class="max-h-[620px] overflow-auto">
        <table class="w-full text-sm border-collapse">
          <thead class="sticky top-0 z-10 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 shadow-2xs">
            <tr class="text-left text-[11px] uppercase tracking-wider text-slate-400">
              <th class="px-5 py-3.5 font-semibold">When (Myanmar Time)</th>
              <th class="px-5 py-3.5 font-semibold">Actor</th>
              <th class="px-5 py-3.5 font-semibold">Action</th>
              <th class="px-5 py-3.5 font-semibold">Entity</th>
              <th class="px-5 py-3.5 font-semibold">Summary Details</th>
              <th class="px-5 py-3.5 font-semibold text-right">Inspect</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60">
            <tr v-if="paginatedEntries.length === 0">
              <td colspan="6" class="px-5 py-12 text-center text-xs text-slate-400">
                <div class="max-w-xs mx-auto space-y-2">
                  <i class="pi pi-search text-2xl text-slate-300 dark:text-slate-600"></i>
                  <p class="font-medium text-slate-700 dark:text-slate-300">No matching audit entries</p>
                  <p class="text-[11px] text-slate-400">Try adjusting your search query or reset your filters.</p>
                  <button
                    v-if="searchQuery || actionFilter || entityFilter"
                    type="button"
                    @click="clearFilters"
                    class="mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer"
                  >
                    Reset Filters
                  </button>
                </div>
              </td>
            </tr>

            <tr
              v-for="e in paginatedEntries"
              :key="e.id"
              class="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors group"
            >
              <!-- When Column -->
              <td class="px-5 py-3.5 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                <p class="font-medium text-slate-800 dark:text-slate-200">
                  {{ formatMyanmarDateTime(e.createdAt) }}
                </p>
                <p class="text-[10px] text-slate-400 mt-0.5">
                  {{ formatRelativeTime(e.createdAt) }}
                </p>
              </td>

              <!-- Actor Column -->
              <td class="px-5 py-3.5 text-xs">
                <div class="flex items-center gap-2.5">
                  <div class="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[10px] flex items-center justify-center shrink-0 border border-slate-300 dark:border-slate-700">
                    {{ (e.actor || 'SY').slice(0, 2).toUpperCase() }}
                  </div>
                  <div class="min-w-0">
                    <p class="font-semibold text-slate-900 dark:text-white truncate">{{ e.actor }}</p>
                    <p v-if="e.actorEmail" class="text-[10px] text-slate-400 truncate">{{ e.actorEmail }}</p>
                  </div>
                </div>
              </td>

              <!-- Action Column -->
              <td class="px-5 py-3.5 whitespace-nowrap">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold border tracking-wide uppercase inline-flex items-center gap-1" :class="actionChipClass(e.action)">
                  <span class="w-1 h-1 rounded-full bg-current"></span>
                  {{ e.action }}
                </span>
              </td>

              <!-- Entity Column -->
              <td class="px-5 py-3.5 text-xs whitespace-nowrap">
                <span class="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-[11px] border border-slate-200 dark:border-slate-700/60">
                  {{ e.entityType }} #{{ e.entityId }}
                </span>
              </td>

              <!-- Summary Details Column -->
              <td class="px-5 py-3.5">
                <div class="flex items-center gap-1.5 flex-wrap max-w-md">
                  <template v-for="(chip, cIdx) in summarizeDetails(e).chips" :key="cIdx">
                    <span
                      class="px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
                      :class="chip.highlight
                        ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-semibold'
                        : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60'"
                    >
                      {{ chip.text }}
                    </span>
                  </template>
                </div>
              </td>

              <!-- Inspect Action Column -->
              <td class="px-5 py-3.5 text-right whitespace-nowrap">
                <button
                  type="button"
                  @click="openInspector(e)"
                  class="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                  title="Inspect raw payload and details"
                >
                  <i class="pi pi-eye text-[10px]"></i>
                  <span>Inspect</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Unified Pagination Footer -->
      <div class="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
        <div>
          <span>{{ showingRange }}</span>
        </div>

        <div class="flex items-center gap-1.5">
          <!-- Prev Button -->
          <button
            type="button"
            @click="goToPage(currentPage - 1)"
            :disabled="currentPage === 1"
            class="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700/80 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors text-slate-700 dark:text-slate-300 cursor-pointer"
          >
            <i class="pi pi-chevron-left text-[10px]"></i>
          </button>

          <!-- Numbered Pages -->
          <template v-for="(p, idx) in displayedPages" :key="'p-' + idx">
            <span v-if="p === -1" class="px-1 text-slate-400 select-none">...</span>
            <button
              v-else
              type="button"
              @click="goToPage(p)"
              :class="currentPage === p ? 'bg-indigo-600 text-white font-bold' : 'border border-slate-200 dark:border-slate-700/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'"
              class="w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-colors cursor-pointer"
            >
              {{ p }}
            </button>
          </template>

          <!-- Next Button -->
          <button
            type="button"
            @click="goToPage(currentPage + 1)"
            :disabled="currentPage === totalPages"
            class="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700/80 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors text-slate-700 dark:text-slate-300 cursor-pointer"
          >
            <i class="pi pi-chevron-right text-[10px]"></i>
          </button>

          <!-- Page Size Selector -->
          <select
            v-model="pageSize"
            class="ml-2 px-2.5 py-1 rounded-lg text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          >
            <option :value="15">15 / page</option>
            <option :value="25">25 / page</option>
            <option :value="50">50 / page</option>
            <option :value="100">100 / page</option>
          </select>
        </div>
      </div>
    </div>

    <!-- JSON Details Inspector Modal (Centered) -->
    <Teleport to="body">
      <div
        v-if="inspectingEntry"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/75 backdrop-blur-sm overflow-y-auto"
        @click.self="inspectingEntry = null"
      >
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
          <!-- Modal Header -->
          <div class="p-5 pb-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
            <div class="flex items-center gap-3">
              <span class="px-2.5 py-1 rounded text-xs font-bold border tracking-wider uppercase" :class="actionChipClass(inspectingEntry.action)">
                {{ inspectingEntry.action }}
              </span>
              <div>
                <h3 class="font-bold text-slate-900 dark:text-white text-sm">
                  Entity: {{ inspectingEntry.entityType }} #{{ inspectingEntry.entityId }}
                </h3>
                <p class="text-xs text-slate-400 mt-0.5">
                  Audit Entry ID #{{ inspectingEntry.id }}
                </p>
              </div>
            </div>
            <button
              type="button"
              @click="inspectingEntry = null"
              class="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <i class="pi pi-times text-xs"></i>
            </button>
          </div>

          <!-- Modal Body -->
          <div class="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
            <!-- Metadata Cards Grid -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <!-- Actor Box -->
              <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-1">
                <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Actor / Performed By</p>
                <p class="font-bold text-slate-900 dark:text-white text-sm">{{ inspectingEntry.actor }}</p>
                <p v-if="inspectingEntry.actorEmail" class="text-slate-500 dark:text-slate-400">{{ inspectingEntry.actorEmail }}</p>
              </div>

              <!-- Timestamp Box -->
              <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-1">
                <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Timestamp</p>
                <p class="font-bold text-slate-900 dark:text-white text-sm">{{ formatMyanmarDateTime(inspectingEntry.createdAt) }}</p>
                <p class="text-slate-500 dark:text-slate-400">{{ formatRelativeTime(inspectingEntry.createdAt) }}</p>
              </div>
            </div>

            <!-- Payload Section -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <label class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Payload Details</label>
                <button
                  type="button"
                  @click="copyJson"
                  class="px-2.5 py-1 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <i :class="isCopied ? 'pi pi-check text-emerald-500' : 'pi pi-copy'" class="text-[11px]"></i>
                  <span>{{ isCopied ? 'Copied to Clipboard!' : 'Copy JSON' }}</span>
                </button>
              </div>

              <!-- Code box -->
              <div class="rounded-xl bg-slate-950 p-4 border border-slate-800 text-emerald-400 font-mono text-[11px] overflow-x-auto max-h-72 leading-relaxed">
                <pre>{{ formatPrettyJson(inspectingEntry.details) }}</pre>
              </div>
            </div>
          </div>

          <!-- Modal Footer -->
          <div class="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-end shrink-0">
            <button
              type="button"
              @click="inspectingEntry = null"
              class="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-slate-800 text-white hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

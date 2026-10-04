<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { usePermission } from '~/composables/usePermission'
import { useToast } from '~/composables/useToast'
import { formatMyanmarDate } from '~/utils/date'

interface StaffUser {
  id: number
  email: string
  username: string | null
  firstName: string
  lastName: string | null
  role: string
  roleId: number | null
  roleName: string | null
  status: string
  mustChangePassword: boolean
  createdAt: string
}

interface RoleOption {
  id: number
  name: string
  userCount: number
}

const { getAuthHeaders } = useAuth()
const { isSuperadmin } = usePermission()
const { showToast } = useToast()

const staff = ref<StaffUser[]>([])
const roles = ref<RoleOption[]>([])
const isLoading = ref(true)
const busyUserId = ref<number | null>(null)

// --- Search & Filters ---
const searchQuery = ref('')
const statusFilter = ref<'ALL' | 'ACTIVE' | 'DEACTIVATED'>('ALL')
const roleFilter = ref<number | 'ALL'>('ALL')

const totalStaffCount = computed(() => staff.value.length)
const activeStaffCount = computed(() => staff.value.filter(u => u.status === 'ACTIVE').length)
const deactivatedStaffCount = computed(() => staff.value.filter(u => u.status === 'DEACTIVATED').length)

const filteredStaff = computed(() => {
  return staff.value.filter((u) => {
    if (statusFilter.value !== 'ALL' && u.status !== statusFilter.value) return false
    if (roleFilter.value !== 'ALL' && u.roleId !== roleFilter.value) return false
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase().trim()
      const name = displayName(u).toLowerCase()
      const email = (u.email || '').toLowerCase()
      const username = (u.username || '').toLowerCase()
      if (!name.includes(q) && !email.includes(q) && !username.includes(q)) return false
    }
    return true
  })
})

function clearFilters() {
  searchQuery.value = ''
  statusFilter.value = 'ALL'
  roleFilter.value = 'ALL'
}

async function loadData() {
  isLoading.value = true
  try {
    const [staffRes, rolesRes]: any[] = await Promise.all([
      $fetch('/api/admin/staff', { headers: getAuthHeaders() }),
      $fetch('/api/admin/roles', { headers: getAuthHeaders() }),
    ])
    staff.value = staffRes.staff ?? []
    roles.value = (rolesRes.roles ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      userCount: r.userCount,
    }))
  } catch (err: any) {
    showToast({ title: 'Load failed', message: err?.data?.error || 'Could not load staff accounts.', type: 'error' })
  } finally {
    isLoading.value = false
  }
}

onMounted(loadData)

// --- Create dialog ---
const isCreateOpen = ref(false)
const isCreating = ref(false)
const showCreatePassword = ref(false)
const form = ref({
  firstName: '',
  lastName: '',
  email: '',
  username: '',
  password: '',
  roleId: null as number | null,
})

function openCreate() {
  form.value = {
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    password: generateSecurePassword(),
    roleId: roles.value[0]?.id ?? null,
  }
  showCreatePassword.value = false
  isCreateOpen.value = true
}

function generateSecurePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$'
  let pwd = 'Ar!'
  for (let i = 0; i < 9; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return pwd
}

function handleRegeneratePassword() {
  form.value.password = generateSecurePassword()
}

async function createStaff() {
  if (!form.value.firstName || !form.value.email || !form.value.password || !form.value.roleId) {
    showToast({ title: 'Missing fields', message: 'Name, email, password and role are required.', type: 'warn' })
    return
  }
  if (form.value.password.length < 8) {
    showToast({ title: 'Weak password', message: 'Temporary password must be at least 8 characters.', type: 'warn' })
    return
  }

  isCreating.value = true
  try {
    await $fetch('/api/admin/staff', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: {
        firstName: form.value.firstName.trim(),
        lastName: form.value.lastName.trim() || undefined,
        email: form.value.email.trim(),
        username: form.value.username.trim() || undefined,
        password: form.value.password,
        roleId: form.value.roleId,
      },
    })
    showToast({
      title: 'Admin user created',
      message: 'Share the temporary password securely — they must change it at first login.',
      type: 'success',
      duration: 6000,
    })
    isCreateOpen.value = false
    await loadData()
  } catch (err: any) {
    showToast({ title: 'Create failed', message: err?.data?.error || 'Could not create the user.', type: 'error' })
  } finally {
    isCreating.value = false
  }
}

// --- Edit dialog (role) ---
const editing = ref<StaffUser | null>(null)
const editRoleId = ref<number | null>(null)
const isSavingEdit = ref(false)

function openEdit(user: StaffUser) {
  editing.value = user
  editRoleId.value = user.roleId
}

async function saveEdit() {
  const user = editing.value
  if (!user) return
  isSavingEdit.value = true
  try {
    if (editRoleId.value && editRoleId.value !== user.roleId) {
      await $fetch(`/api/admin/staff/${user.id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: { roleId: editRoleId.value },
      })
      showToast({ title: 'Role updated', message: `${user.firstName}'s role changed. Their sessions were signed out.`, type: 'success' })
    }
    editing.value = null
    await loadData()
  } catch (err: any) {
    showToast({ title: 'Update failed', message: err?.data?.error || 'Could not update the user.', type: 'error' })
  } finally {
    isSavingEdit.value = false
  }
}

// --- Status Confirmation Modal ---
interface StatusConfirmModal {
  user: StaffUser
  action: 'DEACTIVATE' | 'RESTORE'
}
const confirmModal = ref<StatusConfirmModal | null>(null)
const isConfirmingStatus = ref(false)

function openStatusConfirmation(user: StaffUser) {
  confirmModal.value = {
    user,
    action: user.status === 'ACTIVE' ? 'DEACTIVATE' : 'RESTORE',
  }
}

async function executeStatusChange() {
  if (!confirmModal.value) return
  const { user, action } = confirmModal.value
  isConfirmingStatus.value = true
  busyUserId.value = user.id

  const nextStatus = action === 'DEACTIVATE' ? 'DEACTIVATED' : 'ACTIVE'
  try {
    await $fetch(`/api/admin/staff/${user.id}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: { status: nextStatus },
    })
    showToast({
      title: action === 'DEACTIVATE' ? 'Account Deactivated' : 'Account Restored',
      message: `${displayName(user)} is now ${action === 'DEACTIVATE' ? 'deactivated and signed out of all sessions' : 'active and can sign in'}.`,
      type: action === 'DEACTIVATE' ? 'warn' : 'success',
    })
    confirmModal.value = null
    await loadData()
  } catch (err: any) {
    showToast({
      title: 'Action failed',
      message: err?.data?.error || 'Could not update account status.',
      type: 'error',
    })
  } finally {
    isConfirmingStatus.value = false
    busyUserId.value = null
  }
}

function displayName(u: StaffUser): string {
  return `${u.firstName} ${u.lastName || ''}`.trim()
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
          <i class="pi pi-user-plus text-indigo-600 dark:text-indigo-400"></i>
          Role Users
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Admin accounts with an assigned role. Create a user and configure their permissions from Roles &amp; Permissions.
        </p>
      </div>
      <button
        type="button"
        @click="openCreate"
        class="px-4 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-sm hover:shadow-indigo-500/25 active:scale-95 flex items-center gap-2 self-start sm:self-auto cursor-pointer"
      >
        <i class="pi pi-plus text-xs"></i>
        <span>Create User</span>
      </button>
    </div>

    <!-- Metric Overview Cards -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
      <div class="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 dark:text-indigo-400 flex items-center justify-center shrink-0">
          <i class="pi pi-users text-base"></i>
        </div>
        <div>
          <p class="text-xs font-medium text-slate-500 dark:text-slate-400">Total Staff</p>
          <p class="text-lg font-bold text-slate-900 dark:text-white">{{ totalStaffCount }}</p>
        </div>
      </div>

      <div class="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 dark:text-emerald-400 flex items-center justify-center shrink-0">
          <i class="pi pi-check-circle text-base"></i>
        </div>
        <div>
          <p class="text-xs font-medium text-slate-500 dark:text-slate-400">Active</p>
          <p class="text-lg font-bold text-emerald-600 dark:text-emerald-400">{{ activeStaffCount }}</p>
        </div>
      </div>

      <div class="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center shrink-0">
          <i class="pi pi-ban text-base"></i>
        </div>
        <div>
          <p class="text-xs font-medium text-slate-500 dark:text-slate-400">Deactivated</p>
          <p class="text-lg font-bold text-rose-500">{{ deactivatedStaffCount }}</p>
        </div>
      </div>

      <div class="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
          <i class="pi pi-shield text-base"></i>
        </div>
        <div>
          <p class="text-xs font-medium text-slate-500 dark:text-slate-400">Roles Configured</p>
          <p class="text-lg font-bold text-slate-900 dark:text-white">{{ roles.length }}</p>
        </div>
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
          placeholder="Search staff by name, email or username..."
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

      <!-- Filters & Tabs -->
      <div class="flex items-center gap-2 flex-wrap">
        <!-- Status Tabs -->
        <div class="flex p-1 bg-slate-100 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 rounded-xl text-xs">
          <button
            type="button"
            @click="statusFilter = 'ALL'"
            :class="statusFilter === 'ALL' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold shadow-xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'"
            class="px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            All ({{ totalStaffCount }})
          </button>
          <button
            type="button"
            @click="statusFilter = 'ACTIVE'"
            :class="statusFilter === 'ACTIVE' ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 font-semibold shadow-xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'"
            class="px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            Active ({{ activeStaffCount }})
          </button>
          <button
            type="button"
            @click="statusFilter = 'DEACTIVATED'"
            :class="statusFilter === 'DEACTIVATED' ? 'bg-white dark:bg-slate-800 text-rose-500 font-semibold shadow-xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'"
            class="px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            Deactivated ({{ deactivatedStaffCount }})
          </button>
        </div>

        <!-- Role Filter Dropdown -->
        <select
          v-model="roleFilter"
          class="px-3 py-2 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700/60 rounded-xl text-slate-900 dark:text-white text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
        >
          <option :value="'ALL'">All Roles</option>
          <option v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }}</option>
        </select>

        <button
          v-if="searchQuery || statusFilter !== 'ALL' || roleFilter !== 'ALL'"
          type="button"
          @click="clearFilters"
          class="px-3 py-2 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white border border-dashed border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5"
        >
          <i class="pi pi-filter-slash text-[10px]"></i>
          <span>Clear</span>
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="p-12 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center text-sm text-slate-400">
      <i class="pi pi-spin pi-spinner mr-2 text-indigo-500"></i> Loading staff accounts...
    </div>

    <!-- Staff table -->
    <div v-else class="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
            <th class="px-5 py-3 font-semibold">User</th>
            <th class="px-5 py-3 font-semibold">Role</th>
            <th class="px-5 py-3 font-semibold">Status</th>
            <th class="px-5 py-3 font-semibold">Created</th>
            <th class="px-5 py-3 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60">
          <tr v-if="filteredStaff.length === 0">
            <td colspan="5" class="px-5 py-12 text-center text-xs text-slate-400">
              <div class="max-w-xs mx-auto space-y-2">
                <i class="pi pi-users text-2xl text-slate-300 dark:text-slate-600"></i>
                <p class="font-medium text-slate-700 dark:text-slate-300">No staff accounts found</p>
                <p class="text-[11px] text-slate-400">Try changing your search terms or active status filter.</p>
                <button
                  v-if="searchQuery || statusFilter !== 'ALL' || roleFilter !== 'ALL'"
                  type="button"
                  @click="clearFilters"
                  class="mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  Reset Filters
                </button>
              </div>
            </td>
          </tr>

          <tr
            v-for="u in filteredStaff"
            :key="u.id"
            :class="{ 'opacity-60 bg-slate-50/40 dark:bg-slate-950/20': u.status === 'DEACTIVATED' }"
            class="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
          >
            <td class="px-5 py-3.5">
              <div class="flex items-center gap-3">
                <div
                  class="w-8 h-8 rounded-full border flex items-center justify-center text-[11px] font-bold shrink-0"
                  :class="u.status === 'DEACTIVATED'
                    ? 'bg-slate-500/10 border-slate-500/30 text-slate-400'
                    : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-600 dark:text-indigo-400'"
                >
                  {{ displayName(u).slice(0, 2).toUpperCase() }}
                </div>
                <div class="min-w-0">
                  <p class="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>{{ displayName(u) }}</span>
                    <span
                      v-if="u.role === 'SUPERADMIN'"
                      class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30"
                    >SUPERADMIN</span>
                    <span
                      v-else-if="u.mustChangePassword"
                      class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20"
                      title="Temporary password — must change at first login"
                    >temp pw</span>
                  </p>
                  <p class="text-xs text-slate-400 truncate">{{ u.email }}<span v-if="u.username"> · @{{ u.username }}</span></p>
                </div>
              </div>
            </td>
            <td class="px-5 py-3.5">
              <span
                v-if="u.role === 'SUPERADMIN'"
                class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20"
              >Owner — full access</span>
              <span
                v-else
                class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border border-indigo-500/20"
              >{{ u.roleName || 'No role assigned' }}</span>
            </td>
            <td class="px-5 py-3.5">
              <span
                class="px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 w-fit"
                :class="u.status === 'ACTIVE'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'"
              >
                <span class="w-1.5 h-1.5 rounded-full" :class="u.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-rose-500'"></span>
                {{ u.status }}
              </span>
            </td>
            <td class="px-5 py-3.5 text-xs text-slate-400 whitespace-nowrap">
              {{ formatMyanmarDate(u.createdAt) }}
            </td>
            <td class="px-5 py-3.5">
              <div class="flex items-center justify-end gap-2">
                <template v-if="u.role !== 'SUPERADMIN'">
                  <button
                    type="button"
                    @click="openEdit(u)"
                    :disabled="busyUserId === u.id"
                    class="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 border border-indigo-600/20 hover:bg-indigo-600/20 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <i class="pi pi-pencil mr-1 text-[10px]"></i>Role
                  </button>
                  <button
                    type="button"
                    @click="openStatusConfirmation(u)"
                    :disabled="busyUserId === u.id"
                    class="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                    :class="u.status === 'ACTIVE'
                      ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500/20'
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'"
                  >
                    <i v-if="busyUserId === u.id" class="pi pi-spin pi-spinner text-[10px]"></i>
                    <i v-else-if="u.status === 'ACTIVE'" class="pi pi-ban text-[10px]"></i>
                    <i v-else class="pi pi-refresh text-[10px]"></i>
                    <span>{{ u.status === 'ACTIVE' ? 'Deactivate' : 'Restore' }}</span>
                  </button>
                </template>
                <span v-else class="text-[11px] text-slate-400 italic">Protected</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Create Admin User Dialog (Centered) -->
    <Teleport to="body">
      <div
        v-if="isCreateOpen"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-sm overflow-y-auto"
        @click.self="isCreateOpen = false"
      >
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
          <!-- Dialog Header -->
          <div class="flex items-center justify-between p-5 pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 dark:text-indigo-400 flex items-center justify-center">
                <i class="pi pi-user-plus text-sm"></i>
              </div>
              <div>
                <h3 class="font-bold text-slate-900 dark:text-white text-sm">Create Admin User</h3>
                <p class="text-xs text-slate-400 mt-0.5">They will be prompted to set a permanent password upon first login.</p>
              </div>
            </div>
            <button
              type="button"
              @click="isCreateOpen = false"
              class="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <i class="pi pi-times text-xs"></i>
            </button>
          </div>

          <!-- Dialog Body -->
          <div class="p-5 space-y-4 overflow-y-auto">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wider mb-1.5">First Name *</label>
                <input
                  v-model="form.firstName"
                  type="text"
                  placeholder="Htet"
                  class="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700/60 rounded-xl text-slate-900 dark:text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                />
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wider mb-1.5">Last Name</label>
                <input
                  v-model="form.lastName"
                  type="text"
                  placeholder="Myat"
                  class="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700/60 rounded-xl text-slate-900 dark:text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wider mb-1.5">Email Address *</label>
              <input
                v-model="form.email"
                type="email"
                placeholder="staff@arenastore.mm"
                class="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700/60 rounded-xl text-slate-900 dark:text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wider mb-1.5">Username (optional)</label>
              <input
                v-model="form.username"
                type="text"
                placeholder="staff_htet"
                class="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700/60 rounded-xl text-slate-900 dark:text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
            </div>

            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label class="text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Temporary Password *</label>
                <button
                  type="button"
                  @click="handleRegeneratePassword"
                  class="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <i class="pi pi-sync text-[10px]"></i>
                  <span>Generate strong</span>
                </button>
              </div>
              <div class="relative">
                <input
                  v-model="form.password"
                  :type="showCreatePassword ? 'text' : 'password'"
                  placeholder="At least 8 characters"
                  class="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700/60 rounded-xl text-slate-900 dark:text-white text-sm font-mono focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                />
                <button
                  type="button"
                  @click="showCreatePassword = !showCreatePassword"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                >
                  <i :class="showCreatePassword ? 'pi pi-eye-slash' : 'pi pi-eye'" class="text-xs"></i>
                </button>
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wider mb-1.5">Role Assignment *</label>
              <select
                v-model="form.roleId"
                class="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700/60 rounded-xl text-slate-900 dark:text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors cursor-pointer"
              >
                <option v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }} ({{ r.userCount }} users assigned)</option>
              </select>
              <p v-if="roles.length === 0" class="text-[11px] text-amber-500 mt-1.5">
                No roles configured yet — create one on Roles &amp; Permissions first.
              </p>
            </div>
          </div>

          <!-- Dialog Footer -->
          <div class="flex items-center justify-end gap-2.5 p-5 pt-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
            <button
              type="button"
              @click="isCreateOpen = false"
              class="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              @click="createStaff"
              :disabled="isCreating"
              class="px-5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <i v-if="isCreating" class="pi pi-spin pi-spinner text-xs"></i>
              <i v-else class="pi pi-check text-xs"></i>
              <span>Create User</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Edit Role Dialog (Centered) -->
    <Teleport to="body">
      <div
        v-if="editing"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-sm overflow-y-auto"
        @click.self="editing = null"
      >
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4 my-auto">
          <div class="flex items-center justify-between">
            <h3 class="font-bold text-slate-900 dark:text-white text-sm">Change Role for {{ displayName(editing) }}</h3>
            <button
              type="button"
              @click="editing = null"
              class="text-slate-400 hover:text-slate-600 dark:hover:text-white"
            >
              <i class="pi pi-times text-xs"></i>
            </button>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Select Role</label>
            <select
              v-model="editRoleId"
              class="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700/60 rounded-xl text-slate-900 dark:text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors cursor-pointer"
            >
              <option v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }}</option>
            </select>
          </div>

          <div class="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-2">
            <i class="pi pi-info-circle mt-0.5 shrink-0"></i>
            <span>Changing this user's role will immediately sign them out of all active browser sessions.</span>
          </div>

          <div class="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              @click="editing = null"
              class="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              @click="saveEdit"
              :disabled="isSavingEdit"
              class="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              <i v-if="isSavingEdit" class="pi pi-spin pi-spinner text-xs"></i>
              <span>Save Changes</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Confirmation Modal: Deactivate / Restore -->
    <Teleport to="body">
      <div
        v-if="confirmModal"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/75 backdrop-blur-sm overflow-y-auto"
        @click.self="!isConfirmingStatus ? (confirmModal = null) : null"
      >
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full shadow-2xl p-6 space-y-4 my-auto">
          <!-- Icon & Title -->
          <div class="flex items-start gap-3.5">
            <div
              class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border"
              :class="confirmModal.action === 'DEACTIVATE'
                ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'"
            >
              <i :class="confirmModal.action === 'DEACTIVATE' ? 'pi pi-exclamation-triangle text-base' : 'pi pi-check-circle text-base'"></i>
            </div>
            <div>
              <h3 class="font-bold text-slate-900 dark:text-white text-base">
                {{ confirmModal.action === 'DEACTIVATE' ? 'Deactivate Admin Account?' : 'Restore Admin Account?' }}
              </h3>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                <template v-if="confirmModal.action === 'DEACTIVATE'">
                  Are you sure you want to deactivate <strong class="text-slate-900 dark:text-white">{{ displayName(confirmModal.user) }}</strong> (<span class="font-mono">{{ confirmModal.user.email }}</span>)?
                  All active login sessions will be immediately revoked, and they will be blocked from accessing the admin dashboard.
                </template>
                <template v-else>
                  Are you sure you want to restore access for <strong class="text-slate-900 dark:text-white">{{ displayName(confirmModal.user) }}</strong> (<span class="font-mono">{{ confirmModal.user.email }}</span>)?
                  They will be able to log in again with their assigned role.
                </template>
              </p>
            </div>
          </div>

          <!-- Action buttons -->
          <div class="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              @click="confirmModal = null"
              :disabled="isConfirmingStatus"
              class="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              @click="executeStatusChange"
              :disabled="isConfirmingStatus"
              class="px-4 py-2 rounded-xl text-xs font-semibold text-white flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-sm"
              :class="confirmModal.action === 'DEACTIVATE'
                ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'"
            >
              <i v-if="isConfirmingStatus" class="pi pi-spin pi-spinner text-xs"></i>
              <i v-else-if="confirmModal.action === 'DEACTIVATE'" class="pi pi-ban text-xs"></i>
              <i v-else class="pi pi-check text-xs"></i>
              <span>{{ confirmModal.action === 'DEACTIVATE' ? 'Deactivate User' : 'Restore User' }}</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

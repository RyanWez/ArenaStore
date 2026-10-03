<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { usePermission } from '~/composables/usePermission'
import { useToast } from '~/composables/useToast'

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
const form = ref({
  firstName: '',
  lastName: '',
  email: '',
  username: '',
  password: '',
  roleId: null as number | null,
})

function openCreate() {
  form.value = { firstName: '', lastName: '', email: '', username: '', password: '', roleId: roles.value[0]?.id ?? null }
  isCreateOpen.value = true
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

// --- Edit dialog (role / status) ---
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

async function toggleStatus(user: StaffUser) {
  const nextStatus = user.status === 'ACTIVE' ? 'DEACTIVATED' : 'ACTIVE'
  busyUserId.value = user.id
  try {
    await $fetch(`/api/admin/staff/${user.id}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: { status: nextStatus },
    })
    showToast({
      title: nextStatus === 'DEACTIVATED' ? 'User deactivated' : 'User restored',
      message: `${user.firstName} is now ${nextStatus === 'DEACTIVATED' ? 'locked out' : 'active again'}.`,
      type: 'success',
    })
    await loadData()
  } catch (err: any) {
    showToast({ title: 'Update failed', message: err?.data?.error || 'Could not update the user.', type: 'error' })
  } finally {
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
          Admin accounts with a role assignment. Create a user, pick the role from Roles &amp; Permissions.
        </p>
      </div>
      <button
        type="button"
        @click="openCreate"
        class="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors flex items-center gap-2 shadow-sm"
      >
        <i class="pi pi-plus text-xs"></i>
        <span>Create User</span>
      </button>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="p-10 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center text-sm text-slate-400">
      <i class="pi pi-spin pi-spinner mr-2"></i> Loading staff accounts...
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
          <tr v-for="u in staff" :key="u.id">
            <td class="px-5 py-3.5">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/30 text-cyan-500 dark:text-cyan-400 flex items-center justify-center text-[11px] font-bold shrink-0">
                  {{ displayName(u).slice(0, 2).toUpperCase() }}
                </div>
                <div class="min-w-0">
                  <p class="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    {{ displayName(u) }}
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
              >Owner — all permissions</span>
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
            <td class="px-5 py-3.5 text-xs text-slate-400">
              {{ u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—' }}
            </td>
            <td class="px-5 py-3.5">
              <div class="flex items-center justify-end gap-2">
                <template v-if="u.role !== 'SUPERADMIN'">
                  <button
                    type="button"
                    @click="openEdit(u)"
                    class="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 border border-indigo-600/20 hover:bg-indigo-600/20 transition-colors"
                  >
                    <i class="pi pi-pencil mr-1 text-[10px]"></i>Role
                  </button>
                  <button
                    type="button"
                    @click="toggleStatus(u)"
                    :disabled="busyUserId === u.id"
                    class="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-50"
                    :class="u.status === 'ACTIVE'
                      ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500/20'
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'"
                  >
                    {{ busyUserId === u.id ? '...' : u.status === 'ACTIVE' ? 'Deactivate' : 'Restore' }}
                  </button>
                </template>
                <span v-else class="text-[11px] text-slate-400">Protected</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Create dialog -->
    <Teleport to="body">
      <div
        v-if="isCreateOpen"
        class="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8 bg-slate-950/70 backdrop-blur-sm overflow-y-auto"
        @click.self="isCreateOpen = false"
      >
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl space-y-5">
          <div class="flex items-center justify-between p-5 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 class="font-bold text-slate-900 dark:text-white text-sm">Create Admin User</h3>
              <p class="text-xs text-slate-400 mt-0.5">They will be asked to set a new password at first login.</p>
            </div>
            <button
              type="button"
              @click="isCreateOpen = false"
              class="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <i class="pi pi-times text-xs"></i>
            </button>
          </div>

          <div class="px-5 space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wider mb-1.5">First Name *</label>
                <input v-model="form.firstName" type="text" placeholder="Htet" class="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700/60 rounded-xl text-slate-900 dark:text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wider mb-1.5">Last Name</label>
                <input v-model="form.lastName" type="text" placeholder="Myat" class="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700/60 rounded-xl text-slate-900 dark:text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors" />
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wider mb-1.5">Email *</label>
              <input v-model="form.email" type="email" placeholder="htet@arenastore.mm" class="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700/60 rounded-xl text-slate-900 dark:text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors" />
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wider mb-1.5">Username (optional)</label>
              <input v-model="form.username" type="text" placeholder="htetmyat" class="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700/60 rounded-xl text-slate-900 dark:text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors" />
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wider mb-1.5">Temporary Password *</label>
              <input v-model="form.password" type="text" placeholder="At least 8 characters" class="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700/60 rounded-xl text-slate-900 dark:text-white text-sm font-mono focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors" />
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wider mb-1.5">Role *</label>
              <select v-model="form.roleId" class="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700/60 rounded-xl text-slate-900 dark:text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors">
                <option v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }} ({{ r.userCount }} users)</option>
              </select>
              <p v-if="roles.length === 0" class="text-[11px] text-amber-500 mt-1.5">
                No roles yet — create one on the Roles &amp; Permissions page first.
              </p>
            </div>
          </div>

          <div class="flex items-center justify-end gap-2.5 p-5 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              @click="isCreateOpen = false"
              class="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              @click="createStaff"
              :disabled="isCreating"
              class="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm flex items-center gap-1.5 disabled:opacity-50"
            >
              <i v-if="isCreating" class="pi pi-spin pi-spinner text-xs"></i>
              <i v-else class="pi pi-check text-xs"></i>
              <span>Create User</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Edit role dialog -->
    <Teleport to="body">
      <div
        v-if="editing"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
        @click.self="editing = null"
      >
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
          <h3 class="font-bold text-slate-900 dark:text-white text-sm">Change role for {{ displayName(editing) }}</h3>
          <select v-model="editRoleId" class="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700/60 rounded-xl text-slate-900 dark:text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors">
            <option v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }}</option>
          </select>
          <p class="text-[11px] text-slate-400">Changing the role signs the user out of all sessions immediately.</p>
          <div class="flex justify-end gap-2.5 pt-1">
            <button
              type="button"
              @click="editing = null"
              class="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              @click="saveEdit"
              :disabled="isSavingEdit"
              class="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

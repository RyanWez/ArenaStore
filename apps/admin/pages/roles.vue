<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { useToast } from '~/composables/useToast'

interface PermissionDef {
  key: string
  page: string
  label: string
  type: 'view' | 'action' | 'field'
}

interface RoleDef {
  id: number
  name: string
  key: string
  description: string | null
  isSystem: boolean
  userCount: number
  permissions: string[]
}

interface DefaultRoleDef {
  name: string
  key: string
  description: string
  permissions: string[]
}

const { getAuthHeaders } = useAuth()
const { showToast } = useToast()

const roles = ref<RoleDef[]>([])
const catalog = ref<PermissionDef[]>([])
const defaultRoles = ref<DefaultRoleDef[]>([])
const isLoading = ref(true)

// Pages in catalog order for the checklist grouping
const pages = computed(() => {
  const seen: string[] = []
  for (const p of catalog.value) {
    if (!seen.includes(p.page)) seen.push(p.page)
  }
  return seen
})

function permissionsForPage(page: string): PermissionDef[] {
  return catalog.value.filter((p) => p.page === page)
}

const isDialogOpen = ref(false)
const isSaving = ref(false)
const editingRole = ref<RoleDef | null>(null)
const formName = ref('')
const formDescription = ref('')
const formPermissions = ref<Set<string>>(new Set())

const typeChipClass: Record<string, string> = {
  view: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  action: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  field: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
}

async function loadData() {
  isLoading.value = true
  try {
    const [rolesRes, catalogRes]: any[] = await Promise.all([
      $fetch('/api/admin/roles', { headers: getAuthHeaders() }),
      $fetch('/api/admin/permissions/catalog', { headers: getAuthHeaders() }),
    ])
    roles.value = rolesRes.roles ?? []
    catalog.value = catalogRes.catalog ?? []
    defaultRoles.value = catalogRes.defaultRoles ?? []
  } catch (err: any) {
    showToast({ title: 'Load failed', message: err?.data?.error || 'Could not load roles.', type: 'error' })
  } finally {
    isLoading.value = false
  }
}

onMounted(loadData)

function openCreate() {
  editingRole.value = null
  formName.value = ''
  formDescription.value = ''
  formPermissions.value = new Set()
  isDialogOpen.value = true
}

function openEdit(role: RoleDef) {
  editingRole.value = role
  formName.value = role.name
  formDescription.value = role.description || ''
  formPermissions.value = new Set(role.permissions)
  isDialogOpen.value = true
}

function togglePermission(key: string) {
  const next = new Set(formPermissions.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  formPermissions.value = next
}

function checkPage(page: string) {
  for (const p of permissionsForPage(page)) formPermissions.value.add(p.key)
  formPermissions.value = new Set(formPermissions.value)
}

function uncheckPage(page: string) {
  for (const p of permissionsForPage(page)) formPermissions.value.delete(p.key)
  formPermissions.value = new Set(formPermissions.value)
}

function resetToDefault() {
  const key = editingRole.value?.key
  const def = defaultRoles.value.find((r) => r.key === key)
  if (!def) return
  formPermissions.value = new Set(def.permissions)
}

const defaultRoleForEditing = computed(() =>
  editingRole.value ? defaultRoles.value.find((r) => r.key === editingRole.value?.key) : null
)

async function saveRole() {
  if (!formName.value.trim()) {
    showToast({ title: 'Name required', message: 'Please enter a role name.', type: 'warn' })
    return
  }

  isSaving.value = true
  try {
    const payload = {
      name: formName.value.trim(),
      description: formDescription.value.trim() || undefined,
      permissions: Array.from(formPermissions.value),
    }

    if (editingRole.value) {
      await $fetch(`/api/admin/roles/${editingRole.value.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: payload,
      })
      showToast({ title: 'Role updated', message: `${payload.name} permissions saved. Changes apply immediately.`, type: 'success' })
    } else {
      await $fetch('/api/admin/roles', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: payload,
      })
      showToast({ title: 'Role created', message: `${payload.name} is ready — assign it on the Role Users page.`, type: 'success' })
    }
    isDialogOpen.value = false
    await loadData()
  } catch (err: any) {
    showToast({ title: 'Save failed', message: err?.data?.error || 'Could not save the role.', type: 'error' })
  } finally {
    isSaving.value = false
  }
}

const deletingRole = ref<RoleDef | null>(null)

async function confirmDelete() {
  const role = deletingRole.value
  if (!role) return
  try {
    await $fetch(`/api/admin/roles/${role.id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })
    showToast({ title: 'Role deleted', message: `${role.name} has been removed.`, type: 'success' })
    deletingRole.value = null
    await loadData()
  } catch (err: any) {
    showToast({ title: 'Delete failed', message: err?.data?.error || 'Could not delete the role.', type: 'error' })
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
          <i class="pi pi-shield text-indigo-600 dark:text-indigo-400"></i>
          Roles &amp; Permissions
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Create roles and pick, page by page, what each role can see and do. Changes apply immediately.
        </p>
      </div>
      <button
        type="button"
        @click="openCreate"
        class="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors flex items-center gap-2 shadow-sm"
      >
        <i class="pi pi-plus text-xs"></i>
        <span>Create Role</span>
      </button>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="p-10 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center text-sm text-slate-400">
      <i class="pi pi-spin pi-spinner mr-2"></i> Loading roles...
    </div>

    <!-- SUPERADMIN note + Roles list -->
    <div v-else class="space-y-4">
      <div class="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-start gap-3">
        <i class="pi pi-star text-indigo-400 mt-0.5"></i>
        <p class="text-xs text-indigo-300/90 leading-relaxed">
          <strong>SUPERADMIN</strong> always has every permission and bypasses this list — it cannot be edited or deleted here.
        </p>
      </div>

      <div
        v-for="role in roles"
        :key="role.id"
        class="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <h3 class="text-sm font-bold text-slate-900 dark:text-white">{{ role.name }}</h3>
            <span class="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">
              {{ role.key }}
            </span>
            <span
              v-if="role.isSystem"
              class="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20"
            >
              default
            </span>
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate max-w-xl">
            {{ role.description || 'No description' }}
          </p>
          <p class="text-[11px] text-slate-400 mt-1.5 flex items-center gap-3">
            <span><i class="pi pi-check-square mr-1"></i>{{ role.permissions.length }} permissions</span>
            <span><i class="pi pi-users mr-1"></i>{{ role.userCount }} user{{ role.userCount === 1 ? '' : 's' }}</span>
          </p>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <button
            type="button"
            @click="openEdit(role)"
            class="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 border border-indigo-600/20 hover:bg-indigo-600/20 transition-colors"
          >
            <i class="pi pi-pencil mr-1.5 text-[10px]"></i>Edit Permissions
          </button>
          <button
            type="button"
            :disabled="role.userCount > 0"
            @click="deletingRole = role"
            title="Delete role"
            class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <i class="pi pi-trash text-[10px]"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- Create / Edit Dialog -->
    <Teleport to="body">
      <div
        v-if="isDialogOpen"
        class="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8 bg-slate-950/70 backdrop-blur-sm overflow-y-auto"
        @click.self="isDialogOpen = false"
      >
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl space-y-5">
          <div class="flex items-center justify-between p-5 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 class="font-bold text-slate-900 dark:text-white text-sm">
                {{ editingRole ? `Edit Role — ${editingRole.name}` : 'Create Role' }}
              </h3>
              <p class="text-xs text-slate-400 mt-0.5">Tick what this role may see and do, page by page.</p>
            </div>
            <button
              type="button"
              @click="isDialogOpen = false"
              class="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <i class="pi pi-times text-xs"></i>
            </button>
          </div>

          <div class="px-5 space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wider mb-1.5">Role Name</label>
                <input
                  v-model="formName"
                  type="text"
                  placeholder="e.g. Finance Team"
                  class="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700/60 rounded-xl text-slate-900 dark:text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                />
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wider mb-1.5">Description (optional)</label>
                <input
                  v-model="formDescription"
                  type="text"
                  placeholder="What is this role for?"
                  class="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700/60 rounded-xl text-slate-900 dark:text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                />
              </div>
            </div>

            <div v-if="defaultRoleForEditing" class="flex items-center justify-between p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <p class="text-[11px] text-amber-700 dark:text-amber-300">
                This is a default role — restore its original permission set any time.
              </p>
              <button
                type="button"
                @click="resetToDefault"
                class="px-3 py-1 rounded-lg text-[11px] font-semibold bg-amber-600 hover:bg-amber-700 text-white transition-colors shrink-0"
              >
                Reset to Default
              </button>
            </div>
          </div>

          <!-- Page-grouped checklist -->
          <div class="px-5 pb-5 space-y-3 max-h-[50vh] overflow-y-auto">
            <div
              v-for="page in pages"
              :key="page"
              class="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
              <div class="px-4 py-2 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
                <span class="text-xs font-bold text-slate-600 dark:text-slate-200 uppercase tracking-wider">{{ page }}</span>
                <div class="flex items-center gap-1.5">
                  <button type="button" @click="checkPage(page)" class="text-[10px] font-semibold text-indigo-500 hover:text-indigo-400 px-1.5">all</button>
                  <button type="button" @click="uncheckPage(page)" class="text-[10px] font-semibold text-slate-400 hover:text-slate-300 px-1.5">none</button>
                </div>
              </div>
              <div class="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label
                  v-for="perm in permissionsForPage(page)"
                  :key="perm.key"
                  class="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    :checked="formPermissions.has(perm.key)"
                    @change="togglePermission(perm.key)"
                    class="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                  />
                  <span class="text-xs text-slate-700 dark:text-slate-200 flex-1">{{ perm.label }}</span>
                  <span
                    class="px-1.5 py-0.5 rounded text-[9px] font-semibold border"
                    :class="typeChipClass[perm.type]"
                  >{{ perm.type }}</span>
                </label>
              </div>
            </div>
          </div>

          <div class="flex items-center justify-end gap-2.5 p-5 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              @click="isDialogOpen = false"
              class="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              @click="saveRole"
              :disabled="isSaving"
              class="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm flex items-center gap-1.5 disabled:opacity-50"
            >
              <i v-if="isSaving" class="pi pi-spin pi-spinner text-xs"></i>
              <i v-else class="pi pi-check text-xs"></i>
              <span>{{ editingRole ? 'Save Changes' : 'Create Role' }}</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Delete confirm dialog -->
    <Teleport to="body">
      <div
        v-if="deletingRole"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
        @click.self="deletingRole = null"
      >
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
          <h3 class="font-bold text-slate-900 dark:text-white text-sm">Delete role "{{ deletingRole.name }}"?</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            This removes the role and its permission set. Users are unaffected only if the role has none assigned.
          </p>
          <div class="flex justify-end gap-2.5 pt-1">
            <button
              type="button"
              @click="deletingRole = null"
              class="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              @click="confirmDelete"
              class="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

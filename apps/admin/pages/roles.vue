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

function pageViewPermission(page: string): PermissionDef | undefined {
  return permissionsForPage(page).find((p) => p.type === 'view')
}

function isPageEnabled(page: string): boolean {
  const viewPerm = pageViewPermission(page)
  if (viewPerm) {
    return formPermissions.value.has(viewPerm.key)
  }
  // Pages without an explicit 'view' type (e.g., User Management)
  return permissionsForPage(page).some((p) => formPermissions.value.has(p.key))
}

function pageActiveCount(page: string): number {
  return permissionsForPage(page).filter((p) => formPermissions.value.has(p.key)).length
}

function togglePageMaster(page: string, enable: boolean) {
  const perms = permissionsForPage(page)
  const next = new Set(formPermissions.value)

  if (!enable) {
    // When turning off page: remove ALL permissions for this page
    for (const p of perms) {
      next.delete(p.key)
    }
  } else {
    // When turning on page:
    const viewPerm = pageViewPermission(page)
    if (viewPerm) {
      next.add(viewPerm.key)
    } else {
      for (const p of perms) {
        next.add(p.key)
      }
    }
  }

  formPermissions.value = next
}

function togglePermission(key: string, page: string) {
  const next = new Set(formPermissions.value)
  const perms = permissionsForPage(page)
  const viewPerm = pageViewPermission(page)
  const target = perms.find((p) => p.key === key)

  if (next.has(key)) {
    // Unchecking
    next.delete(key)
    // If view permission is unchecked, uncheck ALL child permissions for this page!
    if (target?.type === 'view') {
      for (const p of perms) {
        next.delete(p.key)
      }
    }
  } else {
    // Checking
    next.add(key)
    // Ensure parent view permission is also enabled
    if (viewPerm) {
      next.add(viewPerm.key)
    }
  }

  formPermissions.value = next
}

function checkPage(page: string) {
  const next = new Set(formPermissions.value)
  for (const p of permissionsForPage(page)) formPermissions.value.add(p.key)
  formPermissions.value = new Set(formPermissions.value)
}

function uncheckPage(page: string) {
  const next = new Set(formPermissions.value)
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
          <div class="mt-2.5 flex items-center gap-1.5 flex-wrap">
            <span
              class="px-2 py-0.5 rounded text-[10px] font-medium border transition-colors flex items-center gap-1"
              :class="role.permissions.includes('settings.view')
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                : 'bg-slate-500/10 text-slate-400 border-slate-500/20 opacity-50 line-through'"
            >
              <i class="pi" :class="role.permissions.includes('settings.view') ? 'pi-check text-[8px]' : 'pi-times text-[8px]'"></i>
              Rates &amp; Margins
            </span>
            <span
              class="px-2 py-0.5 rounded text-[10px] font-medium border transition-colors flex items-center gap-1"
              :class="role.permissions.includes('products.view')
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                : 'bg-slate-500/10 text-slate-400 border-slate-500/20 opacity-50 line-through'"
            >
              <i class="pi" :class="role.permissions.includes('products.view') ? 'pi-check text-[8px]' : 'pi-times text-[8px]'"></i>
              Products
            </span>
            <span
              class="px-2 py-0.5 rounded text-[10px] font-medium border transition-colors flex items-center gap-1"
              :class="role.permissions.includes('orders.view')
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                : 'bg-slate-500/10 text-slate-400 border-slate-500/20 opacity-50 line-through'"
            >
              <i class="pi" :class="role.permissions.includes('orders.view') ? 'pi-check text-[8px]' : 'pi-times text-[8px]'"></i>
              Orders
            </span>
            <span
              class="px-2 py-0.5 rounded text-[10px] font-medium border transition-colors flex items-center gap-1"
              :class="role.permissions.includes('payments.view')
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                : 'bg-slate-500/10 text-slate-400 border-slate-500/20 opacity-50 line-through'"
            >
              <i class="pi" :class="role.permissions.includes('payments.view') ? 'pi-check text-[8px]' : 'pi-times text-[8px]'"></i>
              Deposits
            </span>
            <span
              class="px-2 py-0.5 rounded text-[10px] font-medium border transition-colors flex items-center gap-1"
              :class="role.permissions.includes('customers.view')
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                : 'bg-slate-500/10 text-slate-400 border-slate-500/20 opacity-50 line-through'"
            >
              <i class="pi" :class="role.permissions.includes('customers.view') ? 'pi-check text-[8px]' : 'pi-times text-[8px]'"></i>
              Wallets
            </span>
          </div>
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
        class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-sm overflow-y-auto"
        @click.self="isDialogOpen = false"
      >
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl my-auto max-h-[92vh] flex flex-col overflow-hidden">
          <div class="flex items-center justify-between p-5 pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
            <div>
              <h3 class="font-bold text-slate-900 dark:text-white text-sm">
                {{ editingRole ? `Edit Role — ${editingRole.name}` : 'Create Role' }}
              </h3>
              <p class="text-xs text-slate-400 mt-0.5">Tick what this role may see and do, page by page.</p>
            </div>
            <button
              type="button"
              @click="isDialogOpen = false"
              class="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <i class="pi pi-times text-xs"></i>
            </button>
          </div>

          <div class="p-5 space-y-4 overflow-y-auto flex-1">
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
              class="rounded-xl border transition-all duration-200 overflow-hidden"
              :class="isPageEnabled(page)
                ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm'
                : 'border-slate-200/60 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-950/30'"
            >
              <!-- Page Header with Master Switch -->
              <div
                class="px-4 py-2.5 flex items-center justify-between border-b transition-colors"
                :class="isPageEnabled(page)
                  ? 'bg-slate-50/90 dark:bg-slate-800/60 border-slate-200 dark:border-slate-800/80'
                  : 'bg-slate-100/60 dark:bg-slate-900/40 border-slate-200/50 dark:border-slate-800/50'"
              >
                <div class="flex items-center gap-3">
                  <!-- Master Switch Toggle -->
                  <button
                    type="button"
                    role="switch"
                    :aria-checked="isPageEnabled(page)"
                    @click="togglePageMaster(page, !isPageEnabled(page))"
                    class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none shadow-inner"
                    :class="isPageEnabled(page) ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'"
                    :title="isPageEnabled(page) ? `Turn off ${page} access` : `Turn on ${page} access`"
                  >
                    <span
                      class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
                      :class="isPageEnabled(page) ? 'translate-x-4' : 'translate-x-0'"
                    />
                  </button>

                  <div class="flex items-center gap-2">
                    <span
                      class="text-xs font-bold uppercase tracking-wider transition-colors"
                      :class="isPageEnabled(page) ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'"
                    >
                      {{ page }}
                    </span>
                    <span
                      v-if="!isPageEnabled(page)"
                      class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-500 dark:text-rose-400 border border-rose-500/20 uppercase"
                    >
                      Disabled
                    </span>
                    <span
                      v-else
                      class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                    >
                      {{ pageActiveCount(page) }} of {{ permissionsForPage(page).length }} active
                    </span>
                  </div>
                </div>

                <div v-if="isPageEnabled(page)" class="flex items-center gap-1.5">
                  <button
                    type="button"
                    @click="checkPage(page)"
                    class="text-[10px] font-semibold text-indigo-500 hover:text-indigo-400 px-1.5 py-0.5 rounded hover:bg-indigo-500/10 transition-colors"
                  >
                    all
                  </button>
                  <button
                    type="button"
                    @click="uncheckPage(page)"
                    class="text-[10px] font-semibold text-slate-400 hover:text-slate-300 px-1.5 py-0.5 rounded hover:bg-slate-500/10 transition-colors"
                  >
                    none
                  </button>
                </div>
              </div>

              <!-- Permission checkboxes -->
              <div
                class="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 transition-all duration-200"
                :class="isPageEnabled(page) ? 'opacity-100' : 'opacity-40 pointer-events-none select-none'"
              >
                <label
                  v-for="perm in permissionsForPage(page)"
                  :key="perm.key"
                  class="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                  :class="{ 'bg-indigo-50/40 dark:bg-indigo-950/20': formPermissions.has(perm.key) }"
                >
                  <input
                    type="checkbox"
                    :checked="formPermissions.has(perm.key)"
                    :disabled="!isPageEnabled(page)"
                    @change="togglePermission(perm.key, page)"
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

          <div class="flex items-center justify-end gap-2.5 p-5 pt-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
            <button
              type="button"
              @click="isDialogOpen = false"
              class="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
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

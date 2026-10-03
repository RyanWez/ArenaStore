import { useAuth } from '~/composables/useAuth'

/**
 * Permission gate for the admin panel UI. `can()` mirrors the API's
 * requirePermission() checks — the server remains the security boundary,
 * these gates only control what is rendered (view-only mode).
 */
export function usePermission() {
  const { permissions, roleInfo } = useAuth()

  /** True when the signed-in admin's role grants the permission key. */
  function can(permission: string): boolean {
    return permissions.value.includes(permission)
  }

  const isSuperadmin = computed(() => !!roleInfo.value?.isSuperadmin)
  /** Display name of the assigned role (SUPERADMIN for the owner account). */
  const roleName = computed(() => roleInfo.value?.name || roleInfo.value || null)

  return { can, isSuperadmin, roleName, permissions, roleInfo }
}

import { useAuth } from '~/composables/useAuth'

/**
 * Sidebar page → view permission. A role without the view permission never
 * sees the page; the API enforces the same keys server-side.
 */
const PAGE_PERMISSIONS: Record<string, string> = {
  '/': 'overview.view',
  '/analytics': 'analytics.view',
  '/supplier': 'supplier.view',
  '/products': 'products.view',
  '/orders': 'orders.view',
  '/payments': 'payments.view',
  '/customers': 'customers.view',
  '/rates': 'settings.pricing',
  '/settings': 'settings.view',
  '/users': 'users.manage',
  '/roles': 'roles.manage',
  '/audit': 'audit.view',
}

function requiredPermissionFor(path: string): string | null {
  if (PAGE_PERMISSIONS[path]) return PAGE_PERMISSIONS[path];
  // Prefix match for nested routes like /customers/:id
  const prefixes = Object.keys(PAGE_PERMISSIONS)
    .filter((p) => p !== '/' && path.startsWith(p + '/'))
    .sort((a, b) => b.length - a.length);
  return prefixes[0] ? PAGE_PERMISSIONS[prefixes[0]] : null;
}

export default defineNuxtRouteMiddleware(async (to) => {
  const { user, fetchUser, mustChangePassword, permissions } = useAuth()

  const isLoginPage = to.path === '/login'
  const isChangePasswordPage = to.path === '/change-password'

  // If user profile isn't in memory yet, check active session via /api/admin/auth/me
  if (!user.value) {
    await fetchUser()
  }

  // If visiting /login while already authenticated, redirect to dashboard
  if (isLoginPage) {
    if (user.value) {
      return navigateTo(mustChangePassword.value ? '/change-password' : '/')
    }
    return
  }

  // For all other pages, require authentication
  if (!user.value) {
    return navigateTo('/login')
  }

  // Staff created with a temporary password must rotate it before anything else
  if (mustChangePassword.value && !isChangePasswordPage) {
    return navigateTo('/change-password')
  }
  if (!mustChangePassword.value && isChangePasswordPage) {
    return navigateTo('/')
  }

  // View-permission gate per page — mirror of the API's requirePermission map.
  // A role with zero permissions is denied everywhere (fail closed); only
  // /denied and the forced password-change page remain reachable.
  if (to.path !== '/denied') {
    const required = requiredPermissionFor(to.path)
    if (required && !permissions.value.includes(required)) {
      return navigateTo('/denied')
    }
  }
})

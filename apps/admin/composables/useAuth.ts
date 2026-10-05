export interface AdminUser {
  id: number;
  email: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  role: string;
}

export interface AdminRoleInfo {
  id: number | null;
  name: string | null;
  isSuperadmin: boolean;
}

export function useAuth() {
  const token = useState<string | null>('admin_token', () => null);
  const user = useState<AdminUser | null>('admin_user', () => null);
  const isLoading = useState<boolean>('admin_auth_loading', () => false);
  // Effective permissions resolved from the current role — drives every
  // sidebar/action gate in the panel. Kept empty until /me fills them.
  const permissions = useState<string[]>('admin_permissions', () => []);
  const roleInfo = useState<AdminRoleInfo | null>('admin_role_info', () => null);
  const mustChangePassword = useState<boolean>('admin_must_change_password', () => false);

  const isAuthenticated = computed(() => !!user.value);

  function getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (token.value) {
      headers.Authorization = `Bearer ${token.value}`;
    }
    // Forward the HttpOnly cookie when running during Nuxt Server-Side Rendering
    if (import.meta.server) {
      const reqHeaders = useRequestHeaders(['cookie']);
      if (reqHeaders.cookie) {
        headers.cookie = reqHeaders.cookie;
      }
    }
    return headers;
  }

  async function login(email: string, password: string, totpCode?: string) {
    isLoading.value = true;
    try {
      const res: any = await $fetch('/api/admin/auth/login', {
        method: 'POST',
        body: { email, password, ...(totpCode ? { totpCode } : {}) },
      });

      if (res.ok && res.token) {
        token.value = res.token;
        user.value = res.user;
        mustChangePassword.value = !!res.mustChangePassword;
        // Clean up legacy readable cookie if it was ever set previously
        const legacySession = useCookie('arena_admin_session');
        if (legacySession.value) legacySession.value = null;

        // Load role/permissions immediately so sidebar + page gates render
        // correctly on the first paint after login.
        await fetchUser();
        await navigateTo(mustChangePassword.value ? '/change-password' : '/');
        return { success: true };
      } else {
        return {
          success: false,
          error: typeof res.error === 'string' && res.error ? res.error : 'Authentication failed.',
        };
      }
    } catch (err: any) {
      // The server always sends a string `error`, but a stale/misconfigured
      // proxy can return anything — never render a non-string raw.
      const serverError = err?.data?.error;
      const errorCode = err?.data?.code;
      let msg: string;
      if (typeof serverError === 'string' && serverError) {
        msg = serverError;
      } else if (errorCode === 'TOTP_REQUIRED') {
        msg = 'Please enter your 6-digit 2FA code.';
      } else {
        msg = 'Login failed. Please check your credentials and try again.';
      }
      return { success: false, error: msg };
    } finally {
      isLoading.value = false;
    }
  }

  async function fetchUser() {
    try {
      const res: any = await $fetch('/api/admin/auth/me', {
        headers: getAuthHeaders(),
      });

      if (res.ok && res.user) {
        user.value = res.user;
        permissions.value = Array.isArray(res.permissions) ? res.permissions : [];
        roleInfo.value = res.role ?? null;
        mustChangePassword.value = !!res.mustChangePassword;
        return res.user;
      } else {
        token.value = null;
        user.value = null;
        permissions.value = [];
        roleInfo.value = null;
        mustChangePassword.value = false;
        return null;
      }
    } catch {
      token.value = null;
      user.value = null;
      permissions.value = [];
      roleInfo.value = null;
      mustChangePassword.value = false;
      return null;
    }
  }

  async function logout() {
    try {
      await $fetch('/api/admin/auth/logout', {
        method: 'POST',
        headers: getAuthHeaders(),
      }).catch(() => {});
    } finally {
      token.value = null;
      user.value = null;
      permissions.value = [];
      roleInfo.value = null;
      mustChangePassword.value = false;
      const legacySession = useCookie('arena_admin_session');
      if (legacySession.value) legacySession.value = null;
      await navigateTo('/login');
    }
  }

  return {
    token,
    user,
    isLoading,
    isAuthenticated,
    permissions,
    roleInfo,
    mustChangePassword,
    getAuthHeaders,
    login,
    fetchUser,
    logout,
  };
}

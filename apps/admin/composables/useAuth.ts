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
  const token = useCookie<string | null>('arena_admin_token', {
    maxAge: 60 * 60 * 24 * 7, // 7 days
    sameSite: 'lax',
    path: '/',
    // HTTPS-only once built for production; `nuxt dev` on localhost stays on
    // plain http so the cookie still works without TLS.
    secure: import.meta.env.PROD,
  });

  const user = useState<AdminUser | null>('admin_user', () => null);
  const isLoading = useState<boolean>('admin_auth_loading', () => false);
  // Effective permissions resolved from the current role — drives every
  // sidebar/action gate in the panel. Kept empty until /me fills them.
  const permissions = useState<string[]>('admin_permissions', () => []);
  const roleInfo = useState<AdminRoleInfo | null>('admin_role_info', () => null);
  const mustChangePassword = useState<boolean>('admin_must_change_password', () => false);

  const isAuthenticated = computed(() => !!token.value && !!user.value);

  function getAuthHeaders(): Record<string, string> {
    if (!token.value) return {};
    return {
      Authorization: `Bearer ${token.value}`,
    };
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
    if (!token.value) {
      user.value = null;
      permissions.value = [];
      roleInfo.value = null;
      mustChangePassword.value = false;
      return null;
    }

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
      if (token.value) {
        await $fetch('/api/admin/auth/logout', {
          method: 'POST',
          headers: getAuthHeaders(),
        }).catch(() => {});
      }
    } finally {
      token.value = null;
      user.value = null;
      permissions.value = [];
      roleInfo.value = null;
      mustChangePassword.value = false;
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

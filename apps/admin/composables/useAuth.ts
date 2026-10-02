export interface AdminUser {
  id: number;
  email: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  role: string;
}

export function useAuth() {
  const token = useCookie<string | null>('arena_admin_token', {
    maxAge: 60 * 60 * 24 * 7, // 7 days
    sameSite: 'lax',
    path: '/',
  });

  const user = useState<AdminUser | null>('admin_user', () => null);
  const isLoading = useState<boolean>('admin_auth_loading', () => false);

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
        await navigateTo('/');
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
      return null;
    }

    try {
      const res: any = await $fetch('/api/admin/auth/me', {
        headers: getAuthHeaders(),
      });

      if (res.ok && res.user) {
        user.value = res.user;
        return res.user;
      } else {
        token.value = null;
        user.value = null;
        return null;
      }
    } catch {
      token.value = null;
      user.value = null;
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
      await navigateTo('/login');
    }
  }

  return {
    token,
    user,
    isLoading,
    isAuthenticated,
    getAuthHeaders,
    login,
    fetchUser,
    logout,
  };
}

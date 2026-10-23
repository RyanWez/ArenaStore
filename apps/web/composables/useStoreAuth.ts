export interface StoreCustomer {
  id: number;
  telegramId: string;
  firstName: string;
  lastName?: string | null;
  username?: string | null;
  role: string;
  balanceMmk: number;
  totalDepositedMmk?: number;
  totalSpentMmk?: number;
  memberSince?: string;
}

export function useStoreAuth() {
  const user = useState<StoreCustomer | null>("store_customer_user", () => null);
  const isLoading = useState<boolean>("store_customer_loading", () => false);
  const isInitialized = useState<boolean>("store_customer_initialized", () => false);

  const isAuthenticated = computed(() => Boolean(user.value));
  const balanceMmk = computed(() => user.value?.balanceMmk ?? 0);

  /**
   * Formats numbers into clean localized MMK strings (e.g. 12,500 MMK).
   */
  const formatMmk = (amount: number): string => {
    return `${(amount || 0).toLocaleString("en-US")} MMK`;
  };

  /**
   * Fetches active session and profile from /api/store/auth/me.
   */
  const fetchMe = async (): Promise<StoreCustomer | null> => {
    isLoading.value = true;
    try {
      const response = await $fetch<{ ok: boolean; user: StoreCustomer }>("/api/store/auth/me", {
        headers: { "Accept": "application/json" },
      });
      if (response && response.ok && response.user) {
        user.value = response.user;
        return response.user;
      }
      user.value = null;
      return null;
    } catch {
      user.value = null;
      return null;
    } finally {
      isLoading.value = false;
      isInitialized.value = true;
    }
  };

  /**
   * Detects Telegram Mini App environment and executes zero-click instant login.
   */
  const initTelegramMiniApp = async (): Promise<boolean> => {
    if (!import.meta.client) return false;

    const tg = (window as any).Telegram?.WebApp;
    if (tg?.initData && !isAuthenticated.value) {
      try {
        isLoading.value = true;
        const res = await $fetch<{ ok: boolean; user: StoreCustomer }>("/api/store/auth/telegram-webapp", {
          method: "POST",
          body: { initData: tg.initData },
        });

        if (res.ok && res.user) {
          user.value = res.user;
          // Notify Telegram WebApp container that app is ready
          tg.ready?.();
          tg.expand?.();
          return true;
        }
      } catch (err) {
        console.warn("[MiniApp Auth] Instant bypass failed:", err);
      } finally {
        isLoading.value = false;
      }
    }
    return false;
  };

  /**
   * Terminates active session and clears cookies.
   */
  const logout = async (): Promise<void> => {
    isLoading.value = true;
    try {
      await $fetch("/api/store/auth/logout", { method: "POST" });
    } catch {}
    user.value = null;
    isLoading.value = false;
  };

  return {
    user,
    balanceMmk,
    isAuthenticated,
    isLoading,
    isInitialized,
    formatMmk,
    fetchMe,
    initTelegramMiniApp,
    logout,
  };
}

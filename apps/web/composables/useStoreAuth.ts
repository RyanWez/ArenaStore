import { computed } from "vue";

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

export interface AuthTicket {
  ticketId: string;
  code: string;
  expiresIn: number;
  expiresAt: number;
  deviceSummary?: string;
}

export type AuthStep =
  | "idle"
  | "intro"
  | "generating"
  | "awaiting"
  | "confirmed"
  | "expired"
  | "cancelled"
  | "error";

// Module-level references for active EventSource and timer
let activeEventSource: EventSource | null = null;
let activeCountdownTimer: any = null;

export function useStoreAuth() {
  const user = useState<StoreCustomer | null>("store_customer_user", () => null);
  const isLoading = useState<boolean>("store_customer_loading", () => false);
  const isInitialized = useState<boolean>("store_customer_initialized", () => false);

  // Persistent session token stored in cookie + localStorage
  const authToken = useCookie<string | null>("arena_store_session_token", {
    default: () => null,
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
    sameSite: "lax",
  });

  // Challenge Modal Reactive State
  const isAuthModalOpen = useState<boolean>("store_auth_modal_open", () => false);
  const authStep = useState<AuthStep>("store_auth_step", () => "idle");
  const currentTicket = useState<AuthTicket | null>("store_current_ticket", () => null);
  const countdownSeconds = useState<number>("store_auth_countdown", () => 300);
  const authContextMessage = useState<string | null>("store_auth_context_msg", () => null);
  const authError = useState<string | null>("store_auth_error", () => null);

  const isAuthenticated = computed(() => Boolean(user.value));
  const balanceMmk = computed(() => user.value?.balanceMmk ?? 0);

  /**
   * Helper to retrieve active token across cookie or localStorage.
   */
  const getStoredToken = (): string | null => {
    if (authToken.value) return authToken.value;
    if (import.meta.client) {
      const local = localStorage.getItem("arena_store_token");
      if (local) {
        authToken.value = local;
        return local;
      }
    }
    return null;
  };

  /**
   * Helper to persist or clear token across cookie and localStorage.
   */
  const saveToken = (token: string | null) => {
    authToken.value = token;
    if (import.meta.client) {
      if (token) {
        localStorage.setItem("arena_store_token", token);
      } else {
        localStorage.removeItem("arena_store_token");
      }
    }
  };

  /**
   * Formats numbers into clean localized MMK strings (e.g. 12,500 MMK).
   */
  const formatMmk = (amount: number): string => {
    return `${(amount || 0).toLocaleString("en-US")} MMK`;
  };

  /**
   * Cleans up any running SSE connection and countdown interval.
   */
  const cleanupSseAndTimer = () => {
    if (activeEventSource) {
      activeEventSource.close();
      activeEventSource = null;
    }
    if (activeCountdownTimer) {
      clearInterval(activeCountdownTimer);
      activeCountdownTimer = null;
    }
  };

  /**
   * Fetches active session and profile from /api/store/auth/me.
   */
  const fetchMe = async (): Promise<StoreCustomer | null> => {
    const token = getStoredToken();
    isLoading.value = true;
    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await $fetch<{ ok: boolean; user: StoreCustomer }>("/api/store/auth/me", {
        headers,
        credentials: "include",
      });

      if (response && response.ok && response.user) {
        user.value = response.user;
        return response.user;
      }

      if (token) {
        saveToken(null);
      }
      user.value = null;
      return null;
    } catch (err: any) {
      // If 401 Unauthorized, token has expired or is invalid
      if (err?.statusCode === 401 || err?.response?.status === 401) {
        saveToken(null);
        user.value = null;
      }
      return null;
    } finally {
      isLoading.value = false;
      isInitialized.value = true;
    }
  };

  /**
   * Starts a fresh 4-digit challenge ticket and connects to the SSE event stream.
   */
  const startTicketChallenge = async (): Promise<void> => {
    cleanupSseAndTimer();
    authStep.value = "generating";
    authError.value = null;

    try {
      const res = await $fetch<{
        ok: boolean;
        ticketId: string;
        code: string;
        expiresIn: number;
        expiresAt: number;
        deviceSummary?: string;
      }>("/api/store/auth/ticket", {
        method: "POST",
      });

      if (!res || !res.ok || !res.ticketId) {
        throw new Error("Failed to generate login challenge ticket");
      }

      currentTicket.value = {
        ticketId: res.ticketId,
        code: res.code,
        expiresIn: res.expiresIn,
        expiresAt: res.expiresAt,
        deviceSummary: res.deviceSummary,
      };

      const remaining = Math.max(0, Math.floor((res.expiresAt - Date.now()) / 1000));
      countdownSeconds.value = remaining > 0 ? remaining : res.expiresIn || 300;
      authStep.value = "awaiting";

      // Start countdown interval
      activeCountdownTimer = setInterval(() => {
        if (countdownSeconds.value > 1) {
          countdownSeconds.value -= 1;
        } else {
          countdownSeconds.value = 0;
          authStep.value = "expired";
          cleanupSseAndTimer();
        }
      }, 1000);

      // Connect to Server-Sent Events stream for instant confirmed notification
      if (import.meta.client) {
        const sseUrl = `/api/store/auth/events/${res.ticketId}`;
        const es = new EventSource(sseUrl, { withCredentials: true });
        activeEventSource = es;

        es.addEventListener("confirmed", async (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            if (data.ok && data.user) {
              // 1. Immediately persist session token
              if (data.token) {
                saveToken(data.token);

                // 2. Also establish HttpOnly session cookie
                try {
                  await $fetch("/api/store/auth/session", {
                    method: "POST",
                    body: { token: data.token },
                    headers: {
                      Authorization: `Bearer ${data.token}`,
                    },
                    credentials: "include",
                  });
                } catch (cookieErr) {
                  console.warn("[useStoreAuth] Session cookie exchange warning:", cookieErr);
                }
              }

              // 3. Immediately set user state from confirmed payload
              user.value = data.user;
              authStep.value = "confirmed";
              cleanupSseAndTimer();

              // 4. Synchronize full profile & wallet balance from database
              await fetchMe();

              // 5. Keep celebration visible for 1.8s then auto-close modal
              setTimeout(() => {
                if (authStep.value === "confirmed") {
                  closeLoginModal();
                }
              }, 1800);
            }
          } catch (e) {
            console.error("[useStoreAuth] Failed to parse confirmed event:", e);
          }
        });

        es.addEventListener("cancelled", () => {
          authStep.value = "cancelled";
          cleanupSseAndTimer();
        });

        es.addEventListener("expired", () => {
          authStep.value = "expired";
          cleanupSseAndTimer();
        });

        es.onerror = () => {
          // If the connection drops or is closed by server
          if (authStep.value === "awaiting" && countdownSeconds.value <= 1) {
            authStep.value = "expired";
            cleanupSseAndTimer();
          }
        };
      }
    } catch (err: any) {
      console.error("[useStoreAuth] Error initiating ticket challenge:", err);
      authStep.value = "error";
      authError.value =
        err?.data?.error ||
        err?.message ||
        "လုံခြုံရေး ကုဒ် ထုတ်ယူရာတွင် အမှားအယွင်း ဖြစ်ပေါ်ခဲ့ပါသည်။ ခဏအကြာတွင် ပြန်လည် ကြိုးစားပေးပါ။";
      cleanupSseAndTimer();
    }
  };

  /**
   * Opens the Telegram login modal showing the introductory explanation step first.
   */
  const openLoginModal = (contextPrompt?: string): void => {
    authContextMessage.value = contextPrompt || null;
    authError.value = null;
    authStep.value = "intro";
    isAuthModalOpen.value = true;
  };

  /**
   * Returns from code challenge back to the introductory explanation step smoothly.
   */
  const backToIntro = (): void => {
    cleanupSseAndTimer();
    authStep.value = "intro";
    currentTicket.value = null;
    authError.value = null;
  };

  /**
   * Closes the login modal and cleans up active connections.
   */
  const closeLoginModal = (): void => {
    isAuthModalOpen.value = false;
    authStep.value = "idle";
    currentTicket.value = null;
    authContextMessage.value = null;
    authError.value = null;
    cleanupSseAndTimer();
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
        const res = await $fetch<{ ok: boolean; token?: string; user: StoreCustomer }>("/api/store/auth/telegram-webapp", {
          method: "POST",
          body: { initData: tg.initData },
          credentials: "include",
        });

        if (res.ok && res.user) {
          if (res.token) {
            saveToken(res.token);
          }
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
   * Terminates active session and clears cookies and localStorage.
   */
  const logout = async (): Promise<void> => {
    isLoading.value = true;
    const token = getStoredToken();
    try {
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      await $fetch("/api/store/auth/logout", {
        method: "POST",
        headers,
        credentials: "include",
      });
    } catch {}
    saveToken(null);
    user.value = null;
    isLoading.value = false;
  };

  return {
    user,
    balanceMmk,
    isAuthenticated,
    isLoading,
    isInitialized,
    isAuthModalOpen,
    authStep,
    currentTicket,
    countdownSeconds,
    authContextMessage,
    authError,
    formatMmk,
    fetchMe,
    initTelegramMiniApp,
    openLoginModal,
    closeLoginModal,
    startTicketChallenge,
    backToIntro,
    logout,
  };
}

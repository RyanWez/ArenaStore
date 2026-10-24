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
    isLoading.value = true;
    try {
      const response = await $fetch<{ ok: boolean; user: StoreCustomer }>("/api/store/auth/me", {
        headers: { Accept: "application/json" },
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
              authStep.value = "confirmed";
              user.value = data.user;
              cleanupSseAndTimer();

              // Synchronize session cookie & full profile
              await fetchMe();

              // Auto-close modal after brief celebration
              setTimeout(() => {
                if (authStep.value === "confirmed") {
                  closeLoginModal();
                }
              }, 1400);
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

import { ref, computed, onMounted, onUnmounted } from 'vue';

export interface AdminEventPayload {
  type: 'CONNECTED' | 'ORDER_CREATED' | 'ORDER_STATUS_CHANGED' | 'DEPOSIT_SUBMITTED' | 'DEPOSIT_REVIEWED' | 'CUSTOMER_UPDATED';
  payload?: Record<string, any>;
  timestamp?: string;
}

export interface SmartSyncOptions {
  onSync: (isSilent: boolean) => void | Promise<void>;
  eventTypes: AdminEventPayload['type'][];
  fallbackIntervalMs?: number;
  debounceMs?: number;
}

// ---------------------------------------------------------------------------
// Constants & Configuration
// ---------------------------------------------------------------------------
// Inactivity timeout: 10 minutes without interaction -> pause stream to save compute
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
// Maximum continuous connection lifetime: 5 minutes -> cycle connection to avoid function duration traps
const MAX_STREAM_LIFETIME_MS = 5 * 60 * 1000;
// Throttle user activity checks to prevent performance overhead on rapid events
const ACTIVITY_THROTTLE_MS = 3000;

// ---------------------------------------------------------------------------
// Shared Singleton EventSource Connection Pool
// ---------------------------------------------------------------------------
const isConnected = ref(false);
const isPaused = ref(false);
const isTabHidden = ref(false);
const isUserIdle = ref(false);
const pauseReason = ref<'hidden' | 'idle' | null>(null);
const lastEventAt = ref<Date | null>(null);

const listeners = new Set<(event: AdminEventPayload) => void>();
const catchUpListeners = new Set<() => void>();

let eventSource: EventSource | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let disconnectGraceTimer: ReturnType<typeof setTimeout> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let streamLifetimeTimer: ReturnType<typeof setTimeout> | null = null;
let subscriberCount = 0;
let lifecycleInitialized = false;
let lastActivityCheck = 0;

function canConnect(): boolean {
  if (typeof window === 'undefined') return false;
  return subscriberCount > 0 && !isTabHidden.value && !isUserIdle.value;
}

function startConnection() {
  if (typeof window === 'undefined') return;
  if (!canConnect()) return;
  if (eventSource) return;

  if (disconnectGraceTimer) {
    clearTimeout(disconnectGraceTimer);
    disconnectGraceTimer = null;
  }

  try {
    const url = '/api/admin/events';
    eventSource = new EventSource(url, { withCredentials: true });

    eventSource.onopen = () => {
      isConnected.value = true;
      isPaused.value = false;
      pauseReason.value = null;

      // Start safety cap timer to cycle connection before long serverless execution limits
      if (streamLifetimeTimer) clearTimeout(streamLifetimeTimer);
      streamLifetimeTimer = setTimeout(() => {
        cycleConnection();
      }, MAX_STREAM_LIFETIME_MS);
    };

    eventSource.onmessage = (e) => {
      try {
        const data: AdminEventPayload = JSON.parse(e.data);
        if (data.type === 'CONNECTED') {
          isConnected.value = true;
          return;
        }

        lastEventAt.value = new Date();
        listeners.forEach((callback) => {
          try {
            callback(data);
          } catch (err) {
            console.error('[AdminEvents] Callback error:', err);
          }
        });
      } catch {}
    };

    eventSource.onerror = () => {
      isConnected.value = false;
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      if (streamLifetimeTimer) {
        clearTimeout(streamLifetimeTimer);
        streamLifetimeTimer = null;
      }

      // Automatically attempt reconnect after 4 seconds only if eligible
      if (!reconnectTimeout && canConnect()) {
        reconnectTimeout = setTimeout(() => {
          reconnectTimeout = null;
          startConnection();
        }, 4000);
      }
    };
  } catch {
    isConnected.value = false;
  }
}

function stopConnection(paused = false, reason: 'hidden' | 'idle' | null = null) {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  if (streamLifetimeTimer) {
    clearTimeout(streamLifetimeTimer);
    streamLifetimeTimer = null;
  }
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  isConnected.value = false;

  if (paused) {
    isPaused.value = true;
    pauseReason.value = reason;
  } else {
    isPaused.value = false;
    pauseReason.value = null;
  }
}

/**
 * Cleanly cycles connection to avoid runaway serverless execution duration.
 */
function cycleConnection() {
  if (streamLifetimeTimer) {
    clearTimeout(streamLifetimeTimer);
    streamLifetimeTimer = null;
  }
  if (eventSource) {
    eventSource.close();
    eventSource = null;
    isConnected.value = false;
  }
  if (canConnect()) {
    setTimeout(() => {
      startConnection();
    }, 1000);
  }
}

/**
 * Triggers all registered catch-up listeners (e.g. data re-fetch).
 */
function triggerCatchUp() {
  catchUpListeners.forEach((fn) => {
    try {
      fn();
    } catch (err) {
      console.error('[AdminEvents] Catch-up sync error:', err);
    }
  });
}

function resetIdleTimer() {
  if (typeof window === 'undefined') return;

  const now = Date.now();
  if (now - lastActivityCheck < ACTIVITY_THROTTLE_MS && !isUserIdle.value) {
    return;
  }
  lastActivityCheck = now;

  const wasIdle = isUserIdle.value;
  isUserIdle.value = false;

  if (idleTimer) {
    clearTimeout(idleTimer);
  }

  // Set timeout for 10 minutes of inactivity
  idleTimer = setTimeout(() => {
    isUserIdle.value = true;
    if (isConnected.value || eventSource) {
      stopConnection(true, 'idle');
    }
  }, IDLE_TIMEOUT_MS);

  // If returning from idle state while tab is visible, resume and catch up!
  if (wasIdle && !isTabHidden.value) {
    isPaused.value = false;
    pauseReason.value = null;
    startConnection();
    triggerCatchUp();
  }
}

function handleVisibilityChange() {
  if (typeof document === 'undefined') return;

  if (document.hidden) {
    isTabHidden.value = true;
    stopConnection(true, 'hidden');
  } else {
    isTabHidden.value = false;
    // When returning to tab, reset idle timer and resume if not idle
    if (!isUserIdle.value) {
      isPaused.value = false;
      pauseReason.value = null;
      startConnection();
      triggerCatchUp();
    }
    resetIdleTimer();
  }
}

function initLifecycleListeners() {
  if (lifecycleInitialized || typeof window === 'undefined') return;
  lifecycleInitialized = true;

  isTabHidden.value = document.hidden;
  document.addEventListener('visibilitychange', handleVisibilityChange);

  const activityEvents = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
  activityEvents.forEach((event) => {
    window.addEventListener(event, resetIdleTimer, { passive: true });
  });

  resetIdleTimer();
}

function subscribe(
  callback?: (event: AdminEventPayload) => void,
  onCatchUp?: () => void
) {
  initLifecycleListeners();

  if (callback) {
    listeners.add(callback);
  }
  if (onCatchUp) {
    catchUpListeners.add(onCatchUp);
  }
  subscriberCount++;

  if (disconnectGraceTimer) {
    clearTimeout(disconnectGraceTimer);
    disconnectGraceTimer = null;
  }

  if (subscriberCount === 1) {
    startConnection();
  }
}

function unsubscribe(
  callback?: (event: AdminEventPayload) => void,
  onCatchUp?: () => void
) {
  if (callback) {
    listeners.delete(callback);
  }
  if (onCatchUp) {
    catchUpListeners.delete(onCatchUp);
  }
  subscriberCount = Math.max(0, subscriberCount - 1);

  if (subscriberCount === 0) {
    // 5-second grace period: avoids destroying connection during rapid route transitions
    disconnectGraceTimer = setTimeout(() => {
      disconnectGraceTimer = null;
      if (subscriberCount === 0) {
        stopConnection(false);
      }
    }, 5000);
  }
}

/**
 * Subscribes to the shared real-time SSE stream.
 */
export function useAdminEvents(onEventCallback?: (event: AdminEventPayload) => void) {
  onMounted(() => {
    subscribe(onEventCallback);
  });

  onUnmounted(() => {
    unsubscribe(onEventCallback);
  });

  const connectionState = computed<'connected' | 'paused' | 'disconnected'>(() => {
    if (isConnected.value) return 'connected';
    if (isPaused.value) return 'paused';
    return 'disconnected';
  });

  return {
    isConnected,
    isPaused,
    pauseReason,
    connectionState,
    lastEventAt,
    connect: startConnection,
    disconnect: () => stopConnection(false),
  };
}

/**
 * Smart Event-Driven Data Sync:
 * - When SSE is active: ZERO background polling (0 requests/sec). Instant sync on event.
 * - When SSE is disconnected / offline: Fallback polling activates safely at `fallbackIntervalMs`.
 * - When browser tab is hidden or idle: Polling is completely suspended.
 * - When resuming: Instant catch-up sync triggers automatically.
 */
export function useSmartSync(options: SmartSyncOptions) {
  const { onSync, eventTypes, fallbackIntervalMs = 30000, debounceMs = 300 } = options;

  let fallbackTimer: ReturnType<typeof setInterval> | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function triggerDebouncedSync() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      onSync(true);
    }, debounceMs);
  }

  function handleEvent(event: AdminEventPayload) {
    if (eventTypes.includes(event.type)) {
      triggerDebouncedSync();
    }
  }

  function handleCatchUp() {
    onSync(true);
  }

  onMounted(() => {
    // Initial fetch on component mount
    onSync(false);

    // Register into shared SSE pool with catch-up callback
    subscribe(handleEvent, handleCatchUp);

    // Fallback safety-net timer (only triggers if SSE is disconnected, never while paused/hidden)
    fallbackTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (isUserIdle.value || isPaused.value) return;
      if (!isConnected.value) {
        onSync(true);
      }
    }, fallbackIntervalMs);
  });

  onUnmounted(() => {
    unsubscribe(handleEvent, handleCatchUp);

    if (fallbackTimer) {
      clearInterval(fallbackTimer);
      fallbackTimer = null;
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  });

  return {
    isConnected,
    isPaused,
    lastEventAt,
    syncNow: () => onSync(false),
  };
}

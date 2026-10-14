import { ref, onMounted, onUnmounted } from 'vue';

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
// Shared Singleton EventSource Connection Pool
// ---------------------------------------------------------------------------
const isConnected = ref(false);
const lastEventAt = ref<Date | null>(null);
const listeners = new Set<(event: AdminEventPayload) => void>();

let eventSource: EventSource | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let subscriberCount = 0;
let disconnectGraceTimer: ReturnType<typeof setTimeout> | null = null;

function startConnection() {
  if (typeof window === 'undefined') return;
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

      // Automatically attempt reconnect after 4 seconds
      if (!reconnectTimeout && subscriberCount > 0) {
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

function stopConnection() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  isConnected.value = false;
}

function subscribe(callback?: (event: AdminEventPayload) => void) {
  if (callback) {
    listeners.add(callback);
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

function unsubscribe(callback?: (event: AdminEventPayload) => void) {
  if (callback) {
    listeners.delete(callback);
  }
  subscriberCount = Math.max(0, subscriberCount - 1);

  if (subscriberCount === 0) {
    // 5-second grace period: avoids destroying connection during rapid route transitions
    disconnectGraceTimer = setTimeout(() => {
      disconnectGraceTimer = null;
      if (subscriberCount === 0) {
        stopConnection();
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

  return {
    isConnected,
    lastEventAt,
    connect: startConnection,
    disconnect: stopConnection,
  };
}

/**
 * Smart Event-Driven Data Sync:
 * - When SSE is active: ZERO background polling (0 requests/sec). Instant sync on event.
 * - When SSE is disconnected / offline: Fallback polling activates safely at `fallbackIntervalMs`.
 * - When browser tab is hidden: Polling is completely suspended.
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

  function onVisibilityChange() {
    if (typeof document !== 'undefined' && !document.hidden && !isConnected.value) {
      // Re-entered visible tab while SSE was disconnected — perform catch-up sync
      onSync(true);
    }
  }

  onMounted(() => {
    // Initial fetch on component mount
    onSync(false);

    // Register into shared SSE pool
    subscribe(handleEvent);

    // Fallback safety-net timer (only triggers if SSE is disconnected)
    fallbackTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (!isConnected.value) {
        onSync(true);
      }
    }, fallbackIntervalMs);

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }
  });

  onUnmounted(() => {
    unsubscribe(handleEvent);

    if (fallbackTimer) {
      clearInterval(fallbackTimer);
      fallbackTimer = null;
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
  });

  return {
    isConnected,
    lastEventAt,
    syncNow: () => onSync(false),
  };
}

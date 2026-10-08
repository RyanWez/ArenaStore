import { ref, onMounted, onUnmounted } from 'vue';
import { useAuth } from './useAuth';

export interface AdminEventPayload {
  type: 'CONNECTED' | 'ORDER_CREATED' | 'ORDER_STATUS_CHANGED' | 'DEPOSIT_SUBMITTED' | 'DEPOSIT_REVIEWED' | 'CUSTOMER_UPDATED';
  payload?: Record<string, any>;
  timestamp?: string;
}

export function useAdminEvents(onEventCallback?: (event: AdminEventPayload) => void) {
  const isConnected = ref(false);
  let eventSource: EventSource | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  const { token } = useAuth();

  function connect() {
    if (typeof window === 'undefined') return;
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    try {
      // EventSource sends cookies automatically with credentials
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
          if (onEventCallback) {
            onEventCallback(data);
          }
        } catch {}
      };

      eventSource.onerror = () => {
        isConnected.value = false;
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        // Attempt reconnect after 5s
        if (!reconnectTimeout) {
          reconnectTimeout = setTimeout(() => {
            reconnectTimeout = null;
            connect();
          }, 5000);
        }
      };
    } catch {
      isConnected.value = false;
    }
  }

  function disconnect() {
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

  onMounted(() => {
    connect();
  });

  onUnmounted(() => {
    disconnect();
  });

  return {
    isConnected,
    connect,
    disconnect,
  };
}

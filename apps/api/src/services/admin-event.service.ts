import { EventEmitter } from "node:events";

export interface AdminEvent {
  type: "ORDER_CREATED" | "ORDER_STATUS_CHANGED" | "DEPOSIT_SUBMITTED" | "DEPOSIT_REVIEWED" | "CUSTOMER_UPDATED";
  payload?: Record<string, any>;
  timestamp?: string;
}

class AdminEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
  }

  broadcast(event: AdminEvent) {
    const enriched: AdminEvent = {
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
    };
    this.emit("event", enriched);
  }
}

export const adminEventBus = new AdminEventBus();

export function broadcastAdminEvent(type: AdminEvent["type"], payload?: Record<string, any>) {
  adminEventBus.broadcast({ type, payload });
}

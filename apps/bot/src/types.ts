import { Context, SessionFlavor } from "grammy";

export interface SessionData {
  activeProductId?: number;
  selectedQuantity: number;
  activeCategoryId?: number;
  awaitingCustomQuantity?: boolean;
  awaitingSlipForOrderId?: string;
  pendingOrderId?: string;
  pendingPublicOrderNo?: string;
  pendingTotalMmk?: number;
  lastActionTimestamp?: number;
}

export type BotContext = Context & SessionFlavor<SessionData>;

export function createInitialSessionData(): SessionData {
  return {
    selectedQuantity: 1,
    awaitingCustomQuantity: false,
  };
}

import { botConfig } from "../config";

export interface XProOrderResult {
  orderId: number;
  externalOrderId: string;
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  currency: string;
  status: string;
}

export interface XProOrderDelivery {
  type: string;
  lines: string[];
}

export interface XProOrderSuccessResponse {
  ok: true;
  order: XProOrderResult;
  delivery: XProOrderDelivery;
  balanceAfter: string;
  duplicate?: boolean;
}

export class XProOrderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly requestId?: string,
    public readonly details?: any
  ) {
    super(`[XPro API ${code}]: ${message}`);
    this.name = "XProOrderError";
  }
}

/**
 * Places an instant order with Upstream XPro Partner API.
 * Uses strict idempotency via externalOrderId.
 */
export async function placeUpstreamOrder(params: {
  productId: number;
  quantity: number;
  externalOrderId: string;
}): Promise<XProOrderSuccessResponse> {
  const baseUrl = botConfig.UPSTREAM_BASE_URL.replace(/\/+$/, "");
  const url = `${baseUrl}/orders`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (botConfig.UPSTREAM_API_KEY) {
    headers["Authorization"] = `Bearer ${botConfig.UPSTREAM_API_KEY}`;
  }

  const payload = {
    productId: params.productId,
    quantity: params.quantity,
    externalOrderId: params.externalOrderId,
  };

  const maxRetries = 1;
  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12000), // 12 seconds timeout
      });

      let data: any;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok || (data && data.ok === false)) {
        const errCode = data?.error?.code || `HTTP_${res.status}`;
        const errMsg = data?.error?.message || res.statusText || "Upstream order request failed";
        const reqId = data?.error?.requestId || data?.requestId;

        // Do not retry business/balance errors
        if (
          errCode === "INSUFFICIENT_BALANCE" ||
          errCode === "OUT_OF_STOCK" ||
          errCode === "PRODUCT_NOT_FOUND" ||
          errCode === "INVALID_REQUEST"
        ) {
          throw new XProOrderError(errCode, errMsg, res.status, reqId, data?.error);
        }

        // Retry only on server 5xx or rate limit
        if ((res.status >= 500 || res.status === 429) && attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }

        throw new XProOrderError(errCode, errMsg, res.status, reqId, data?.error);
      }

      return data as XProOrderSuccessResponse;
    } catch (err: any) {
      if (err instanceof XProOrderError) {
        throw err;
      }
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  throw new XProOrderError(
    "NETWORK_ERROR",
    lastError?.message || "Failed to communicate with Upstream XPro Partner API",
    503
  );
}

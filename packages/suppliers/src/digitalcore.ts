import { usdToCents, centsToUsdString, effectiveUnitCostUsdCents } from "@arena/shared";
import type {
  ISupplierClient,
  SupplierId,
  CommonProduct,
  SupplierHealth,
  SupplierOrderRequest,
  SupplierOrderResult,
  SupplierOrderInfo,
  SupplierClientOptions,
  PricingTier,
} from "./types";
import { SupplierError } from "./errors";

export interface DigitalCoreProductRaw {
  id: string;
  name: string;
  stock: number;
  price: number;
  priceFrom?: number;
  tiers?: Array<{
    minQty: number;
    maxQty: number | null;
    price: number;
  }>;
}

export interface DigitalCoreMeResponse {
  balance: number;
  total_orders: string | number;
}

export interface DigitalCoreBuyResponse {
  success: boolean;
  order_id?: string;
  view_url?: string;
  total_amount?: number;
  quantity?: number;
  items?: string[];
  msg?: string;
}

export interface DigitalCoreHistoryItem {
  id: string;
  create_timestamp?: number;
  total_amount: number;
  quantity: number;
}

export class DigitalCoreClient implements ISupplierClient {
  readonly supplierId: SupplierId = "DIGITALCORE";
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(options?: SupplierClientOptions) {
    this.baseUrl = (options?.baseUrl || process.env.DIGITALCORE_BASE_URL || "https://digitalcore.top").replace(/\/+$/, "");
    this.apiKey = options?.apiKey || process.env.DIGITALCORE_API_KEY || "";
    this.timeoutMs = options?.timeoutMs || 10000;
  }

  private async request<T>(
    endpoint: string,
    init: RequestInit = {},
    maxRetries: number = 2,
    customTimeoutMs?: number,
    isBuyRequest: boolean = false
  ): Promise<T> {
    const effectiveTimeout = customTimeoutMs ?? this.timeoutMs;
    const url = `${this.baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers as Record<string, string>),
    };

    if (this.apiKey) {
      headers["Api-Key"] = this.apiKey;
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

      try {
        const response = await fetch(url, {
          ...init,
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        let data: any;
        try {
          data = await response.json();
        } catch {
          data = null;
        }

        if (!response.ok || (data && data.success === false)) {
          const errMsg = data?.msg || data?.message || response.statusText || "DigitalCore request failed";

          // Retry on 5xx or 429
          if ((response.status >= 500 || response.status === 429) && attempt < maxRetries && !isBuyRequest) {
            const delay = Math.pow(2, attempt) * 500;
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }

          throw SupplierError.fromDigitalCore(errMsg, response.status, data);
        }

        return data as T;
      } catch (err: any) {
        clearTimeout(timeoutId);

        if (err instanceof SupplierError) {
          throw err;
        }

        const isAbort = err.name === "AbortError";
        if (isBuyRequest && isAbort) {
          // Critical non-idempotent safety: DO NOT retry timeouts on buy!
          throw new SupplierError(
            "AMBIGUOUS_TIMEOUT",
            `DigitalCore buy request timed out after ${effectiveTimeout}ms. Order placed status is ambiguous.`,
            504,
            undefined,
            { endpoint, init }
          );
        }

        lastError = new Error(
          isAbort ? `DigitalCore API request timed out after ${effectiveTimeout}ms` : err.message
        );

        if (attempt < maxRetries && !isBuyRequest) {
          const delay = Math.pow(2, attempt) * 500;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new SupplierError(
      "NETWORK_ERROR",
      lastError?.message || "Failed to communicate with DigitalCore API",
      503
    );
  }

  async getHealth(timeoutMs = 2500): Promise<SupplierHealth> {
    const start = Date.now();
    try {
      await this.request<DigitalCoreMeResponse>("/api/user/me", {}, 0, timeoutMs);
      return {
        online: true,
        latencyMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        online: false,
        latencyMs: Date.now() - start,
        error: err.message,
      };
    }
  }

  async getBalance(timeoutMs = 2500): Promise<{ balanceUsdCents: number; balanceUsd: string }> {
    const res = await this.request<DigitalCoreMeResponse>("/api/user/me", {}, 2, timeoutMs);
    const balanceNum = typeof res.balance === "number" ? res.balance : parseFloat(String(res.balance || 0));
    const cents = usdToCents(isNaN(balanceNum) ? 0 : balanceNum);
    return {
      balanceUsdCents: cents,
      balanceUsd: centsToUsdString(cents),
    };
  }

  async listProducts(): Promise<CommonProduct[]> {
    const items = await this.request<DigitalCoreProductRaw[]>("/api/user/products");
    if (!Array.isArray(items)) return [];

    return items.map((p) => {
      const cents = usdToCents(p.price);
      const tiers: PricingTier[] | undefined = p.tiers?.map((t) => ({
        minQty: t.minQty,
        maxQty: t.maxQty ?? null,
        price: t.price,
      }));

      return {
        supplier: "DIGITALCORE",
        upstreamProductId: p.id,
        name: p.name,
        stock: p.stock ?? 0,
        inStock: (p.stock ?? 0) > 0,
        basePriceUsdCents: cents,
        basePriceUsd: centsToUsdString(cents),
        pricingTiers: tiers,
        deliveryTypeHint: "LINK",
      };
    });
  }

  async getProduct(id: string): Promise<CommonProduct | null> {
    try {
      const p = await this.request<DigitalCoreProductRaw>(`/api/user/product?id=${encodeURIComponent(id)}`);
      if (!p || !p.id) return null;
      const cents = usdToCents(p.price);
      const tiers: PricingTier[] | undefined = p.tiers?.map((t) => ({
        minQty: t.minQty,
        maxQty: t.maxQty ?? null,
        price: t.price,
      }));

      return {
        supplier: "DIGITALCORE",
        upstreamProductId: p.id,
        name: p.name,
        stock: p.stock ?? 0,
        inStock: (p.stock ?? 0) > 0,
        basePriceUsdCents: cents,
        basePriceUsd: centsToUsdString(cents),
        pricingTiers: tiers,
        deliveryTypeHint: "LINK",
      };
    } catch (err: any) {
      if (err.statusCode === 404 || err.code === "PRODUCT_NOT_FOUND") return null;
      throw err;
    }
  }

  async createOrder(req: SupplierOrderRequest): Promise<SupplierOrderResult> {
    const count = req.quantity;
    if (count > 1000) {
      throw new SupplierError("MAX_COUNT_EXCEEDED", "Maximum purchase volume is 1,000 items per order", 400);
    }

    const res = await this.request<DigitalCoreBuyResponse>(
      "/api/user/buy",
      {
        method: "POST",
        body: JSON.stringify({
          id: req.upstreamProductId,
          count,
        }),
      },
      0, // No automatic retries on buy to avoid duplicate charges!
      15000,
      true // isBuyRequest = true
    );

    if (!res || !res.order_id) {
      throw new SupplierError("INVALID_REQUEST", "DigitalCore buy response missing order_id", 400, undefined, res);
    }

    const totalCents = res.total_amount !== undefined ? usdToCents(res.total_amount) : 0;

    return {
      upstreamOrderId: res.order_id,
      items: res.items || [],
      totalUsdCents: totalCents,
      quantity: res.quantity ?? count,
      viewUrl: res.view_url,
      raw: res,
    };
  }

  async getOrder(upstreamOrderId: string): Promise<SupplierOrderInfo | null> {
    try {
      const res = await this.request<any>(`/api/user/order?id=${encodeURIComponent(upstreamOrderId)}`);
      if (!res || (!res.order_id && !res.id)) return null;
      return {
        id: res.order_id || res.id,
        totalUsdCents: usdToCents(res.total_amount ?? 0),
        quantity: res.quantity ?? 1,
        items: res.items || [],
        viewUrl: res.view_url,
      };
    } catch (err: any) {
      if (err.statusCode === 404 || err.code === "ORDER_NOT_FOUND") return null;
      throw err;
    }
  }

  async listRecentOrders(page: number = 1): Promise<SupplierOrderInfo[]> {
    try {
      const res = await this.request<DigitalCoreHistoryItem[]>(`/api/user/history?page=${page}`);
      if (!Array.isArray(res)) return [];
      return res.map((item) => ({
        id: item.id,
        createTimestamp: item.create_timestamp,
        totalUsdCents: usdToCents(item.total_amount),
        quantity: item.quantity,
      }));
    } catch {
      return [];
    }
  }
}

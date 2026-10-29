import { usdToCents, centsToUsdString } from "@arena/shared";
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

export interface AIVaultHubProductRaw {
  service_id: string;
  name: string;
  stock: number;
  custom_pricing?: boolean;
  pricing_tiers: Array<{
    min: number;
    max: number | null;
    price: number;
  }>;
  bulk_discounts?: Array<{
    min_qty: number;
    discount_pct: number;
  }>;
}

export interface AIVaultHubProductsResponse {
  currency: string;
  rate?: string;
  products: AIVaultHubProductRaw[];
}

export interface AIVaultHubMeResponse {
  chat_id: number;
  balance: number;
  currency: string;
}

export interface AIVaultHubOrderResponse {
  success: boolean;
  order_id: string;
  external_order_id?: string;
  service_id: string;
  quantity: number;
  total_cost: number;
  new_balance?: number;
  currency?: string;
  idempotent_replay?: boolean;
  price_breakdown?: {
    unit_price: number;
    base_total: number;
    bulk_discount_pct: number;
    final_total: number;
  };
  products: string[];
}

export interface AIVaultHubSingleOrderResponse {
  order_id: string;
  status: string;
  service_id: string;
  quantity: number;
  total_cost: number;
  currency: string;
  created_at: string;
  products?: string[];
}

export interface AIVaultHubOrdersListResponse {
  page: number;
  limit: number;
  currency: string;
  orders: Array<{
    order_id: string;
    service_id: string;
    quantity: number;
    total_cost: number;
    status: string;
    created_at: string;
  }>;
}

export class AIVaultHubClient implements ISupplierClient {
  readonly supplierId: SupplierId = "AIVAULTHUB";
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(options?: SupplierClientOptions) {
    this.baseUrl = (
      options?.baseUrl ||
      process.env.AIVAULTHUB_BASE_URL ||
      "https://reseller.aivaulthub.store/api/v1"
    ).replace(/\/+$/, "");
    this.apiKey = options?.apiKey || process.env.AIVAULTHUB_API_KEY || "";
    this.timeoutMs = options?.timeoutMs || 10000;
  }

  private async request<T>(
    endpoint: string,
    init: RequestInit = {},
    maxRetries: number = 2,
    customTimeoutMs?: number,
    isOrderRequest: boolean = false,
    hasIdempotencyKey: boolean = false
  ): Promise<T> {
    const effectiveTimeout = customTimeoutMs ?? this.timeoutMs;
    const url = `${this.baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers as Record<string, string>),
    };

    if (this.apiKey) {
      headers["X-API-Key"] = this.apiKey;
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

        if (!response.ok || (data && data.success === false && !data.order_id)) {
          // Retry on 5xx or 429 for read requests, or order requests that have an external_order_id
          const canRetry = !isOrderRequest || hasIdempotencyKey;
          if ((response.status >= 500 || response.status === 429) && attempt < maxRetries && canRetry) {
            const delay = Math.pow(2, attempt) * 500;
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }

          throw SupplierError.fromAIVaultHub(response.status, data);
        }

        return data as T;
      } catch (err: any) {
        clearTimeout(timeoutId);

        if (err instanceof SupplierError) {
          throw err;
        }

        if (err.name === "AbortError") {
          lastError = new SupplierError(
            "SUPPLIER_OUTAGE",
            `AIVaultHub request timed out after ${effectiveTimeout}ms: ${endpoint}`,
            504
          );
        } else {
          lastError = new SupplierError(
            "NETWORK_ERROR",
            `AIVaultHub network error: ${err.message}`,
            503
          );
        }

        const canRetry = !isOrderRequest || hasIdempotencyKey;
        if (attempt < maxRetries && canRetry) {
          const delay = Math.pow(2, attempt) * 500;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
      }
    }

    throw lastError || new SupplierError("SUPPLIER_OUTAGE", "AIVaultHub request failed after retries", 500);
  }

  async getHealth(timeoutMs?: number): Promise<SupplierHealth> {
    const start = Date.now();
    try {
      await this.request<AIVaultHubMeResponse>("/me", { method: "GET" }, 0, timeoutMs || 5000);
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

  async getBalance(timeoutMs?: number): Promise<{ balanceUsdCents: number; balanceUsd: string }> {
    const res = await this.request<AIVaultHubMeResponse>("/me", { method: "GET" }, 2, timeoutMs);
    const balanceNum = typeof res.balance === "number" ? res.balance : parseFloat(String(res.balance || 0));
    const safeBalance = isNaN(balanceNum) ? 0 : balanceNum;
    const balanceUsdCents = usdToCents(safeBalance);
    return {
      balanceUsdCents,
      balanceUsd: centsToUsdString(balanceUsdCents),
    };
  }

  async listProducts(): Promise<CommonProduct[]> {
    const res = await this.request<AIVaultHubProductsResponse>("/products", { method: "GET" });
    const rawList = Array.isArray(res?.products) ? res.products : [];

    return rawList.map((item) => {
      const sortedTiers = Array.isArray(item.pricing_tiers)
        ? [...item.pricing_tiers].sort((a, b) => a.min - b.min)
        : [];

      const basePrice = sortedTiers.length > 0 ? sortedTiers[0].price : 0;
      const basePriceUsdCents = usdToCents(basePrice);

      const pricingTiers: PricingTier[] = sortedTiers.map((t) => ({
        minQty: t.min,
        maxQty: t.max !== undefined && t.max !== null ? t.max : null,
        price: t.price,
      }));

      return {
        supplier: "AIVAULTHUB",
        upstreamProductId: item.service_id,
        name: item.name,
        stock: item.stock ?? 0,
        inStock: (item.stock ?? 0) > 0,
        basePriceUsdCents,
        basePriceUsd: centsToUsdString(basePriceUsdCents),
        pricingTiers: pricingTiers.length > 0 ? pricingTiers : undefined,
        deliveryTypeHint: "LINK",
      };
    });
  }

  async getProduct(id: string): Promise<CommonProduct | null> {
    const products = await this.listProducts();
    return products.find((p) => p.upstreamProductId === id) || null;
  }

  async createOrder(req: SupplierOrderRequest): Promise<SupplierOrderResult> {
    const payload = {
      service_id: req.upstreamProductId,
      quantity: req.quantity,
      external_order_id: req.externalOrderId,
      accept_normal_price: true,
    };

    const res = await this.request<AIVaultHubOrderResponse>(
      "/order",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      2,
      this.timeoutMs,
      true,
      Boolean(req.externalOrderId)
    );

    const items = Array.isArray(res.products) ? res.products : [];
    const totalCents = usdToCents(res.total_cost ?? 0);

    return {
      upstreamOrderId: res.order_id,
      items,
      totalUsdCents: totalCents,
      quantity: res.quantity || req.quantity,
      raw: res,
    };
  }

  async getOrder(upstreamOrderId: string): Promise<SupplierOrderInfo | null> {
    try {
      const res = await this.request<AIVaultHubSingleOrderResponse>(
        `/order/${encodeURIComponent(upstreamOrderId)}`,
        { method: "GET" }
      );

      if (!res || !res.order_id) return null;

      let createTimestamp: number | undefined;
      if (res.created_at) {
        const parsed = Date.parse(res.created_at);
        if (!isNaN(parsed)) createTimestamp = parsed;
      }

      return {
        id: res.order_id,
        createTimestamp,
        totalUsdCents: usdToCents(res.total_cost || 0),
        quantity: res.quantity || 1,
        items: res.products || [],
      };
    } catch (err: any) {
      if (err instanceof SupplierError && err.code === "ORDER_NOT_FOUND") {
        return null;
      }
      throw err;
    }
  }

  async listRecentOrders(page: number = 1): Promise<SupplierOrderInfo[]> {
    const res = await this.request<AIVaultHubOrdersListResponse>(
      `/orders?page=${page}&limit=20`,
      { method: "GET" }
    );

    const orders = Array.isArray(res?.orders) ? res.orders : [];
    return orders.map((o) => {
      let createTimestamp: number | undefined;
      if (o.created_at) {
        const parsed = Date.parse(o.created_at);
        if (!isNaN(parsed)) createTimestamp = parsed;
      }
      return {
        id: o.order_id,
        createTimestamp,
        totalUsdCents: usdToCents(o.total_cost || 0),
        quantity: o.quantity || 1,
      };
    });
  }
}


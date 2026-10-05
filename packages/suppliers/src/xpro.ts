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
} from "./types";
import { SupplierError } from "./errors";

export interface XProProduct {
  productId: number;
  name: string;
  description: string;
  categoryId: number | null;
  deliveryType: "TEXT" | "FILE" | "LINK" | "CREDENTIALS" | "LICENSE";
  price: number;
  yourPrice?: number;
  discountPct?: number;
  currency: "USD";
  stock: number;
  inStock: boolean;
}

export interface XProCategory {
  id: number;
  categoryId?: number;
  name: string;
  productsCount?: number;
}

export interface XProBalanceResponse {
  ok: boolean;
  balance: string | number;
  currency: "USD";
  userId?: number;
}

export interface XProOrderParams {
  productId: number;
  quantity: number;
  externalOrderId: string;
}

export interface XProOrderResult {
  orderId: number;
  externalOrderId: string;
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  currency: "USD";
  status: string;
}

export interface XProDelivery {
  type: string;
  lines: string[];
}

export interface XProCreateOrderResponse {
  ok: boolean;
  order: XProOrderResult;
  delivery: XProDelivery;
  balanceAfter: string;
  duplicate?: boolean;
}

export class XProApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly requestId?: string,
    public readonly details?: unknown
  ) {
    super(`[XPro API Error ${code}]: ${message}`);
    this.name = "XProApiError";
  }
}

export class XProClient implements ISupplierClient {
  readonly supplierId: SupplierId = "XPRO";
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(options?: SupplierClientOptions) {
    this.baseUrl = (options?.baseUrl || process.env.UPSTREAM_BASE_URL || "http://paid2.daki.cc:4153/api/partner/v1").replace(/\/+$/, "");
    this.apiKey = options?.apiKey || process.env.UPSTREAM_API_KEY || "";
    this.timeoutMs = options?.timeoutMs || 10000;
  }

  private async request<T>(
    endpoint: string,
    init: RequestInit = {},
    maxRetries: number = 2,
    customTimeoutMs?: number
  ): Promise<T> {
    const effectiveTimeout = customTimeoutMs ?? this.timeoutMs;
    const url = `${this.baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers as Record<string, string>),
    };

    if (endpoint !== "/health" && this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
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

        if (!response.ok || (data && data.ok === false)) {
          const errCode = data?.error?.code || `HTTP_${response.status}`;
          const errMsg = data?.error?.message || response.statusText || "Upstream request failed";
          const reqId = data?.error?.requestId || data?.requestId;

          if ((response.status >= 500 || response.status === 429) && attempt < maxRetries) {
            const delay = Math.pow(2, attempt) * 500;
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }

          throw new XProApiError(errCode, errMsg, response.status, reqId, data?.error);
        }

        return data as T;
      } catch (err: any) {
        clearTimeout(timeoutId);

        if (err instanceof XProApiError) {
          throw err;
        }

        const isAbort = err.name === "AbortError";
        lastError = new Error(
          isAbort ? `XPro API request timed out after ${effectiveTimeout}ms` : err.message
        );

        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 500;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new XProApiError("NETWORK_ERROR", lastError?.message || "Failed to communicate with XPro API", 503);
  }

  async getHealth(timeoutMs = 2500): Promise<SupplierHealth> {
    const start = Date.now();
    try {
      await this.request<{ ok: boolean; service?: string }>("/health", {}, 0, timeoutMs);
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
    const res = await this.request<XProBalanceResponse>("/balance", {}, 2, timeoutMs);
    const balanceNum = typeof res.balance === "string" ? parseFloat(res.balance) : Number(res.balance);
    const cents = usdToCents(isNaN(balanceNum) ? 0 : balanceNum);
    return {
      balanceUsdCents: cents,
      balanceUsd: centsToUsdString(cents),
    };
  }

  async getCategories(): Promise<XProCategory[]> {
    const res = await this.request<any>("/catalog/categories");
    const raw = Array.isArray(res.categories)
      ? res.categories
      : Array.isArray(res.data)
      ? res.data
      : [];
    return raw.map((c: any) => {
      const id = c.categoryId !== undefined ? Number(c.categoryId) : Number(c.id);
      return {
        id,
        categoryId: id,
        name: c.name,
        productsCount: c.productsCount,
      };
    });
  }

  async getProducts(params?: {
    category?: string | number;
    inStock?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ products: XProProduct[]; total: number }> {
    const query = new URLSearchParams();
    if (params?.category !== undefined) query.set("category", String(params.category));
    if (params?.inStock !== undefined) query.set("inStock", String(params.inStock));
    if (params?.search) query.set("search", params.search);
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.offset) query.set("offset", String(params.offset));

    const qs = query.toString();
    const endpoint = `/catalog/products${qs ? `?${qs}` : ""}`;
    const res = await this.request<any>(endpoint);

    const items = Array.isArray(res.products)
      ? res.products
      : Array.isArray(res.data)
      ? res.data
      : [];

    return {
      products: items,
      total: typeof res.total === "number" ? res.total : items.length,
    };
  }

  /**
   * Retrieves all products by iterating pagination offsets.
   */
  async listProducts(): Promise<CommonProduct[]> {
    const allItems: XProProduct[] = [];
    const pageSize = 100;
    let offset = 0;
    let total = Infinity;

    while (offset < total) {
      const res = await this.getProducts({ limit: pageSize, offset });
      if (!res.products || res.products.length === 0) break;
      allItems.push(...res.products);
      total = res.total;
      offset += res.products.length;
      if (res.products.length < pageSize) break;
    }

    return allItems.map((p) => {
      const usdPrice = p.yourPrice !== undefined ? p.yourPrice : p.price;
      const cents = usdToCents(usdPrice);
      return {
        supplier: "XPRO",
        upstreamProductId: String(p.productId ?? (p as any).id),
        name: p.name,
        description: p.description,
        categoryId: p.categoryId ?? undefined,
        stock: p.stock ?? 0,
        inStock: p.inStock !== false && (p.stock ?? 0) > 0,
        basePriceUsdCents: cents,
        basePriceUsd: centsToUsdString(cents),
        deliveryTypeHint: p.deliveryType === "LINK" ? "LINK" : "CREDENTIALS",
      };
    });
  }

  async getProduct(productId: number | string): Promise<CommonProduct | null> {
    const numId = Number(productId);
    if (isNaN(numId)) return null;
    try {
      const res = await this.request<any>(`/catalog/products/${numId}`);
      const p = (res.product || res.data) as XProProduct;
      if (!p) return null;
      const usdPrice = p.yourPrice !== undefined ? p.yourPrice : p.price;
      const cents = usdToCents(usdPrice);
      return {
        supplier: "XPRO",
        upstreamProductId: String(p.productId ?? (p as any).id),
        name: p.name,
        description: p.description,
        categoryId: p.categoryId ?? undefined,
        stock: p.stock ?? 0,
        inStock: p.inStock !== false && (p.stock ?? 0) > 0,
        basePriceUsdCents: cents,
        basePriceUsd: centsToUsdString(cents),
        deliveryTypeHint: p.deliveryType === "LINK" ? "LINK" : "CREDENTIALS",
      };
    } catch (err: any) {
      if (err.statusCode === 404 || err.code === "PRODUCT_NOT_FOUND") return null;
      throw err;
    }
  }

  async createOrder(req: SupplierOrderRequest): Promise<SupplierOrderResult> {
    try {
      const res = await this.request<XProCreateOrderResponse>("/orders", {
        method: "POST",
        body: JSON.stringify({
          productId: Number(req.upstreamProductId),
          quantity: req.quantity,
          externalOrderId: req.externalOrderId,
        }),
      });

      return {
        upstreamOrderId: String(res.order.orderId),
        items: res.delivery?.lines || [],
        totalUsdCents: usdToCents(res.order.total),
        quantity: res.order.quantity,
        raw: res,
      };
    } catch (err: any) {
      if (err instanceof XProApiError) {
        throw SupplierError.fromXPro(err.code, err.message, err.statusCode, err.requestId, err.details);
      }
      throw err;
    }
  }

  async getOrder(orderId: number | string): Promise<SupplierOrderInfo | null> {
    try {
      const res = await this.request<any>(`/orders/${orderId}`);
      if (!res || !res.order) return null;
      return {
        id: String(res.order.orderId),
        totalUsdCents: usdToCents(res.order.total),
        quantity: res.order.quantity,
        items: res.delivery?.lines || [],
      };
    } catch (err: any) {
      if (err.statusCode === 404) return null;
      throw err;
    }
  }

  async getUsage(): Promise<any> {
    return this.request<any>("/usage");
  }
}

import { config } from "../config";

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

export class XProClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(options?: { baseUrl?: string; apiKey?: string; timeoutMs?: number }) {
    this.baseUrl = (options?.baseUrl || config.UPSTREAM_BASE_URL).replace(/\/+$/, "");
    this.apiKey = options?.apiKey || config.UPSTREAM_API_KEY;
    this.timeoutMs = options?.timeoutMs || 10000;
  }

  private async request<T>(
    endpoint: string,
    init: RequestInit = {},
    maxRetries: number = 2
  ): Promise<T> {
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
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

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

          // If rate limited or 5xx server error and we have retries left
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
          isAbort ? `XPro API request timed out after ${this.timeoutMs}ms` : err.message
        );

        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 500;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new XProApiError("NETWORK_ERROR", lastError?.message || "Failed to communicate with XPro API", 503);
  }

  /**
   * Checks upstream service health without authentication.
   */
  async getHealth(): Promise<{ ok: boolean; service: string; version: string; time: number }> {
    return this.request<{ ok: boolean; service: string; version: string; time: number }>("/health");
  }

  /**
   * Retrieves partner wallet balance in USD.
   */
  async getBalance(): Promise<XProBalanceResponse> {
    return this.request<XProBalanceResponse>("/balance");
  }

  /**
   * Retrieves category list.
   * Handles both `{ ok: true, categories: [] }` and `{ ok: true, data: [] }` response formats.
   */
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

  /**
   * Retrieves product list with optional filters.
   * Handles both `{ ok: true, products: [] }` and `{ ok: true, data: [] }` response formats.
   */
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
   * Retrieves a single product with live stock.
   */
  async getProduct(productId: number): Promise<XProProduct> {
    const res = await this.request<any>(`/catalog/products/${productId}`);
    const product = res.product || res.data;
    if (!product) {
      throw new XProApiError("PRODUCT_NOT_FOUND", `Product with ID ${productId} not found`, 404);
    }
    return product as XProProduct;
  }

  /**
   * Idempotently places an order with upstream supplier.
   * Always pass the same internal externalOrderId to guarantee zero double-charging.
   */
  async createOrder(params: XProOrderParams): Promise<XProCreateOrderResponse> {
    return this.request<XProCreateOrderResponse>("/orders", {
      method: "POST",
      body: JSON.stringify({
        productId: params.productId,
        quantity: params.quantity,
        externalOrderId: params.externalOrderId,
      }),
    });
  }

  /**
   * Retrieves an existing order and its delivery contents.
   */
  async getOrder(orderId: number): Promise<any> {
    return this.request<any>(`/orders/${orderId}`);
  }

  /**
   * Retrieves account usage, spend statistics, and active limits.
   */
  async getUsage(): Promise<any> {
    return this.request<any>("/usage");
  }
}

export const xproClient = new XProClient();

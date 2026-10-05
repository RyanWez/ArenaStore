import type { PricingTierItem } from "@arena/shared";

export type SupplierId = "XPRO" | "DIGITALCORE";

export interface PricingTier extends PricingTierItem {}

export interface CommonProduct {
  supplier: SupplierId;
  upstreamProductId: string; // XPro: numeric string (e.g. "12"); DigitalCore: slug (e.g. "gemini_pro_18_months")
  name: string;
  description?: string;
  categoryId?: string | number;
  stock: number;
  inStock: boolean;
  basePriceUsdCents: number; // Tier-0 price in integer cents
  basePriceUsd: string; // Formatted e.g. "0.55"
  pricingTiers?: PricingTier[];
  deliveryTypeHint?: "CREDENTIALS" | "LINK" | "TEXT";
}

export interface SupplierHealth {
  online: boolean;
  latencyMs: number;
  error?: string;
}

export interface SupplierOrderRequest {
  upstreamProductId: string;
  quantity: number;
  externalOrderId?: string; // Passed to XPro for idempotency
  pricingTiers?: PricingTier[];
}

export interface SupplierOrderResult {
  upstreamOrderId: string;
  items: string[];
  totalUsdCents: number;
  quantity: number;
  viewUrl?: string;
  raw?: unknown;
}

export interface SupplierOrderInfo {
  id: string;
  createTimestamp?: number;
  totalUsdCents: number;
  quantity: number;
  items?: string[];
  viewUrl?: string;
}

export interface SupplierClientOptions {
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
}

export interface ISupplierClient {
  readonly supplierId: SupplierId;
  getHealth(timeoutMs?: number): Promise<SupplierHealth>;
  getBalance(timeoutMs?: number): Promise<{ balanceUsdCents: number; balanceUsd: string }>;
  listProducts(): Promise<CommonProduct[]>;
  getProduct(id: string): Promise<CommonProduct | null>;
  createOrder(req: SupplierOrderRequest): Promise<SupplierOrderResult>;
  getOrder?(upstreamOrderId: string): Promise<SupplierOrderInfo | null>;
  listRecentOrders?(page?: number): Promise<SupplierOrderInfo[]>;
}

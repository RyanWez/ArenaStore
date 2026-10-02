/**
 * Synthetic XPro Partner API payloads for tests. All data is fabricated —
 * no real product, customer, or delivery information.
 */

export const MOCK_PE_CATEGORY_NAME = "{pe:4963072209334567688} Duolingo";
export const MOCK_PE_PRODUCT_NAME = "{pe:5069075201950483359} Gemini AI 18 MONTH";
export const MOCK_PE_DESCRIPTION =
  "⚡ {pe:5069075201950483359} Instant activation on your personal Google account\n⬛ {pe:5229235451541338986} No Card Required";

export interface MockUpstreamCategory {
  id: number;
  categoryId: number;
  name: string;
  productsCount?: number;
}

export interface MockUpstreamProduct {
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

export function makeUpstreamCategory(
  overrides: Partial<MockUpstreamCategory> = {}
): MockUpstreamCategory {
  return {
    id: 501,
    categoryId: 501,
    name: MOCK_PE_CATEGORY_NAME,
    productsCount: 2,
    ...overrides,
  };
}

export function makeUpstreamProduct(
  overrides: Partial<MockUpstreamProduct> = {}
): MockUpstreamProduct {
  return {
    productId: 6001,
    name: MOCK_PE_PRODUCT_NAME,
    description: MOCK_PE_DESCRIPTION,
    categoryId: 501,
    deliveryType: "LINK",
    price: 0.69,
    yourPrice: 0.69,
    currency: "USD",
    stock: 25,
    inStock: true,
    ...overrides,
  };
}

export function makeUpstreamOrderResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    order: {
      orderId: 987654,
      externalOrderId: "arn-test-external-id",
      productId: 6001,
      productName: "Gemini AI 18 MONTH",
      quantity: 1,
      unitPrice: 0.69,
      total: 0.69,
      currency: "USD",
      status: "COMPLETED",
    },
    delivery: {
      type: "CREDENTIALS",
      lines: ["arena.test.user@arenastore.mm:ArenaTestPass#1"],
    },
    balanceAfter: "49.31",
    ...overrides,
  };
}

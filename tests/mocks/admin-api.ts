/**
 * Admin API payload builders for Playwright E2E tests.
 *
 * These mirror the exact response shapes the admin UI consumes:
 * every endpoint answers with the `{ ok, ... }` envelope, and list
 * endpoints use the admin route field names (`slips`, `products`).
 * No real tokens, customers, or product data.
 */

export const E2E_ADMIN_EMAIL = "admin@arenastore.mm";
export const E2E_ADMIN_PASSWORD = "arena-e2e-password-9f2";
export const E2E_ADMIN_TOKEN = "e2e-admin-session-token";

export interface MockAdminUser {
  id: number;
  email: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  role: string;
}

export function makeAdminUser(overrides: Partial<MockAdminUser> = {}): MockAdminUser {
  return {
    id: 1,
    email: E2E_ADMIN_EMAIL,
    username: "arena-admin",
    firstName: "Arena",
    lastName: "Admin",
    role: "ADMIN",
    ...overrides,
  };
}

export interface MockAdminRole {
  id: number | null;
  name: string | null;
  isSuperadmin: boolean;
}

export function makeAdminRole(overrides: Partial<MockAdminRole> = {}): MockAdminRole {
  return { id: 1, name: "SUPERADMIN", isSuperadmin: true, ...overrides };
}

/**
 * Every key in the API's rbac catalog (apps/api/src/rbac/catalog.ts). The E2E
 * admin acts as an all-permissions owner so the panel's fail-closed page and
 * action gates never hide what the specs must click. Keep in sync with the
 * catalog.
 */
export const MOCK_ADMIN_PERMISSIONS: string[] = [
  "overview.view",
  "supplier.view",
  "supplier.sync",
  "products.view",
  "products.edit",
  "products.show_cost",
  "products.show_margin",
  "orders.view",
  "orders.refund",
  "orders.resend",
  "payments.view",
  "payments.review",
  "customers.view",
  "customers.balance",
  "customers.status",
  "customers.delete",
  "settings.view",
  "settings.pricing",
  "settings.payments",
  "settings.operations",
  "users.manage",
  "roles.manage",
  "audit.view",
];

export interface MockAdminProduct {
  id: string;
  supplierProductId: string;
  nameMmk: string;
  name: string;
  categoryName: string;
  descriptionMmk: string;
  supplierPriceUsd: string;
  retailPriceMmk: number;
  supplierStock: number;
  localStockLimit: number | null;
  isActive: boolean;
  deliveryType: string;
}

export function makeProduct(overrides: Partial<MockAdminProduct> = {}): MockAdminProduct {
  return {
    id: "PRD-1001",
    supplierProductId: "UP-NET-1001",
    nameMmk: "Netflix Premium (1 Month)",
    name: "Netflix Premium (1 Month)",
    categoryName: "Streaming",
    descriptionMmk: "Instant delivery · 30-day warranty",
    supplierPriceUsd: "2.50",
    retailPriceMmk: 15000,
    supplierStock: 40,
    localStockLimit: null,
    isActive: true,
    deliveryType: "CREDENTIALS",
    ...overrides,
  };
}

/**
 * Three products covering every stock/status badge combination:
 * selling + in stock, paused, selling + out of stock.
 */
export function makeProductCatalog(): MockAdminProduct[] {
  return [
    makeProduct(),
    makeProduct({
      id: "PRD-1002",
      supplierProductId: "UP-SPT-1002",
      nameMmk: "Spotify Premium (1 Month)",
      name: "Spotify Premium (1 Month)",
      supplierPriceUsd: "2.00",
      retailPriceMmk: 12000,
      supplierStock: 25,
      isActive: false,
    }),
    makeProduct({
      id: "PRD-1003",
      supplierProductId: "UP-CNV-1003",
      nameMmk: "Canva Pro (1 Year)",
      name: "Canva Pro (1 Year)",
      categoryName: "Design",
      supplierPriceUsd: "1.80",
      retailPriceMmk: 9000,
      supplierStock: 0,
    }),
  ];
}

export interface MockAdminSlip {
  id: string;
  reference: string;
  displayName: string;
  username: string;
  telegramId: string;
  method: string;
  amount: number;
  txnRef: string;
  slipUrl: string;
  date: string;
  status: "SUBMITTED" | "COMPLETED" | "REJECTED";
  intendedProduct: string;
}

export function makeSlip(overrides: Partial<MockAdminSlip> = {}): MockAdminSlip {
  return {
    id: "DEP-7001",
    reference: "TOP-7001",
    displayName: "Aung Aung",
    username: "@aung_aung",
    telegramId: "700100200",
    method: "KPAY",
    amount: 10000,
    txnRef: "KP88120033",
    slipUrl: `/api/admin/deposits/DEP-7001/slip-image`,
    date: "2026-10-02T09:30:00.000Z",
    status: "SUBMITTED",
    intendedProduct: "Netflix Premium (1 Month)",
    ...overrides,
  };
}

/** One slip per review state: pending review, already approved, rejected. */
export function makeDepositSlips(): MockAdminSlip[] {
  return [
    makeSlip(),
    makeSlip({
      id: "DEP-7002",
      reference: "TOP-7002",
      displayName: "Su Su",
      username: "@su_su",
      telegramId: "700100201",
      method: "WAVEPAY",
      amount: 25000,
      txnRef: "WP77210044",
      slipUrl: `/api/admin/deposits/DEP-7002/slip-image`,
      status: "COMPLETED",
      intendedProduct: "Spotify Premium (1 Month)",
    }),
    makeSlip({
      id: "DEP-7003",
      reference: "TOP-7003",
      displayName: "Kyaw Kyaw",
      username: "@kyaw_kyaw",
      telegramId: "700100202",
      method: "UAB_PAY",
      amount: 5000,
      txnRef: "UB66110055",
      slipUrl: `/api/admin/deposits/DEP-7003/slip-image`,
      status: "REJECTED",
      intendedProduct: "Canva Pro (1 Year)",
    }),
  ];
}

export const MOCK_ADMIN_STATS = {
  ok: true,
  stats: {
    totalSalesMmk: 2450000,
    totalOrders: 128,
    fulfilledOrders: 121,
    pendingOrders: 7,
    pendingDepositsCount: 1,
    activeProductsCount: 2,
  },
};

export function makeAdminOrders() {
  return {
    ok: true,
    orders: [
      {
        id: "ORD-9001",
        orderId: "ORD-9001",
        product: "Netflix Premium (1 Month)",
        user: "Aung Aung",
        telegramId: "700100200",
        totalMmk: 15000,
        qty: 1,
        status: "COMPLETED",
        date: "2026-10-02T08:12:00.000Z",
        delivery: "CREDENTIALS",
      },
    ],
  };
}

/** All values are strings — the admin settings form round-trips string values. */
export function makeAdminSettings() {
  return {
    ok: true,
    settings: {
      usdToMmkRate: "4500",
      defaultMarginPct: "25",
      orderTimeoutMinutes: "15",
      supportTelegramHandle: "@ArenaStoreSupport",
      isMaintenanceMode: "false",
      kpayAccountName: "Arena Digital Services",
      kpayPhone: "09 987 654 321",
      wavepayAccountName: "Arena Store",
      wavepayPhone: "09 789 123 456",
      ayapayAccountName: "Arena Store",
      ayapayPhone: "09 987 654 321",
      uabpayAccountName: "Arena Store",
      uabpayPhone: "09 789 123 456",
    },
  };
}

/** Balance is high enough that wallet capacity never constrains the fixtures' sellable stock. */
export function makeSupplierStatus() {
  return {
    ok: true,
    supplier: {
      balanceUsd: "250.00",
      currency: "USD",
      health: "ONLINE",
      version: "2.4.1",
      lastSyncAt: "2026-10-02T08:00:00.000Z",
    },
  };
}

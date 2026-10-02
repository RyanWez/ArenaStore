import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  MOCK_PE_CATEGORY_NAME,
  MOCK_PE_DESCRIPTION,
  MOCK_PE_PRODUCT_NAME,
  makeUpstreamCategory,
  makeUpstreamProduct,
} from "../mocks/upstream";

/**
 * Catalog sync integration test: verifies the high-speed batch upsert path
 * (syncFullCatalog) against real Postgres, including the two invariants the
 * sync performance work depends on:
 *   1. Telegram custom emoji placeholders ({pe:...}) survive the sync.
 *   2. Admin customizations (isActive pause, custom retail price) are never
 *      overwritten by an upstream re-sync.
 */

const xproState = vi.hoisted(() => ({
  balance: "50.00",
  categories: [] as unknown[],
  products: [] as unknown[],
  createOrderImpl: async () => {
    throw new Error("createOrderImpl not configured");
  },
  createOrderCalls: [] as unknown[],
}));

vi.mock("../../apps/api/src/services/xpro-client", () => ({
  xproClient: {
    getBalance: () => Promise.resolve({ ok: true, balance: xproState.balance, currency: "USD" }),
    getCategories: () => Promise.resolve(xproState.categories),
    getProducts: () => Promise.resolve({ products: xproState.products, total: xproState.products.length }),
    createOrder: (params: unknown) => {
      xproState.createOrderCalls.push(params);
      return xproState.createOrderImpl(params);
    },
    getHealth: () => Promise.resolve({ ok: true, service: "mock-xpro", version: "test", time: 0 }),
    getProduct: () => Promise.reject(new Error("not mocked")),
    getOrder: () => Promise.reject(new Error("not mocked")),
    getUsage: () => Promise.reject(new Error("not mocked")),
  },
  XProApiError: class XProApiError extends Error {},
  XProProduct: class XProProduct {},
  XProCategory: class XProCategory {},
  XProCreateOrderResponse: class XProCreateOrderResponse {},
}));

import { catalogService } from "../../apps/api/src/services/catalog.service";
import { getDb, closeDb, categories, products, productSupplierSnapshots } from "@arena/db";

const UPSTREAM_CATEGORY_ID = 501;
const PRODUCT_A_UPSTREAM_ID = 6001;
const PRODUCT_B_UPSTREAM_ID = 6002;

function seedUpstreamFixture(): void {
  xproState.categories = [makeUpstreamCategory({ id: UPSTREAM_CATEGORY_ID })];
  xproState.products = [
    makeUpstreamProduct({ productId: PRODUCT_A_UPSTREAM_ID }),
    makeUpstreamProduct({
      productId: PRODUCT_B_UPSTREAM_ID,
      name: "{pe:4963072209334567688} Canva Pro 1 YEAR",
      deliveryType: "CREDENTIALS",
      price: 1.2,
      yourPrice: undefined,
      stock: 0,
      inStock: false,
    }),
  ];
}

beforeAll(() => {
  seedUpstreamFixture();
});

afterAll(async () => {
  await closeDb();
});

describe("Catalog sync (batch upserts with admin customization preservation)", () => {
  it("syncs categories and products with emoji placeholders, slugs, and pricing", async () => {
    const counts = await catalogService.syncFullCatalog(4500);
    expect(counts).toEqual({ categories: 1, products: 2 });

    const db = getDb();

    // Category keeps the raw upstream name (bot extracts the emoji id from it)
    // while slug and iconEmoji are clean/derived.
    const [categoryRow] = await db
      .select()
      .from(categories)
      .where(eq(categories.upstreamCategoryId, UPSTREAM_CATEGORY_ID));
    expect(categoryRow).toBeTruthy();
    expect(categoryRow.name).toBe(MOCK_PE_CATEGORY_NAME);
    expect(categoryRow.slug).toBe("duolingo");
    expect(categoryRow.iconEmoji).toBe("4963072209334567688");

    // Product A: 0.69 USD → 3,105 MMK cost → +25% margin → 3,900 Ks (rounded to 100).
    const [productA] = await db
      .select()
      .from(products)
      .where(eq(products.upstreamProductId, PRODUCT_A_UPSTREAM_ID));
    expect(productA).toBeTruthy();
    expect(productA.nameMmk).toBe(MOCK_PE_PRODUCT_NAME);
    expect(productA.descriptionMmk).toBe(MOCK_PE_DESCRIPTION);
    expect(productA.retailPriceMmk).toBe(3900);
    expect(productA.categoryId).toBe(categoryRow.id);
    expect(productA.isActive).toBe(true);

    const [snapshotA] = await db
      .select()
      .from(productSupplierSnapshots)
      .where(eq(productSupplierSnapshots.productId, productA.id));
    expect(snapshotA.rawName).toBe(MOCK_PE_PRODUCT_NAME);
    expect(snapshotA.rawDescription).toBe(MOCK_PE_DESCRIPTION);
    expect(snapshotA.supplierPriceUsd).toBe("0.69");
    expect(snapshotA.supplierStock).toBe(25);
    expect(snapshotA.inStock).toBe(true);
    expect(snapshotA.deliveryType).toBe("LINK");

    // Product B: no yourPrice → falls back to price; out of stock honored.
    const [snapshotB] = await db
      .select({ snapshot: productSupplierSnapshots })
      .from(productSupplierSnapshots)
      .innerJoin(products, eq(products.id, productSupplierSnapshots.productId))
      .where(eq(products.upstreamProductId, PRODUCT_B_UPSTREAM_ID));
    expect(snapshotB.snapshot.supplierPriceUsd).toBe("1.2");
    expect(snapshotB.snapshot.supplierStock).toBe(0);
    expect(snapshotB.snapshot.inStock).toBe(false);
    expect(snapshotB.snapshot.deliveryType).toBe("CREDENTIALS");
  });

  it("is idempotent: re-syncing the same upstream data creates no duplicates", async () => {
    await catalogService.syncFullCatalog(4500);
    await catalogService.syncFullCatalog(4500);

    const db = getDb();
    const categoryRows = await db
      .select()
      .from(categories)
      .where(eq(categories.slug, "duolingo"));
    expect(categoryRows).toHaveLength(1);

    const productRows = await db
      .select()
      .from(products)
      .where(inArray(products.upstreamProductId, [PRODUCT_A_UPSTREAM_ID, PRODUCT_B_UPSTREAM_ID]));
    expect(productRows).toHaveLength(2);

    const snapshotRows = await db
      .select()
      .from(productSupplierSnapshots)
      .where(inArray(productSupplierSnapshots.upstreamProductId, [PRODUCT_A_UPSTREAM_ID, PRODUCT_B_UPSTREAM_ID]));
    expect(snapshotRows).toHaveLength(2);
  });

  it("preserves admin customizations (pause + custom price) across a re-sync while refreshing supplier data", async () => {
    // First sync establishes the baseline, then the admin pauses the product
    // and overrides its retail price.
    await catalogService.syncFullCatalog(4500);
    const db = getDb();
    await db
      .update(products)
      .set({ isActive: false, retailPriceMmk: 9999 })
      .where(eq(products.upstreamProductId, PRODUCT_A_UPSTREAM_ID));

    // Upstream changes description, price, and stock for the same product.
    xproState.products = [
      makeUpstreamProduct({
        productId: PRODUCT_A_UPSTREAM_ID,
        description: "UPDATED upstream description {pe:5069075201950483359}",
        price: 0.99,
        yourPrice: 0.99,
        stock: 99,
      }),
      makeUpstreamProduct({
        productId: PRODUCT_B_UPSTREAM_ID,
        name: "{pe:4963072209334567688} Canva Pro 1 YEAR",
        deliveryType: "CREDENTIALS",
        price: 1.2,
        yourPrice: undefined,
        stock: 0,
        inStock: false,
      }),
    ];

    await catalogService.syncFullCatalog(4500);

    const [productA] = await db
      .select()
      .from(products)
      .where(eq(products.upstreamProductId, PRODUCT_A_UPSTREAM_ID));
    // Admin-owned fields are untouched...
    expect(productA.isActive).toBe(false);
    expect(productA.retailPriceMmk).toBe(9999);
    // ...while upstream-owned fields are refreshed.
    expect(productA.descriptionMmk).toBe(
      "UPDATED upstream description {pe:5069075201950483359}"
    );

    const [snapshotA] = await db
      .select()
      .from(productSupplierSnapshots)
      .where(eq(productSupplierSnapshots.productId, productA.id));
    expect(snapshotA.supplierPriceUsd).toBe("0.99");
    expect(snapshotA.supplierStock).toBe(99);
    expect(snapshotA.inStock).toBe(true);
  });
});

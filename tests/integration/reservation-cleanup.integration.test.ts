import { describe, it, expect, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Expired stock-reservation cleanup: the catalog scheduler purges reservations
 * whose hold window has passed (they would otherwise accumulate forever and
 * bloat the sellable-stock aggregate).
 */

const xproState = vi.hoisted(() => ({
  balance: "50.00",
  categories: [] as unknown[],
  products: [] as unknown[],
}));

vi.mock("../../apps/api/src/services/xpro-client", () => ({
  xproClient: {
    getBalance: () => Promise.resolve({ ok: true, balance: xproState.balance, currency: "USD" }),
    getCategories: () => Promise.resolve(xproState.categories),
    getProducts: () => Promise.resolve({ products: xproState.products, total: xproState.products.length }),
    createOrder: () => Promise.reject(new Error("not mocked")),
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
import { getDb, closeDb, users, orders, stockReservations } from "@arena/db";
import { seedCatalog, syntheticTelegramId } from "../fixtures/seed";

afterAll(async () => {
  await closeDb();
});

async function createReservationForTest(productId: number) {
  const telegramId = syntheticTelegramId();
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({
      telegramId,
      username: "test_customer",
      firstName: "Test",
      role: "CUSTOMER",
    })
    .returning();

  const rand = Math.floor(10000 + Math.random() * 90000);
  const [order] = await db
    .insert(orders)
    .values({
      publicOrderNo: `ARN-${Date.now()}-${rand}`,
      externalOrderId: `ext-ord-${Date.now()}-${rand}`,
      customerId: user.id,
      totalAmountMmk: 5000,
      status: "PENDING_PAYMENT",
    })
    .returning();

  const [reservation] = await db
    .insert(stockReservations)
    .values({
      orderId: order.id,
      productId,
      quantity: 1,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    })
    .returning();

  expect(reservation).toBeTruthy();
  return reservation;
}

describe("expired stock-reservation purge", () => {
  it("deletes only reservations whose hold window has passed", async () => {
    const catalog = await seedCatalog({ priceUsd: "0.69", stock: 50 });
    const expired = await createReservationForTest(catalog.product.id);
    const active = await createReservationForTest(catalog.product.id);

    // Age the first reservation past its hold window.
    const db = getDb();
    await db
      .update(stockReservations)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(stockReservations.id, expired.id));

    const purged = await catalogService.purgeExpiredReservations();
    expect(purged).toBeGreaterThanOrEqual(1);

    const [gone] = await db
      .select()
      .from(stockReservations)
      .where(eq(stockReservations.id, expired.id));
    expect(gone).toBeUndefined();

    const [kept] = await db
      .select()
      .from(stockReservations)
      .where(eq(stockReservations.id, active.id));
    expect(kept).toBeTruthy();

    // Sellable-stock computation still sees only the active reservation.
    const remaining = await db
      .select({ totalReserved: stockReservations.quantity })
      .from(stockReservations)
      .where(eq(stockReservations.productId, catalog.product.id));
    expect(remaining).toHaveLength(1);
  });
});

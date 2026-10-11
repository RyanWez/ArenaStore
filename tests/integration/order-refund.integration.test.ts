import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { InMemoryRedis } from "../setup/in-memory-redis";
import { TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD } from "../setup/test-env";

/**
 * Order refund race test (#2): two concurrent refund requests for the same
 * order must credit the customer's wallet exactly once. The guarded UPDATE
 * ("flip to REFUNDED only if not already, returning the row") claims the
 * refund atomically, so the loser aborts before touching the wallet.
 */

const h = vi.hoisted(() => ({ redis: undefined as InMemoryRedis | undefined }));
vi.mock("../../apps/api/src/services/redis", () => ({
  getRedis: () => h.redis as never,
}));

vi.mock("../../apps/api/src/services/xpro-client", () => ({
  xproClient: {
    getBalance: () => Promise.resolve({ ok: true, balance: "50.00", currency: "USD" }),
    getCategories: () => Promise.resolve([]),
    getProducts: () => Promise.resolve({ products: [], total: 0 }),
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

import { buildServer } from "../../apps/api/src/server";
import { getDb, closeDb, orders, wallets, walletLedger } from "@arena/db";
import { seedCustomer, syntheticTelegramId } from "../fixtures/seed";

let app: FastifyInstance;
let adminToken: string;

async function seedDeliveredOrder(customerId: number, totalAmountMmk: number) {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const [row] = await getDb()
    .insert(orders)
    .values({
      publicOrderNo: `ARN-REFUND-${suffix}`,
      externalOrderId: `EXT-REFUND-${suffix}`,
      customerId,
      status: "DELIVERED",
      totalAmountMmk,
      supplier: "XPRO",
    })
    .returning();
  return row;
}

function refund(orderId: string) {
  return app.inject({
    method: "POST",
    url: `/api/admin/orders/${orderId}/refund`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { reason: "Race test" },
  });
}

beforeAll(async () => {
  h.redis = new InMemoryRedis();
  app = await buildServer();

  const login = await app.inject({
    method: "POST",
    url: "/api/admin/auth/login",
    payload: { email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD },
  });
  expect(login.statusCode).toBe(200);
  adminToken = login.json().token;
});

afterAll(async () => {
  await app.close();
  await closeDb();
});

describe("Order refund double-refund race (#2)", () => {
  it("credits the wallet exactly once under a concurrent double-submit", async () => {
    const telegramId = syntheticTelegramId();
    const { user } = await seedCustomer(telegramId, 0);
    const order = await seedDeliveredOrder(user.id, 7800);

    const [r1, r2] = await Promise.all([refund(order.publicOrderNo), refund(order.publicOrderNo)]);

    // Exactly one request wins (200) and the other is rejected (400).
    expect([r1.statusCode, r2.statusCode].sort()).toEqual([200, 400]);

    // The wallet is credited exactly once...
    const [walletRow] = await getDb().select().from(wallets).where(eq(wallets.userId, user.id));
    expect(walletRow.balanceMmk).toBe(7800);

    // ...with a single REFUND_CREDIT ledger entry...
    const ledger = await getDb()
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.referenceId, order.publicOrderNo));
    expect(ledger).toHaveLength(1);
    expect(ledger[0].type).toBe("REFUND_CREDIT");
    expect(ledger[0].amountMmk).toBe(7800);

    // ...and the order ends REFUNDED.
    const [orderRow] = await getDb().select().from(orders).where(eq(orders.id, order.id));
    expect(orderRow.status).toBe("REFUNDED");
  });

  it("rejects a second sequential refund with 400 and does not credit again", async () => {
    const telegramId = syntheticTelegramId();
    const { user } = await seedCustomer(telegramId, 0);
    const order = await seedDeliveredOrder(user.id, 5000);

    const first = await refund(order.publicOrderNo);
    expect(first.statusCode).toBe(200);

    const second = await refund(order.publicOrderNo);
    expect(second.statusCode).toBe(400);

    const [walletRow] = await getDb().select().from(wallets).where(eq(wallets.userId, user.id));
    expect(walletRow.balanceMmk).toBe(5000);

    const ledger = await getDb()
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.referenceId, order.publicOrderNo));
    expect(ledger).toHaveLength(1);
  });
});

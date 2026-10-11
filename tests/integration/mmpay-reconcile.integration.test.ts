import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { InMemoryRedis } from "../setup/in-memory-redis";
import { TEST_INTERNAL_API_TOKEN } from "../setup/test-env";

/**
 * MMQR reconciliation-sweep tests (production blocker #1 — webhook-lost
 * recovery). The webhook is bypassed entirely; the gateway status pull is
 * injected, so these assert the DB credit path the sweep and the on-demand
 * "Refresh" route take when a webhook was never delivered.
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

const h = vi.hoisted(() => ({ redis: undefined as InMemoryRedis | undefined }));
vi.mock("../../apps/api/src/services/redis", () => ({
  getRedis: () => h.redis as never,
}));

import { buildServer } from "../../apps/api/src/server";
import { getDb, closeDb, wallets, walletLedger, topUpRequests } from "@arena/db";
import { reconcilePendingMmpay } from "../../apps/api/src/services/mmpay-reconcile-scheduler";
import { mmpayService } from "../../apps/api/src/services/mmpay.service";
import { seedCustomer, syntheticTelegramId } from "../fixtures/seed";

let app: FastifyInstance;

async function seedPendingMmpay(userId: number, amountMmk: number, expiresInMin = 15) {
  const reference = `MMQR-REC-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const [row] = await getDb()
    .insert(topUpRequests)
    .values({
      reference,
      userId,
      amountMmk,
      paymentMethod: "MMPAY",
      status: "PENDING",
      mmpayOrderId: reference,
      mmpayQrString: "00020101021153031045802MM6304ABCD",
      expiresAt: new Date(Date.now() + expiresInMin * 60 * 1000),
    })
    .returning();
  return { id: row.id, reference: row.reference };
}

beforeAll(async () => {
  h.redis = new InMemoryRedis();
  app = await buildServer();
});

afterAll(async () => {
  await app.close();
  await closeDb();
});

describe("MMQR reconciliation sweep (webhook-lost recovery)", () => {
  it("credits a PENDING order the gateway reports as SUCCESS (lost webhook)", async () => {
    const telegramId = syntheticTelegramId();
    const amountMmk = 12000;
    const { user } = await seedCustomer(telegramId, 0);
    const topUp = await seedPendingMmpay(user.id, amountMmk);

    const result = await reconcilePendingMmpay({
      delayMs: 0,
      getStatus: async (orderId) => ({
        orderId,
        status: "SUCCESS",
        amount: amountMmk,
        currency: "MMK",
        transactionRefId: "TX-REC-1",
        vendorQrRefId: "VQR-REC-1",
      }),
    });

    expect(result.credited).toBeGreaterThanOrEqual(1);

    const [row] = await getDb().select().from(topUpRequests).where(eq(topUpRequests.id, topUp.id));
    expect(row.status).toBe("COMPLETED");
    const [walletRow] = await getDb().select().from(wallets).where(eq(wallets.userId, user.id));
    expect(walletRow.balanceMmk).toBe(amountMmk);
    const ledger = await getDb().select().from(walletLedger).where(eq(walletLedger.walletId, walletRow.id));
    expect(ledger).toHaveLength(1);
  });

  it("never double-credits when the webhook already settled the order", async () => {
    const telegramId = syntheticTelegramId();
    const amountMmk = 8000;
    const { user } = await seedCustomer(telegramId, 0);
    const topUp = await seedPendingMmpay(user.id, amountMmk);

    // The webhook credits first.
    const first = await app.inject({
      method: "POST",
      url: "/api/webhooks/mmpay",
      headers: { "content-type": "application/json" },
      payload: { orderId: topUp.reference, amount: amountMmk, currency: "MMK", status: "SUCCESS" },
    });
    expect(first.statusCode).toBe(200);

    // A later reconcile tick sees the same gateway SUCCESS — must be a no-op.
    const result = await reconcilePendingMmpay({
      delayMs: 0,
      getStatus: async (orderId) => ({ orderId, status: "SUCCESS", amount: amountMmk, currency: "MMK" }),
    });
    expect(result.credited).toBe(0);

    const [walletRow] = await getDb().select().from(wallets).where(eq(wallets.userId, user.id));
    expect(walletRow.balanceMmk).toBe(amountMmk);
    const ledger = await getDb().select().from(walletLedger).where(eq(walletLedger.walletId, walletRow.id));
    expect(ledger).toHaveLength(1);
  });

  it("does not credit while the gateway still reports PENDING", async () => {
    const telegramId = syntheticTelegramId();
    const amountMmk = 6000;
    const { user } = await seedCustomer(telegramId, 0);
    const topUp = await seedPendingMmpay(user.id, amountMmk);

    const result = await reconcilePendingMmpay({
      delayMs: 0,
      getStatus: async (orderId) => ({ orderId, status: "PENDING", amount: amountMmk, currency: "MMK" }),
    });
    expect(result.credited).toBe(0);

    const [row] = await getDb().select().from(topUpRequests).where(eq(topUpRequests.id, topUp.id));
    expect(row.status).toBe("PENDING");
    const [walletRow] = await getDb().select().from(wallets).where(eq(wallets.userId, user.id));
    expect(walletRow?.balanceMmk ?? 0).toBe(0);
  });

  it("refuses an amount mismatch and claims the manual-reconcile alert once", async () => {
    const telegramId = syntheticTelegramId();
    const amountMmk = 10000;
    const { user } = await seedCustomer(telegramId, 0);
    const topUp = await seedPendingMmpay(user.id, amountMmk);

    const run = () =>
      reconcilePendingMmpay({
        delayMs: 0,
        getStatus: async (orderId) => ({ orderId, status: "SUCCESS", amount: amountMmk - 1, currency: "MMK" }),
      });

    await run();
    const [afterFirst] = await getDb().select().from(topUpRequests).where(eq(topUpRequests.id, topUp.id));
    expect(afterFirst.status).toBe("PENDING");
    expect(afterFirst.mmpayReconcileAlertedAt).not.toBeNull();
    const firstAlertAt = afterFirst.mmpayReconcileAlertedAt;

    // A second tick must not credit, and must not re-claim (one-time alert).
    await run();
    const [afterSecond] = await getDb().select().from(topUpRequests).where(eq(topUpRequests.id, topUp.id));
    expect(afterSecond.status).toBe("PENDING");
    expect(afterSecond.mmpayReconcileAlertedAt?.getTime()).toBe(firstAlertAt?.getTime());

    const [walletRow] = await getDb().select().from(wallets).where(eq(wallets.userId, user.id));
    expect(walletRow?.balanceMmk ?? 0).toBe(0);
  });
});

describe("MMQR on-demand reconcile via the status route (Refresh)", () => {
  it("credits a PENDING order when the gateway reports SUCCESS on Refresh", async () => {
    const telegramId = syntheticTelegramId();
    const amountMmk = 7500;
    const { user } = await seedCustomer(telegramId, 0);
    const topUp = await seedPendingMmpay(user.id, amountMmk);

    const readySpy = vi.spyOn(mmpayService, "ready", "get").mockReturnValue(true);
    const statusSpy = vi.spyOn(mmpayService, "getPaymentStatus").mockResolvedValue({
      orderId: topUp.reference,
      status: "SUCCESS",
      amount: amountMmk,
      currency: "MMK",
      transactionRefId: "TX-REFRESH-1",
      vendorQrRefId: "VQR-REFRESH-1",
    });

    try {
      const res = await app.inject({
        method: "GET",
        url: `/api/payments/mmpay/status/${topUp.reference}`,
        headers: { "x-internal-token": TEST_INTERNAL_API_TOKEN },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("COMPLETED");

      const [walletRow] = await getDb().select().from(wallets).where(eq(wallets.userId, user.id));
      expect(walletRow.balanceMmk).toBe(amountMmk);
    } finally {
      statusSpy.mockRestore();
      readySpy.mockRestore();
    }
  });
});

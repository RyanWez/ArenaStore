import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { InMemoryRedis } from "../setup/in-memory-redis";
import { TEST_INTERNAL_API_TOKEN } from "../setup/test-env";

/**
 * MyanMyanPay webhook + manual-review guard tests.
 *
 * Covers Phase-1 fixes:
 *  - #3: a SUCCESS gateway callback credits a PENDING MMPay top-up and flips it
 *    to COMPLETED; a duplicate callback is idempotent (no double credit).
 *  - #2: a human (Telegram group / panel) can NEVER manually approve a PENDING
 *    MMPay request — only the gateway webhook can.
 *
 * Signature verification is exercised separately in the unit suite; here
 * NODE_ENV=test bypasses it so the DB credit path can be asserted directly.
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
import { getDb, closeDb, users, wallets, walletLedger, topUpRequests } from "@arena/db";
import { seedCustomer, syntheticTelegramId } from "../fixtures/seed";

let app: FastifyInstance;

async function seedPendingMmpay(userId: number, amountMmk: number) {
  const reference = `MMQR-TEST-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
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
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    })
    .returning();
  return { id: row.id, reference: row.reference };
}

function webhook(body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: "/api/webhooks/mmpay",
    headers: { "content-type": "application/json" },
    payload: body,
  });
}

function botReview(id: number, body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `/api/bot/deposits/${id}/review`,
    headers: { "x-internal-token": TEST_INTERNAL_API_TOKEN },
    payload: body,
  });
}

beforeAll(async () => {
  h.redis = new InMemoryRedis();
  app = await buildServer();
});

afterAll(async () => {
  await app.close();
  await closeDb();
});

describe("MMPay webhook (POST /api/webhooks/mmpay)", () => {
  it("credits a PENDING MMPay top-up on SUCCESS and marks it COMPLETED", async () => {
    const telegramId = syntheticTelegramId();
    const amountMmk = 15000;
    const { user } = await seedCustomer(telegramId, 0);
    const topUp = await seedPendingMmpay(user.id, amountMmk);

    const res = await webhook({
      orderId: topUp.reference,
      amount: amountMmk,
      currency: "MMK",
      status: "SUCCESS",
      transactionRefId: "TX-INTEG-1",
      vendorQrRefId: "VQR-INTEG-1",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("APPROVED");

    const [row] = await getDb().select().from(topUpRequests).where(eq(topUpRequests.id, topUp.id));
    expect(row.status).toBe("COMPLETED");

    const [walletRow] = await getDb().select().from(wallets).where(eq(wallets.userId, user.id));
    expect(walletRow.balanceMmk).toBe(amountMmk);

    const ledgerRows = await getDb().select().from(walletLedger).where(eq(walletLedger.walletId, walletRow.id));
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0].amountMmk).toBe(amountMmk);
  });

  it("is idempotent — a duplicate SUCCESS callback never credits twice", async () => {
    const telegramId = syntheticTelegramId();
    const amountMmk = 9000;
    const { user } = await seedCustomer(telegramId, 0);
    const topUp = await seedPendingMmpay(user.id, amountMmk);

    const payload = { orderId: topUp.reference, amount: amountMmk, currency: "MMK", status: "SUCCESS" };

    const first = await webhook(payload);
    expect(first.statusCode).toBe(200);
    expect(first.json().status).toBe("APPROVED");

    const second = await webhook(payload);
    expect(second.statusCode).toBe(200);
    expect(second.json().status).toBe("ALREADY_APPROVED");

    const [walletRow] = await getDb().select().from(wallets).where(eq(wallets.userId, user.id));
    expect(walletRow.balanceMmk).toBe(amountMmk);
    const ledgerRows = await getDb().select().from(walletLedger).where(eq(walletLedger.walletId, walletRow.id));
    expect(ledgerRows).toHaveLength(1);
  });

  it("returns 404 for an unknown orderId", async () => {
    const res = await webhook({ orderId: "MMQR-DOES-NOT-EXIST", amount: 1000, status: "SUCCESS" });
    expect(res.statusCode).toBe(404);
  });
});

describe("MMPay manual-review guard (#2)", () => {
  it("blocks a human from approving a PENDING MMPay request", async () => {
    const telegramId = syntheticTelegramId();
    const amountMmk = 20000;
    const { user } = await seedCustomer(telegramId, 0);
    const topUp = await seedPendingMmpay(user.id, amountMmk);

    const res = await botReview(topUp.id, { action: "APPROVE", actorTelegramId: "900100", actorUsername: "group_admin" });
    expect(res.statusCode).toBe(409);
    expect(res.json().ok).toBe(false);

    // Nothing credited; the request is untouched and still awaiting the gateway.
    const [row] = await getDb().select().from(topUpRequests).where(eq(topUpRequests.id, topUp.id));
    expect(row.status).toBe("PENDING");
    const [walletRow] = await getDb().select().from(wallets).where(eq(wallets.userId, user.id));
    expect(walletRow.balanceMmk).toBe(0);
  });
});

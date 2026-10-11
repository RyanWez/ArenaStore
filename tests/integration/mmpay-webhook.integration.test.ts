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

/**
 * Seeds an already-EXPIRED MMPay top-up. `expiredMinutesAgo` places `expiresAt`
 * in the past so the webhook's late-SUCCESS grace window can be exercised. The
 * partial unique index only covers PENDING rows, so EXPIRED rows never collide.
 */
async function seedExpiredMmpay(userId: number, amountMmk: number, expiredMinutesAgo: number) {
  const reference = `MMQR-TEST-EXP-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const [row] = await getDb()
    .insert(topUpRequests)
    .values({
      reference,
      userId,
      amountMmk,
      paymentMethod: "MMPAY",
      status: "EXPIRED",
      mmpayOrderId: reference,
      mmpayQrString: "00020101021153031045802MM6304ABCD",
      expiresAt: new Date(Date.now() - expiredMinutesAgo * 60 * 1000),
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

  it("rejects a SUCCESS whose amount does not match the request (no credit)", async () => {
    const telegramId = syntheticTelegramId();
    const amountMmk = 10000;
    const { user } = await seedCustomer(telegramId, 0);
    const topUp = await seedPendingMmpay(user.id, amountMmk);

    const res = await webhook({
      orderId: topUp.reference,
      amount: amountMmk - 1,
      currency: "MMK",
      status: "SUCCESS",
    });

    expect(res.statusCode).toBe(400);
    const [row] = await getDb().select().from(topUpRequests).where(eq(topUpRequests.id, topUp.id));
    expect(row.status).toBe("PENDING");
    const [walletRow] = await getDb().select().from(wallets).where(eq(wallets.userId, user.id));
    expect(walletRow.balanceMmk).toBe(0);
  });

  it("rejects a SUCCESS with a non-MMK currency (no credit)", async () => {
    const telegramId = syntheticTelegramId();
    const amountMmk = 11000;
    const { user } = await seedCustomer(telegramId, 0);
    const topUp = await seedPendingMmpay(user.id, amountMmk);

    const res = await webhook({
      orderId: topUp.reference,
      amount: amountMmk,
      currency: "USD",
      status: "SUCCESS",
    });

    expect(res.statusCode).toBe(400);
    const [row] = await getDb().select().from(topUpRequests).where(eq(topUpRequests.id, topUp.id));
    expect(row.status).toBe("PENDING");
  });

  it("marks a PENDING top-up FAILED on a FAILED callback and never credits", async () => {
    const telegramId = syntheticTelegramId();
    const amountMmk = 6000;
    const { user } = await seedCustomer(telegramId, 0);
    const topUp = await seedPendingMmpay(user.id, amountMmk);

    const res = await webhook({
      orderId: topUp.reference,
      amount: amountMmk,
      currency: "MMK",
      status: "FAILED",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("FAILED");

    const [row] = await getDb().select().from(topUpRequests).where(eq(topUpRequests.id, topUp.id));
    expect(row.status).toBe("FAILED");
    const [walletRow] = await getDb().select().from(wallets).where(eq(wallets.userId, user.id));
    expect(walletRow.balanceMmk).toBe(0);
  });

  it("no longer exposes a root/bare catch-all webhook route", async () => {
    const root = await app.inject({
      method: "POST",
      url: "/",
      headers: { "content-type": "application/json" },
      payload: { orderId: "x", amount: 1, status: "SUCCESS" },
    });
    expect(root.statusCode).toBe(404);
  });
});

describe("MMPay late-SUCCESS grace window (expiry-after-payment race)", () => {
  it("credits an EXPIRED top-up when SUCCESS arrives within the grace window", async () => {
    const telegramId = syntheticTelegramId();
    const amountMmk = 7000;
    const { user } = await seedCustomer(telegramId, 0);
    // Expired 5 minutes ago — well inside the 30-minute grace window.
    const topUp = await seedExpiredMmpay(user.id, amountMmk, 5);

    const res = await webhook({
      orderId: topUp.reference,
      amount: amountMmk,
      currency: "MMK",
      status: "SUCCESS",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("APPROVED");

    const [row] = await getDb().select().from(topUpRequests).where(eq(topUpRequests.id, topUp.id));
    expect(row.status).toBe("COMPLETED");
    const [walletRow] = await getDb().select().from(wallets).where(eq(wallets.userId, user.id));
    expect(walletRow.balanceMmk).toBe(amountMmk);
  });

  it("refuses to credit a long-expired top-up (beyond grace) and leaves it for manual reconcile", async () => {
    const telegramId = syntheticTelegramId();
    const amountMmk = 8000;
    const { user } = await seedCustomer(telegramId, 0);
    // Expired 40 minutes ago — beyond the 30-minute grace window.
    const topUp = await seedExpiredMmpay(user.id, amountMmk, 40);

    const res = await webhook({
      orderId: topUp.reference,
      amount: amountMmk,
      currency: "MMK",
      status: "SUCCESS",
    });

    expect(res.statusCode).toBe(409);
    const [row] = await getDb().select().from(topUpRequests).where(eq(topUpRequests.id, topUp.id));
    expect(row.status).toBe("EXPIRED");
    const [walletRow] = await getDb().select().from(wallets).where(eq(wallets.userId, user.id));
    expect(walletRow?.balanceMmk ?? 0).toBe(0);
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

describe("MMPay single-active-order invariant (#7)", () => {
  it("rejects a second concurrent PENDING MMPay order for the same user", async () => {
    const telegramId = syntheticTelegramId();
    const { user } = await seedCustomer(telegramId, 0);
    await seedPendingMmpay(user.id, 5000);

    // The partial unique index raises a Postgres unique_violation (23505);
    // drizzle wraps it, so the code can sit on the error or its `cause`.
    const err = await seedPendingMmpay(user.id, 5000).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err?.code ?? err?.cause?.code).toBe("23505");
  });

  it("allows a fresh PENDING MMPay order once the previous one is terminal", async () => {
    const telegramId = syntheticTelegramId();
    const { user } = await seedCustomer(telegramId, 0);
    const first = await seedPendingMmpay(user.id, 5000);
    // Completing it (as the webhook would) frees the single-active slot.
    await getDb().update(topUpRequests).set({ status: "COMPLETED" }).where(eq(topUpRequests.id, first.id));
    const second = await seedPendingMmpay(user.id, 5000);
    expect(second.id).toBeTruthy();
  });
});

describe("MMPay payment endpoint internal-token guard (#1)", () => {
  it("rejects create without the internal token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/payments/mmpay/create",
      headers: { "content-type": "application/json" },
      payload: { telegramId: "123", amountMmk: 5000 },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects create with a wrong internal token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/payments/mmpay/create",
      headers: { "content-type": "application/json", "x-internal-token": "not-the-real-token" },
      payload: { telegramId: "123", amountMmk: 5000 },
    });
    expect(res.statusCode).toBe(401);
  });

  it("passes the guard with the correct token (reaches body validation)", async () => {
    // A valid token lets the request through to handler logic; an invalid body
    // then yields 400 — proving the 401 came from the guard, not the schema.
    const res = await app.inject({
      method: "POST",
      url: "/api/payments/mmpay/create",
      headers: { "content-type": "application/json", "x-internal-token": TEST_INTERNAL_API_TOKEN },
      payload: { telegramId: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects cancel without the internal token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/payments/mmpay/cancel",
      headers: { "content-type": "application/json" },
      payload: { telegramId: "123", reference: "MMQR-X" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects status without the internal token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/payments/mmpay/status/MMQR-WHATEVER",
    });
    expect(res.statusCode).toBe(401);
  });

  it("passes the status guard with the correct token (unknown reference -> 404)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/payments/mmpay/status/MMQR-DOES-NOT-EXIST",
      headers: { "x-internal-token": TEST_INTERNAL_API_TOKEN },
    });
    expect(res.statusCode).toBe(404);
  });
});

function cancel(telegramId: string, reference: string) {
  return app.inject({
    method: "POST",
    url: "/api/payments/mmpay/cancel",
    headers: { "content-type": "application/json", "x-internal-token": TEST_INTERNAL_API_TOKEN },
    payload: { telegramId, reference },
  });
}

describe("MMPay cancel never reverts a credited order (#3 status-guarded cancel)", () => {
  it("cancels a genuinely PENDING order", async () => {
    const telegramId = syntheticTelegramId();
    const { user } = await seedCustomer(telegramId, 0);
    const topUp = await seedPendingMmpay(user.id, 5000);

    const res = await cancel(telegramId, topUp.reference);
    expect(res.statusCode).toBe(200);
    expect(res.json().cancelled).toBe(true);
    expect(res.json().status).toBe("CANCELLED");

    const [row] = await getDb().select().from(topUpRequests).where(eq(topUpRequests.id, topUp.id));
    expect(row.status).toBe("CANCELLED");
    const [walletRow] = await getDb().select().from(wallets).where(eq(wallets.userId, user.id));
    expect(walletRow?.balanceMmk ?? 0).toBe(0);
  });

  it("a cancel after the order was already paid does NOT revert the credit", async () => {
    const telegramId = syntheticTelegramId();
    const amountMmk = 13000;
    const { user } = await seedCustomer(telegramId, 0);
    const topUp = await seedPendingMmpay(user.id, amountMmk);

    // Gateway credits the wallet first.
    const paid = await webhook({ orderId: topUp.reference, amount: amountMmk, currency: "MMK", status: "SUCCESS" });
    expect(paid.statusCode).toBe(200);

    // A late cancel must not overwrite the COMPLETED row or touch the balance.
    await cancel(telegramId, topUp.reference);

    const [row] = await getDb().select().from(topUpRequests).where(eq(topUpRequests.id, topUp.id));
    expect(row.status).toBe("COMPLETED");
    const [walletRow] = await getDb().select().from(wallets).where(eq(wallets.userId, user.id));
    expect(walletRow.balanceMmk).toBe(amountMmk);
  });
});

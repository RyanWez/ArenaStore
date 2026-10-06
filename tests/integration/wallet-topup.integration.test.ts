import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { InMemoryRedis } from "../setup/in-memory-redis";
import { TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD } from "../setup/test-env";

/**
 * Full-path wallet top-up integration test:
 * bot creates request + submits slip → admin reviews via the real HTTP route
 * (buildServer + fastify.inject) → wallet credit + ledger entry in Postgres.
 *
 * Redis is replaced by an in-memory fake (sessions + rate-limit store) and the
 * upstream supplier is mocked away entirely.
 */

const xproState = vi.hoisted(() => ({
  balance: "50.00",
  categories: [] as unknown[],
  products: [] as unknown[],
  createOrderImpl: async (_params: unknown) => {
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

const h = vi.hoisted(() => ({ redis: undefined as InMemoryRedis | undefined }));
vi.mock("../../apps/api/src/services/redis", () => ({
  getRedis: () => h.redis as never,
}));

import { buildServer } from "../../apps/api/src/server";
import { botOrderService } from "../../apps/bot/src/services/order.service";
import { getDb, closeDb, users, wallets, walletLedger, topUpRequests } from "@arena/db";
import { syntheticTelegramId } from "../fixtures/seed";

let app: FastifyInstance;
let adminToken: string;

async function reviewDeposit(id: number, body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `/api/admin/deposits/${id}/review`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: body,
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
  expect(adminToken).toBeTruthy();
});

afterAll(async () => {
  await app.close();
  await closeDb();
});

describe("Wallet top-up → admin review → wallet credit (full money path)", () => {
  it("credits the wallet atomically with a TOPUP_CREDIT ledger entry on approval", async () => {
    const telegramId = syntheticTelegramId();
    const amountMmk = 20000;

    // Bot side: customer creates a top-up request and submits a slip.
    const topUp = await botOrderService.createTopUpRequest({ telegramId, amountMmk });
    await botOrderService.submitTopUpSlip({
      topUpId: topUp.id,
      telegramId,
      fileId: "test-slip-file-id",
      amountMmk,
      paymentMethod: "KPAY",
    });

    const db = getDb();
    const [customer] = await db.select().from(users).where(eq(users.telegramId, telegramId));
    expect(customer).toBeTruthy();

    // Admin side: approve via the real HTTP route.
    const res = await reviewDeposit(Number(topUp.id), { action: "APPROVE" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.action).toBe("APPROVED");
    expect(body.newBalanceMmk).toBe(amountMmk);

    // Top-up request marked COMPLETED.
    const [topUpRow] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, Number(topUp.id)));
    expect(topUpRow.status).toBe("COMPLETED");
    expect(topUpRow.reviewedAt).toBeTruthy();

    // The acting admin is recorded as the reviewer (reviewed_by FK).
    const [admin] = await db.select().from(users).where(eq(users.email, TEST_ADMIN_EMAIL));
    expect(topUpRow.reviewedBy).toBe(admin.id);

    // Wallet credited exactly (integer MMK).
    const [walletRow] = await db.select().from(wallets).where(eq(wallets.userId, customer.id));
    expect(walletRow.balanceMmk).toBe(amountMmk);
    expect(walletRow.totalDepositedMmk).toBe(amountMmk);

    // Audit ledger entry referencing the top-up reference.
    const [ledger] = await db
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.walletId, walletRow.id));
    expect(ledger.type).toBe("TOPUP_CREDIT");
    expect(ledger.amountMmk).toBe(amountMmk);
    expect(ledger.referenceId).toBe(topUp.reference);
  });

  it("rejects a deposit without crediting the wallet", async () => {
    const telegramId = syntheticTelegramId();
    const amountMmk = 15000;

    const topUp = await botOrderService.createTopUpRequest({ telegramId, amountMmk });
    await botOrderService.submitTopUpSlip({
      topUpId: topUp.id,
      telegramId,
      fileId: "test-slip-file-id",
      amountMmk,
      paymentMethod: "WAVEPAY",
    });

    const db = getDb();
    const [customer] = await db.select().from(users).where(eq(users.telegramId, telegramId));

    const res = await reviewDeposit(Number(topUp.id), {
      action: "REJECT",
      rejectReason: "Slip image is unclear",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().action).toBe("REJECTED");

    const [topUpRow] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, Number(topUp.id)));
    expect(topUpRow.status).toBe("REJECTED");
    expect(topUpRow.rejectReason).toBe("Slip image is unclear");
    const [admin] = await db.select().from(users).where(eq(users.email, TEST_ADMIN_EMAIL));
    expect(topUpRow.reviewedBy).toBe(admin.id);

    const [walletRow] = await db.select().from(wallets).where(eq(wallets.userId, customer.id));
    expect(walletRow.balanceMmk).toBe(0);
    expect(walletRow.totalDepositedMmk).toBe(0);

    const ledgerRows = await db
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.walletId, walletRow.id));
    expect(ledgerRows).toHaveLength(0);
  });

  it("refuses to approve the same deposit twice", async () => {
    const telegramId = syntheticTelegramId();
    const topUp = await botOrderService.createTopUpRequest({
      telegramId,
      amountMmk: 5000,
    });

    const first = await reviewDeposit(Number(topUp.id), { action: "APPROVE" });
    expect(first.statusCode).toBe(200);

    const second = await reviewDeposit(Number(topUp.id), { action: "APPROVE" });
    expect(second.statusCode).toBe(400);
    expect(second.json().error).toContain("already COMPLETED");
  });

  it("returns 404 for an unknown deposit id", async () => {
    const res = await reviewDeposit(999999999, { action: "APPROVE" });
    expect(res.statusCode).toBe(404);
  });

  it("credits the wallet exactly once when two admins approve concurrently", async () => {
    const telegramId = syntheticTelegramId();
    const amountMmk = 7000;

    const topUp = await botOrderService.createTopUpRequest({ telegramId, amountMmk });
    await botOrderService.submitTopUpSlip({
      topUpId: topUp.id,
      telegramId,
      fileId: "race-slip-file-id",
      amountMmk,
      paymentMethod: "KPAY",
    });

    // Two review requests race for the same deposit (two admins / double-click /
    // stale 4-second poll window). The guarded status claim inside the review
    // transaction must let exactly one through.
    const [first, second] = await Promise.all([
      reviewDeposit(Number(topUp.id), { action: "APPROVE" }),
      reviewDeposit(Number(topUp.id), { action: "APPROVE" }),
    ]);

    const statusCodes = [first.statusCode, second.statusCode].sort((a, b) => a - b);
    expect(statusCodes).toEqual([200, 400]);

    const db = getDb();
    const [customer] = await db.select().from(users).where(eq(users.telegramId, telegramId));
    const [walletRow] = await db.select().from(wallets).where(eq(wallets.userId, customer.id));
    expect(walletRow.balanceMmk).toBe(amountMmk);

    const ledgerRows = await db
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.walletId, walletRow.id));
    const credits = ledgerRows.filter((r) => r.type === "TOPUP_CREDIT");
    expect(credits).toHaveLength(1);

    const [topUpRow] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, Number(topUp.id)));
    expect(topUpRow.status).toBe("COMPLETED");
  });

  it("refuses to reject a deposit that was already approved", async () => {
    const telegramId = syntheticTelegramId();
    const amountMmk = 9000;

    const topUp = await botOrderService.createTopUpRequest({ telegramId, amountMmk });
    await botOrderService.submitTopUpSlip({
      topUpId: topUp.id,
      telegramId,
      fileId: "stale-reject-slip-file-id",
      amountMmk,
      paymentMethod: "KPAY",
    });

    const approved = await reviewDeposit(Number(topUp.id), { action: "APPROVE" });
    expect(approved.statusCode).toBe(200);

    // A stale REJECT from another tab/admin must not overwrite COMPLETED
    // (which would mark a credited deposit as rejected).
    const staleReject = await reviewDeposit(Number(topUp.id), {
      action: "REJECT",
      rejectReason: "stale reject",
    });
    expect(staleReject.statusCode).toBe(400);

    const db = getDb();
    const [topUpRow] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.id, Number(topUp.id)));
    expect(topUpRow.status).toBe("COMPLETED");

    // Wallet still holds exactly the approved amount (no reversal, no double credit).
    const [customer] = await db.select().from(users).where(eq(users.telegramId, telegramId));
    const [walletRow] = await db.select().from(wallets).where(eq(wallets.userId, customer.id));
    expect(walletRow.balanceMmk).toBe(amountMmk);
  });

  it("stores both top-up requests in the DB when created in the same millisecond", async () => {
    // Freeze the clock so the reference timestamp is identical for both calls:
    // the random suffix must keep the UNIQUE reference constraint satisfied.
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_770_000_000_000);
    try {
      const a = await botOrderService.createTopUpRequest({
        telegramId: syntheticTelegramId(),
        amountMmk: 1111,
      });
      const b = await botOrderService.createTopUpRequest({
        telegramId: syntheticTelegramId(),
        amountMmk: 2222,
      });

      expect(a.reference).not.toBe(b.reference);

      // Numeric ids prove both rows were really INSERTed — with the old
      // `TOP-` + last-6-digits format the second insert hit the UNIQUE
      // constraint and silently fell back to an in-memory-only record.
      expect(Number.isNaN(Number(a.id))).toBe(false);
      expect(Number.isNaN(Number(b.id))).toBe(false);

      const db = getDb();
      const rows = await db
        .select()
        .from(topUpRequests)
        .where(eq(topUpRequests.reference, a.reference));
      expect(rows).toHaveLength(1);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("requires an admin session for deposit review", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/deposits/1/review",
      payload: { action: "APPROVE" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("cancels a pending top-up request when customer cancels in bot", async () => {
    const telegramId = syntheticTelegramId();
    const topUp = await botOrderService.createTopUpRequest({
      telegramId,
      amountMmk: 5000,
    });
    expect(topUp.status).toBe("PENDING");

    const cancelled = await botOrderService.cancelTopUpRequest(topUp.reference, telegramId);
    expect(cancelled).toBe(true);

    const db = getDb();
    const [row] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.reference, topUp.reference));
    expect(row.status).toBe("CANCELLED");

    // Second cancel on already-cancelled request returns false
    const cancelAgain = await botOrderService.cancelTopUpRequest(topUp.reference, telegramId);
    expect(cancelAgain).toBe(false);
  });

  it("auto-cancels prior unsubmitted PENDING top-ups when customer requests a new top-up", async () => {
    const telegramId = syntheticTelegramId();
    const firstTopUp = await botOrderService.createTopUpRequest({
      telegramId,
      amountMmk: 5000,
    });
    expect(firstTopUp.status).toBe("PENDING");

    const secondTopUp = await botOrderService.createTopUpRequest({
      telegramId,
      amountMmk: 10000,
    });
    expect(secondTopUp.status).toBe("PENDING");
    expect(secondTopUp.reference).not.toBe(firstTopUp.reference);

    const db = getDb();
    const [firstRow] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.reference, firstTopUp.reference));
    expect(firstRow.status).toBe("CANCELLED");

    const [secondRow] = await db
      .select()
      .from(topUpRequests)
      .where(eq(topUpRequests.reference, secondTopUp.reference));
    expect(secondRow.status).toBe("PENDING");
  });
});

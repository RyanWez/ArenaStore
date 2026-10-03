import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { InMemoryRedis } from "../setup/in-memory-redis";
import { TEST_INTERNAL_API_TOKEN } from "../setup/test-env";

/**
 * Internal bot endpoint test: POST /api/bot/deposits/:id/review — the route
 * the Telegram admin group's ✅/❌ buttons call. Verifies the shared-secret
 * auth gate and that a group review behaves exactly like a panel review
 * (wallet credit, ledger, guarded claim) while recording a TELEGRAM actor.
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
import { botOrderService } from "../../apps/bot/src/services/order.service";
import { getDb, closeDb, users, wallets, walletLedger, topUpRequests } from "@arena/db";
import { syntheticTelegramId } from "../fixtures/seed";

let app: FastifyInstance;

function botReview(id: number, body: Record<string, unknown>, token?: string) {
  return app.inject({
    method: "POST",
    url: `/api/bot/deposits/${id}/review`,
    headers: token ? { "x-internal-token": token } : {},
    payload: body,
  });
}

const actor = { action: "APPROVE", actorTelegramId: "900001", actorUsername: "group_admin" };

beforeAll(async () => {
  h.redis = new InMemoryRedis();
  app = await buildServer();
});

afterAll(async () => {
  await app.close();
  await closeDb();
});

describe("POST /api/bot/deposits/:id/review (admin group buttons)", () => {
  it("rejects requests without or with a wrong internal token", async () => {
    const telegramId = syntheticTelegramId();
    const topUp = await botOrderService.createTopUpRequest({ telegramId, amountMmk: 5000 });

    const noToken = await botReview(Number(topUp.id), actor);
    expect(noToken.statusCode).toBe(401);

    const wrongToken = await botReview(Number(topUp.id), actor, "not-the-real-token");
    expect(wrongToken.statusCode).toBe(401);

    // Auth failed → nothing was reviewed, wallet untouched.
    const [row] = await getDb().select().from(topUpRequests).where(eq(topUpRequests.id, Number(topUp.id)));
    expect(row.status).toBe("PENDING");
  });

  it("approves a deposit from the group with a TELEGRAM audit actor and credits the wallet", async () => {
    const telegramId = syntheticTelegramId();
    const amountMmk = 22000;
    const topUp = await botOrderService.createTopUpRequest({ telegramId, amountMmk });
    await botOrderService.submitTopUpSlip({
      topUpId: topUp.id,
      telegramId,
      fileId: "test-slip-file-id",
      amountMmk,
      paymentMethod: "KPAY",
    });

    const [customer] = await getDb().select().from(users).where(eq(users.telegramId, telegramId));

    const res = await botReview(Number(topUp.id), actor, TEST_INTERNAL_API_TOKEN);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.action).toBe("APPROVED");
    expect(body.newBalanceMmk).toBe(amountMmk);
    expect(body.reference).toBe(topUp.reference);
    expect(body.customerLabel).toBeTruthy();

    const [row] = await getDb().select().from(topUpRequests).where(eq(topUpRequests.id, Number(topUp.id)));
    expect(row.status).toBe("COMPLETED");
    // Group admins are not staff rows — reviewed_by stays NULL for TELEGRAM actors.
    expect(row.reviewedBy).toBeNull();
    expect(row.reviewedAt).toBeTruthy();

    const [walletRow] = await getDb().select().from(wallets).where(eq(wallets.userId, customer.id));
    expect(walletRow.balanceMmk).toBe(amountMmk);
    const [ledger] = await getDb().select().from(walletLedger).where(eq(walletLedger.walletId, walletRow.id));
    expect(ledger.type).toBe("TOPUP_CREDIT");
    expect(ledger.amountMmk).toBe(amountMmk);
  });

  it("returns 409 with current deposit details when the deposit was already reviewed", async () => {
    const telegramId = syntheticTelegramId();
    const amountMmk = 8000;
    const topUp = await botOrderService.createTopUpRequest({ telegramId, amountMmk });

    const first = await botReview(Number(topUp.id), actor, TEST_INTERNAL_API_TOKEN);
    expect(first.statusCode).toBe(200);

    const second = await botReview(Number(topUp.id), actor, TEST_INTERNAL_API_TOKEN);
    expect(second.statusCode).toBe(409);
    const body = second.json();
    expect(body.ok).toBe(false);
    expect(body.status).toBe("COMPLETED");
    expect(body.reference).toBe(topUp.reference);
    expect(body.amountMmk).toBe(amountMmk);
    expect(body.customerLabel).toBeTruthy();

    // The losing click must not credit the wallet a second time.
    const [customer] = await getDb().select().from(users).where(eq(users.telegramId, telegramId));
    const [walletRow] = await getDb().select().from(wallets).where(eq(wallets.userId, customer.id));
    expect(walletRow.balanceMmk).toBe(amountMmk);

    const ledgerRows = await getDb().select().from(walletLedger).where(eq(walletLedger.walletId, walletRow.id));
    expect(ledgerRows).toHaveLength(1);
  });

  it("rejects a deposit from the group without touching the wallet", async () => {
    const telegramId = syntheticTelegramId();
    const topUp = await botOrderService.createTopUpRequest({ telegramId, amountMmk: 12000 });

    const res = await botReview(
      Number(topUp.id),
      { action: "REJECT", actorTelegramId: "900002" },
      TEST_INTERNAL_API_TOKEN
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().action).toBe("REJECTED");

    const [customer] = await getDb().select().from(users).where(eq(users.telegramId, telegramId));
    const [row] = await getDb().select().from(topUpRequests).where(eq(topUpRequests.id, Number(topUp.id)));
    expect(row.status).toBe("REJECTED");
    expect(row.rejectReason).toBe("Deposit slip verification failed.");

    const [walletRow] = await getDb().select().from(wallets).where(eq(wallets.userId, customer.id));
    expect(walletRow.balanceMmk).toBe(0);
  });

  it("returns 404 for an unknown deposit id", async () => {
    const res = await botReview(999999999, actor, TEST_INTERNAL_API_TOKEN);
    expect(res.statusCode).toBe(404);
  });

  it("validates the body shape", async () => {
    const res = await botReview(1, { action: "DELETE", actorTelegramId: "" }, TEST_INTERNAL_API_TOKEN);
    expect(res.statusCode).toBe(400);
  });
});

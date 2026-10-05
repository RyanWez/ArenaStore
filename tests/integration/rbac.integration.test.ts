import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { InMemoryRedis } from "../setup/in-memory-redis";
import { TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD } from "../setup/test-env";

/**
 * RBAC integration test: builds the real server (with SUPERADMIN seeding +
 * default role seeding) and exercises permission enforcement end-to-end
 * through fastify.inject with real Postgres + in-memory Redis.
 *
 * Covers: staff creation via the API, permission 403s, product field
 * stripping, live matrix edits, session invalidation on role change, and the
 * audit trail.
 */

const h = vi.hoisted(() => ({ redis: undefined as InMemoryRedis | undefined }));
vi.mock("../../apps/api/src/services/redis", () => ({
  getRedis: () => h.redis as never,
}));

vi.mock("../../apps/api/src/services/xpro-client", () => ({
  xproClient: {
    getBalance: () => Promise.resolve({ ok: true, balance: "50.00", balanceUsd: "50.00", balanceUsdCents: 5000, currency: "USD" }),
    getCategories: () => Promise.resolve([]),
    getProducts: () => Promise.resolve({ products: [], total: 0 }),
    createOrder: () => Promise.reject(new Error("not mocked")),
    getHealth: () => Promise.resolve({ ok: true, online: true, latencyMs: 10, service: "mock-xpro", version: "test", time: 0 }),
    getProduct: () => Promise.reject(new Error("not mocked")),
    getOrder: () => Promise.reject(new Error("not mocked")),
    getUsage: () => Promise.reject(new Error("not mocked")),
  },
  digitalcoreClient: {
    getBalance: () => Promise.resolve({ ok: true, balance: "0.00", balanceUsd: "0.00", balanceUsdCents: 0 }),
    getHealth: () => Promise.resolve({ online: true, latencyMs: 15 }),
    listProducts: () => Promise.resolve([]),
    getProduct: () => Promise.resolve(null),
    createOrder: () => Promise.reject(new Error("not mocked")),
  },
  XProApiError: class XProApiError extends Error {},
  XProProduct: class XProProduct {},
  XProCategory: class XProCategory {},
  XProCreateOrderResponse: class XProCreateOrderResponse {},
}));

import { buildServer } from "../../apps/api/src/server";
import { getDb, closeDb, users, roles, products, productSupplierSnapshots } from "@arena/db";

let app: FastifyInstance;
let adminToken: string;
let staffToken: string;
let staffUserId: number;
let supportRoleId: number;

async function api(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  token: string,
  payload?: Record<string, unknown>
) {
  return app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${token}` },
    ...(payload ? { payload } : {}),
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

  // The boot seed must have promoted/created a SUPERADMIN for ADMIN_EMAIL.
  const me = await api("GET", "/api/admin/auth/me", adminToken);
  expect(me.json().permissions.length).toBeGreaterThan(0);
  expect(me.json().role.isSuperadmin).toBe(true);

  const db = getDb();
  const [supportRole] = await db.select().from(roles).where(eq(roles.key, "SUPPORT"));
  expect(supportRole).toBeTruthy();
  supportRoleId = supportRole.id;

  // Seed one product so field stripping can be verified.
  const [product] = await db
    .insert(products)
    .values({
      supplier: "XPRO",
      upstreamProductId: "9001",
      nameMmk: "RBAC Test Product",
      retailPriceMmk: 6300,
      isActive: true,
    })
    .returning();
  await db.insert(productSupplierSnapshots).values({
    productId: product.id,
    supplier: "XPRO",
    upstreamProductId: "9001",
    rawName: "RBAC Test Product",
    supplierPriceUsd: "0.99",
    supplierStock: 10,
    inStock: true,
  });
});

afterAll(async () => {
  await app.close();
  await closeDb();
});

describe("RBAC end-to-end", () => {
  it("creates a staff user with the SUPPORT role via the API", async () => {
    const res = await api("POST", "/api/admin/staff", adminToken, {
      firstName: "Htet",
      lastName: "Myat",
      email: "htet.myat@arena-store.test",
      username: "htetmyat",
      password: "TempPass2026!",
      roleId: supportRoleId,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.staff.roleName).toBe("Support");
    expect(body.staff.mustChangePassword).toBe(true);
    staffUserId = body.staff.id;

    const login = await app.inject({
      method: "POST",
      url: "/api/admin/auth/login",
      payload: { email: "htet.myat@arena-store.test", password: "TempPass2026!" },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().mustChangePassword).toBe(true);
    staffToken = login.json().token;
  });

  it("allows SUPPORT to view orders but blocks money and management endpoints", async () => {
    const orders = await api("GET", "/api/admin/orders", staffToken);
    expect(orders.statusCode).toBe(200);

    const review = await api("POST", "/api/admin/deposits/1/review", staffToken, { action: "APPROVE" });
    expect(review.statusCode).toBe(403);

    const adjust = await api("POST", "/api/admin/customers/1/adjust-balance", staffToken, {
      action: "CREDIT",
      amountMmk: 1000,
      notes: "nope",
    });
    expect(adjust.statusCode).toBe(403);

    const settings = await api("GET", "/api/admin/settings", staffToken);
    expect(settings.statusCode).toBe(403);

    const staffList = await api("GET", "/api/admin/staff", staffToken);
    expect(staffList.statusCode).toBe(403);

    const audit = await api("GET", "/api/admin/audit", staffToken);
    expect(audit.statusCode).toBe(403);
  });

  it("strips USD cost and margin fields from product responses for SUPPORT", async () => {
    const staffView = await api("GET", "/api/admin/products", staffToken);
    expect(staffView.statusCode).toBe(200);
    const staffProduct = staffView.json().products[0];
    expect(staffProduct).toBeTruthy();
    expect(staffProduct).not.toHaveProperty("supplierPriceUsd");
    expect(staffProduct).not.toHaveProperty("marginPct");
    expect(staffView.json().walletBalanceUsd).toBeNull();

    const adminView = await api("GET", "/api/admin/products", adminToken);
    const adminProduct = adminView.json().products[0];
    expect(adminProduct.supplierPriceUsd).toBe("0.99");
    expect(typeof adminProduct.marginPct).toBe("number");
    expect(adminView.json().walletBalanceUsd).toBe("50.00");
  });

  it("applies role permission edits immediately without re-login", async () => {
    // Grant payments.view + review to SUPPORT live.
    const put = await api("PUT", `/api/admin/roles/${supportRoleId}`, adminToken, {
      permissions: ["overview.view", "products.view", "orders.view", "orders.resend", "payments.view", "customers.view", "payments.review"],
    });
    expect(put.statusCode).toBe(200);

    // SUPPORT can now read deposits (permission granted), but the review route
    // runs past authorization — 404 means "no such deposit", not 403.
    const list = await api("GET", "/api/admin/deposits", staffToken);
    expect(list.statusCode).toBe(200);
    const review = await api("POST", "/api/admin/deposits/999999/review", staffToken, { action: "APPROVE" });
    expect(review.statusCode).toBe(404);

    // Settings were not granted → still blocked.
    const settings = await api("GET", "/api/admin/settings", staffToken);
    expect(settings.statusCode).toBe(403);
  });

  it("invalidates a staff member's sessions when their role changes", async () => {
    const patch = await api("PATCH", `/api/admin/staff/${staffUserId}`, adminToken, {
      roleId: supportRoleId,
    });
    expect(patch.statusCode).toBe(200);

    const after = await api("GET", "/api/admin/orders", staffToken);
    expect(after.statusCode).toBe(401);
  });

  it("records role and staff changes in the audit log", async () => {
    const res = await api("GET", "/api/admin/audit?limit=200", adminToken);
    expect(res.statusCode).toBe(200);
    const actions = res.json().entries.map((e: { action: string }) => e.action);
    expect(actions).toContain("STAFF_CREATE");
    expect(actions).toContain("ROLE_UPDATE");
    expect(actions).toContain("STAFF_UPDATE");
  });

  it("rejects unknown permission keys when editing a role", async () => {
    const res = await api("PUT", `/api/admin/roles/${supportRoleId}`, adminToken, {
      permissions: ["orders.view", "made.up.permission"],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("made.up.permission");
  });
});

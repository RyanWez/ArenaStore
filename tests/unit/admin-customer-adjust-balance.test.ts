import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { adminRoutes } from "../../apps/api/src/routes/admin";

const h = vi.hoisted(() => {
  const notifyBalanceAdjusted = vi.fn();
  const rows: Record<string, any[]> = {};
  const updates: Array<{ table: string; patch: any }> = [];
  const inserts: Array<{ table: string; values: any }> = [];
  let tableNames: Map<unknown, string> | null = null;

  const nameOf = (table: unknown): string => {
    const name = tableNames?.get(table);
    if (!name) throw new Error("Mock DB: unknown table object " + String(table));
    return name;
  };

  const reset = (seed: Record<string, any[]> = {}) => {
    for (const key of Object.keys(rows)) delete rows[key];
    Object.assign(rows, seed);
    updates.length = 0;
    inserts.length = 0;
    notifyBalanceAdjusted.mockReset();
  };

  const evaluateMockSql = (sqlObj: any, row: any): any => {
    if (!sqlObj || typeof sqlObj !== "object" || !Array.isArray(sqlObj.queryChunks)) {
      return sqlObj;
    }
    let exprStr = "";
    for (const chunk of sqlObj.queryChunks) {
      if (typeof chunk === "string") {
        exprStr += chunk;
      } else if (chunk?.value !== undefined && typeof chunk.value === "string") {
        exprStr += chunk.value;
      } else if (Array.isArray(chunk?.value)) {
        exprStr += chunk.value.join("");
      } else if (chunk?.name) {
        const colName = chunk.name;
        const camelName = colName.replace(/_([a-z])/g, (_: any, c: string) => c.toUpperCase());
        const val = row[camelName] ?? row[colName] ?? 0;
        exprStr += String(val);
      } else if (chunk?.value !== undefined) {
        exprStr += String(chunk.value);
      } else {
        exprStr += String(chunk);
      }
    }
    const sanitized = exprStr.replace(/GREATEST/gi, "Math.max").replace(/LEAST/gi, "Math.min");
    try {
      return Function(`"use strict"; return (${sanitized});`)();
    } catch {
      return sqlObj;
    }
  };

  const db = {
    transaction: async (cb: any) => cb(db),
    select: (selection?: Record<string, unknown>) => ({
      from: (table: unknown) => {
        const name = nameOf(table);
        const snapshot = () => (rows[name] ?? []).map((r) => ({ ...r }));
        const builder: any = {
          where: () => builder,
          orderBy: () => builder,
          limit: () => builder,
          offset: () => builder,
          then: (resolve: any, reject: any) => Promise.resolve(snapshot()).then(resolve, reject),
        };
        return builder;
      },
    }),
    insert: (table: unknown) => ({
      values: (values: any) => {
        const name = nameOf(table);
        const thenable: any = {
          returning: async () => {
            const row = { ...values, id: (rows[name]?.length ?? 0) + 1 };
            inserts.push({ table: name, values: { ...values } });
            (rows[name] ??= []).push(row);
            return [{ ...row }];
          },
          then: (resolve: any, reject: any) =>
            Promise.resolve()
              .then(() => {
                inserts.push({ table: name, values: { ...values } });
                (rows[name] ??= []).push({ ...values });
              })
              .then(() => resolve(undefined), reject),
        };
        return thenable;
      },
    }),
    update: (table: unknown) => ({
      set: (patch: any) => {
        const name = nameOf(table);
        return {
          where: (condition?: any) => {
            const matchedRows = rows[name] ?? [];
            const resolvedPatch = { ...patch };

            // Check if gte condition fails for DEBIT
            if (name === "wallets" && matchedRows.length > 0) {
              const row = matchedRows[0];
              const resolvedBal = evaluateMockSql(patch.balanceMmk, row);
              if (typeof resolvedBal === "number" && resolvedBal < 0) {
                // Conditional WHERE balance_mmk >= amountMmk rejects row
                return {
                  returning: async () => [],
                  then: (resolve: any, reject: any) => Promise.resolve([]).then(resolve, reject),
                };
              }
            }

            for (const row of matchedRows) {
              for (const [k, v] of Object.entries(patch)) {
                resolvedPatch[k] = evaluateMockSql(v, row);
              }
              Object.assign(row, resolvedPatch);
            }
            updates.push({ table: name, patch: resolvedPatch });
            const returned = matchedRows.map((r: any) => ({ ...r }));
            return {
              returning: async () => returned,
              then: (resolve: any, reject: any) => Promise.resolve(returned).then(resolve, reject),
            };
          },
        };
      },
    }),
  };

  return {
    db,
    rows,
    updates,
    inserts,
    reset,
    setTableNames: (map: Map<unknown, string>) => {
      tableNames = map;
    },
    notifyBalanceAdjusted,
  };
});

vi.mock("../../packages/db/src/index.ts", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const tableNames = new Map<unknown, string>();
  for (const [name, value] of Object.entries(actual)) {
    if (value && typeof value === "object") tableNames.set(value, name);
  }
  h.setTableNames(tableNames);
  return { ...actual, getDb: () => h.db };
});

vi.mock("../../apps/api/src/services/telegram-notifier", () => ({
  notifyBalanceAdjusted: h.notifyBalanceAdjusted,
  notifyTopUpApproved: vi.fn(),
  notifyTopUpRejected: vi.fn(),
  notifyOrderRefunded: vi.fn(),
  notifyOrderCredentialsResent: vi.fn(),
  sendTelegramMessage: vi.fn(),
}));

type RouteHandler = (request: any, reply: any) => Promise<any>;

const REPLY = Symbol("mock-reply");

function makeReply() {
  const reply: any = {
    statusCode: 200,
    payload: undefined,
    [REPLY]: true,
    status(code: number) {
      reply.statusCode = code;
      return reply;
    },
    code(code: number) {
      reply.statusCode = code;
      return reply;
    },
    send(payload: unknown) {
      reply.payload = payload;
      return reply;
    },
  };
  return reply;
}

async function callRoute(method: "GET" | "POST", url: string, id: string, body?: unknown) {
  const handlers = (globalThis as any).__adminRouteHandlersBalance as Map<string, RouteHandler>;
  const handler = handlers.get(`${method} ${url}`);
  if (!handler) throw new Error(`Route not registered: ${method} ${url}`);
  const request = { params: { id }, body, log: { error: () => {} } };
  const result = await handler(request, makeReply());
  if (result && typeof result === "object" && result[REPLY]) {
    return { status: result.statusCode as number, body: result.payload };
  }
  return { status: 200, body: result };
}

const ADJUST_URL = "/api/admin/customers/:id/adjust-balance";
const CUSTOMER_DETAIL_URL = "/api/admin/customers/:id";

const testUser = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  telegramId: "123456789",
  username: "tester",
  displayName: "Test Customer",
  role: "CUSTOMER",
  status: "ACTIVE",
};

const testWallet = {
  id: 1,
  userId: testUser.id,
  balanceMmk: 5000,
  totalDepositedMmk: 10000,
  totalSpentMmk: 5000,
};

describe("Admin Adjust Balance Route", () => {
  beforeAll(async () => {
    const handlers = new Map<string, RouteHandler>();
    const register = (method: string) => (...args: any[]) => {
      handlers.set(`${method} ${args[0]}`, args[args.length - 1]);
    };
    const server = {
      get: register("GET"),
      post: register("POST"),
      put: register("PUT"),
      delete: register("DELETE"),
    } as any;
    await adminRoutes(server);
    (globalThis as any).__adminRouteHandlersBalance = handlers;
  });

  beforeEach(() => {
    h.reset({
      users: [{ ...testUser }],
      wallets: [{ ...testWallet }],
      walletLedger: [],
    });
  });

  it("credits customer balance atomically and creates ledger entry", async () => {
    h.notifyBalanceAdjusted.mockResolvedValueOnce(true);

    const res = await callRoute("POST", ADJUST_URL, testUser.id, {
      action: "CREDIT",
      amountMmk: 3000,
      notes: "Promo bonus",
      notifyTelegram: true,
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      action: "CREDIT",
      amountMmk: 3000,
      newBalanceMmk: 8000,
    });

    const walletUpdate = h.updates.find((u) => u.table === "wallets");
    expect(walletUpdate?.patch).toMatchObject({
      balanceMmk: 8000,
      totalDepositedMmk: 13000,
    });

    const ledgerInsert = h.inserts.find((i) => i.table === "walletLedger");
    expect(ledgerInsert?.values).toMatchObject({
      walletId: 1,
      amountMmk: 3000,
      type: "ADMIN_ADJUSTMENT",
      notes: "Promo bonus",
    });

    expect(h.notifyBalanceAdjusted).toHaveBeenCalledWith({
      telegramId: "123456789",
      action: "CREDIT",
      amountMmk: 3000,
      newBalanceMmk: 8000,
      notes: "Promo bonus",
    });
  });

  it("debits customer balance atomically when funds are sufficient", async () => {
    h.notifyBalanceAdjusted.mockResolvedValueOnce(true);

    const res = await callRoute("POST", ADJUST_URL, testUser.id, {
      action: "DEBIT",
      amountMmk: 2000,
      notes: "Manual adjustment for chargeback",
      notifyTelegram: true,
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      action: "DEBIT",
      amountMmk: 2000,
      newBalanceMmk: 3000,
    });

    const walletUpdate = h.updates.find((u) => u.table === "wallets");
    expect(walletUpdate?.patch.balanceMmk).toBe(3000);

    const ledgerInsert = h.inserts.find((i) => i.table === "walletLedger");
    expect(ledgerInsert?.values).toMatchObject({
      walletId: 1,
      amountMmk: -2000,
      type: "ADMIN_ADJUSTMENT",
    });
  });

  it("rejects debit with 400 when customer has insufficient balance", async () => {
    const res = await callRoute("POST", ADJUST_URL, testUser.id, {
      action: "DEBIT",
      amountMmk: 10000,
      notes: "Attempt to overdraw",
    });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toContain("Cannot debit 10,000 MMK");
    expect(h.updates).toHaveLength(0);
    expect(h.inserts).toHaveLength(0);
  });

  it("creates a new wallet if user does not have one when crediting", async () => {
    h.reset({
      users: [{ ...testUser }],
      wallets: [],
      walletLedger: [],
    });

    const res = await callRoute("POST", ADJUST_URL, testUser.id, {
      action: "CREDIT",
      amountMmk: 5000,
      notes: "First deposit bonus",
      notifyTelegram: false,
    });

    expect(res.status).toBe(200);
    expect(res.body.newBalanceMmk).toBe(5000);

    const walletInsert = h.inserts.find((i) => i.table === "wallets");
    expect(walletInsert).toBeDefined();
    expect(walletInsert?.values.balanceMmk).toBe(0);
  });

  it("rebuilds ledger balanceAfterMmk backwards from the current wallet balance", async () => {
    // Mirrors the real incident: +50,000 top-up then −50,000 admin debit,
    // wallet now at 0. Rows are seeded newest-first, the order the API returns.
    h.reset({
      users: [{ ...testUser }],
      wallets: [{ ...testWallet, balanceMmk: 0 }],
      walletLedger: [
        { id: 2, walletId: 1, amountMmk: -50000, type: "ADMIN_ADJUSTMENT", notes: "Deduct" },
        { id: 1, walletId: 1, amountMmk: 50000, type: "TOPUP_CREDIT", notes: "Manual wallet credit by admin" },
      ],
    });

    const res = await callRoute("GET", CUSTOMER_DETAIL_URL, testUser.id);

    expect(res.status).toBe(200);
    expect(res.body.wallet.balanceMmk).toBe(0);
    expect(res.body.ledger).toHaveLength(2);
    // Newest row (the debit) ends at the current balance 0…
    expect(res.body.ledger[0]).toMatchObject({ amountMmk: -50000, balanceAfterMmk: 0 });
    // …and the row before it shows the money was really in the wallet: 50,000.
    expect(res.body.ledger[1]).toMatchObject({ amountMmk: 50000, balanceAfterMmk: 50000 });
  });

  it("keeps balanceAfterMmk consistent for a non-zero ending balance", async () => {
    h.reset({
      users: [{ ...testUser }],
      wallets: [{ ...testWallet, balanceMmk: 2000 }],
      walletLedger: [
        { id: 2, walletId: 1, amountMmk: -3000, type: "ORDER_DEBIT" },
        { id: 1, walletId: 1, amountMmk: 5000, type: "TOPUP_CREDIT" },
      ],
    });

    const res = await callRoute("GET", CUSTOMER_DETAIL_URL, testUser.id);

    expect(res.status).toBe(200);
    expect(res.body.ledger[0]).toMatchObject({ amountMmk: -3000, balanceAfterMmk: 2000 });
    expect(res.body.ledger[1]).toMatchObject({ amountMmk: 5000, balanceAfterMmk: 5000 });
  });

  it("returns lastActive timestamp in customer details", async () => {
    const activeDate = new Date("2026-10-08T12:00:00Z");
    h.reset({
      users: [{ ...testUser, lastActiveAt: activeDate, createdAt: new Date("2026-10-01T00:00:00Z") }],
      wallets: [{ ...testWallet }],
      walletLedger: [],
    });

    const res = await callRoute("GET", CUSTOMER_DETAIL_URL, testUser.id);

    expect(res.status).toBe(200);
    expect(res.body.customer.lastActive).toBeDefined();
    expect(new Date(res.body.customer.lastActive).toISOString()).toBe(activeDate.toISOString());
  });
});

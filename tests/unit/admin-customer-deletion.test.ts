import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { adminRoutes } from "../../apps/api/src/routes/admin";

/**
 * Customer lifecycle admin routes (soft deactivate, restore, permanent delete)
 * and the paginated customers list endpoint.
 *
 * Business rules under test (apps/api/src/routes/admin.ts):
 * - POST /api/admin/customers/:id/deactivate  — reversible soft delete with audit log
 * - POST /api/admin/customers/:id/restore     — undo a deactivation with audit log
 * - DELETE /api/admin/customers/:id           — permanent delete guarded by status + order history
 * - GET  /api/admin/customers                 — server-driven pagination envelope
 *
 * The database is replaced with an in-memory query emulator; the emulator
 * mirrors drizzle's projection by selection key, so SQL aggregate selections
 * (e.g. count(*)) resolve by their key name on seeded rows.
 */

const h = vi.hoisted(() => {
  const rows: Record<string, any[]> = {};
  const updates: Array<{ table: string; patch: any }> = [];
  const inserts: Array<{ table: string; values: any }> = [];
  const deletes: Array<{ table: string }> = [];
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
    deletes.length = 0;
  };

  const db = {
    transaction: async (fn: (tx: any) => Promise<any>) => fn(db),
    select: (selection?: Record<string, unknown>) => ({
      from: (table: unknown) => {
        const name = nameOf(table);
        // Mirror drizzle's projection: selection keys map to the table's TS
        // column fields. Keys that come from joined tables or SQL aggregates
        // resolve by their selection key on seeded rows.
        const project = (row: any) => {
          if (!selection) return { ...row };
          const out: any = {};
          for (const [key, colRef] of Object.entries(selection)) {
            let field = key;
            for (const [prop, val] of Object.entries(table as any)) {
              if (val === colRef) {
                field = prop;
                break;
              }
            }
            out[key] = row[field];
          }
          return out;
        };
        const snapshot = () => (rows[name] ?? []).map(project);
        const builder: any = {
          innerJoin: () => builder,
          leftJoin: () => builder,
          where: () => builder,
          orderBy: () => builder,
          groupBy: () => builder,
          limit: () => builder,
          offset: () => builder,
          as: () => builder,
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
            inserts.push({ table: name, values: { ...values } });
            const row = { ...values, id: (rows[name]?.length ?? 0) + 1 };
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
          where: () => {
            updates.push({ table: name, patch: { ...patch } });
            for (const row of rows[name] ?? []) Object.assign(row, patch);
            return Promise.resolve();
          },
        };
      },
    }),
    delete: (table: unknown) => ({
      where: () => {
        const name = nameOf(table);
        deletes.push({ table: name });
        rows[name] = [];
        return Promise.resolve();
      },
    }),
  };

  return { db, rows, updates, inserts, deletes, reset, setTableNames: (map: Map<unknown, string>) => { tableNames = map; } };
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
  sendTelegramMessage: vi.fn(),
  notifyTopUpApproved: vi.fn(),
  notifyTopUpRejected: vi.fn(),
  notifyOrderRefunded: vi.fn(),
  notifyOrderCredentialsResent: vi.fn(),
  notifyBalanceAdjusted: vi.fn(),
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

async function callAction(method: "POST" | "DELETE", url: string, id: string | number, body?: unknown) {
  const handlers = (globalThis as any).__customerRouteHandlers as Map<string, RouteHandler>;
  const handler = handlers.get(`${method} ${url}`);
  if (!handler) throw new Error(`Route not registered: ${method} ${url}`);
  const request = {
    params: { id: String(id) },
    body,
    query: {},
    adminUser: { userId: 42 },
    log: { error: () => {} },
  };
  const result = await handler(request, makeReply());
  if (result && typeof result === "object" && result[REPLY]) {
    return { status: result.statusCode as number, body: result.payload };
  }
  return { status: 200, body: result };
}

async function callList(query: Record<string, string> = {}) {
  const handlers = (globalThis as any).__customerRouteHandlers as Map<string, RouteHandler>;
  const handler = handlers.get("GET /api/admin/customers");
  if (!handler) throw new Error("Route not registered: GET /api/admin/customers");
  const request = { params: {}, body: undefined, query, adminUser: { userId: 42 }, log: { error: () => {} } };
  const result = await handler(request, makeReply());
  if (result && typeof result === "object" && result[REPLY]) {
    return { status: result.statusCode as number, body: result.payload };
  }
  return { status: 200, body: result };
}

const DEACTIVATE_URL = "/api/admin/customers/:id/deactivate";
const RESTORE_URL = "/api/admin/customers/:id/restore";
const DELETE_URL = "/api/admin/customers/:id";

const activeCustomer = {
  id: 7,
  telegramId: "111222333",
  username: "zawzaw",
  firstName: "Zaw",
  lastName: "Zaw",
  role: "CUSTOMER",
  status: "ACTIVE",
};

const deactivatedCustomer = {
  ...activeCustomer,
  status: "DEACTIVATED",
};

describe("Admin Customer Lifecycle Routes", () => {
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
    (globalThis as any).__customerRouteHandlers = handlers;
  });

  beforeEach(() => {
    h.reset();
  });

  describe("POST /api/admin/customers/:id/deactivate", () => {
    it("sets status DEACTIVATED and writes a CUSTOMER_DEACTIVATE audit entry", async () => {
      h.reset({ users: [{ ...activeCustomer }] });

      const res = await callAction("POST", DEACTIVATE_URL, 7, { reason: "Chargeback dispute" });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, customerId: 7, displayName: "Zaw Zaw" });

      const userUpdate = h.updates.find((u) => u.table === "users");
      expect(userUpdate?.patch.status).toBe("DEACTIVATED");

      const audit = h.inserts.find((i) => i.table === "auditLogs");
      expect(audit?.values).toMatchObject({
        actorId: 42,
        action: "CUSTOMER_DEACTIVATE",
        entityType: "USER",
        entityId: "7",
      });
      expect(audit?.values.details).toMatchObject({
        displayName: "Zaw Zaw",
        telegramId: "111222333",
        reason: "Chargeback dispute",
      });
    });

    it("returns 404 for an unknown customer", async () => {
      const res = await callAction("POST", DEACTIVATE_URL, 999);
      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
    });

    it("refuses to deactivate admin accounts", async () => {
      h.reset({ users: [{ ...activeCustomer, role: "ADMIN" }] });

      const res = await callAction("POST", DEACTIVATE_URL, 7);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/only customer accounts/i);
      expect(h.updates.find((u) => u.table === "users")).toBeUndefined();
    });

    it("is idempotent-guarded for already deactivated customers", async () => {
      h.reset({ users: [{ ...deactivatedCustomer }] });

      const res = await callAction("POST", DEACTIVATE_URL, 7);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/already deactivated/i);
    });
  });

  describe("POST /api/admin/customers/:id/restore", () => {
    it("sets status back to ACTIVE and writes a CUSTOMER_RESTORE audit entry", async () => {
      h.reset({ users: [{ ...deactivatedCustomer }] });

      const res = await callAction("POST", RESTORE_URL, 7);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, customerId: 7 });

      const userUpdate = h.updates.find((u) => u.table === "users");
      expect(userUpdate?.patch.status).toBe("ACTIVE");

      const audit = h.inserts.find((i) => i.table === "auditLogs");
      expect(audit?.values).toMatchObject({
        actorId: 42,
        action: "CUSTOMER_RESTORE",
        entityType: "USER",
        entityId: "7",
      });
    });

    it("refuses restoring an already active customer", async () => {
      h.reset({ users: [{ ...activeCustomer }] });

      const res = await callAction("POST", RESTORE_URL, 7);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/already active/i);
    });
  });

  describe("DELETE /api/admin/customers/:id", () => {
    it("blocks permanent deletion while the customer is still active", async () => {
      h.reset({ users: [{ ...activeCustomer }] });

      const res = await callAction("DELETE", DELETE_URL, 7);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/deactivate this customer first/i);
      expect(h.deletes).toHaveLength(0);
    });

    it("blocks permanent deletion when the customer has order history", async () => {
      h.reset({
        users: [{ ...deactivatedCustomer }],
        // The emulator resolves SQL aggregate selections by key name, so a
        // seeded count property represents the count(*) result.
        orders: [{ count: 3, customerId: 7 }],
      });

      const res = await callAction("DELETE", DELETE_URL, 7);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/3 orders in history/i);
      expect(h.deletes).toHaveLength(0);
    });

    it("deletes the user with an audit snapshot when no orders exist", async () => {
      h.reset({
        users: [{ ...deactivatedCustomer }],
        orders: [{ count: 0, customerId: 7 }],
        wallets: [{ id: "w1", userId: 7, balanceMmk: 1500, totalDepositedMmk: 20000 }],
        topUpRequests: [{ id: 1, userId: 7, count: 2 }, { id: 2, userId: 7, count: 2 }],
      });

      const res = await callAction("DELETE", DELETE_URL, 7);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, customerId: 7, displayName: "Zaw Zaw" });

      const audit = h.inserts.find((i) => i.table === "auditLogs");
      expect(audit?.values).toMatchObject({
        actorId: 42,
        action: "CUSTOMER_HARD_DELETE",
        entityType: "USER",
        entityId: "7",
      });
      expect(audit?.values.details).toMatchObject({
        displayName: "Zaw Zaw",
        ordersCount: 0,
        topUpsCount: 2,
        walletBalanceMmk: 1500,
        walletTotalDepositedMmk: 20000,
      });

      expect(h.deletes).toEqual([{ table: "users" }]);
    });
  });

  describe("GET /api/admin/customers", () => {
    it("returns a pagination envelope with transformed customer rows", async () => {
      // `total` seeds the count(*) aggregate (resolved by key name on the emulator)
      h.reset({ users: [{ ...activeCustomer, total: 1 }], wallets: [], orders: [] });

      const res = await callList({ page: "2", pageSize: "10" });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body).toMatchObject({
        total: 1,
        page: 2,
        pageSize: 10,
      });
      expect(res.body.stats).toMatchObject({
        totalCustomers: 0, // aggregate projections resolve empty on this emulator
      });
      expect(res.body.customers).toHaveLength(1);
      expect(res.body.customers[0]).toMatchObject({
        id: 7,
        displayName: "Zaw Zaw",
        status: "ACTIVE",
        walletBalanceMmk: 0,
        ordersCount: 0,
      });
    });

    it("falls back to @username display name when only 'Customer' is stored", async () => {
      h.reset({
        users: [{ ...activeCustomer, firstName: "Customer", lastName: null }],
      });

      const res = await callList();

      expect(res.status).toBe(200);
      expect(res.body.customers[0].displayName).toBe("@zawzaw");
    });

    it("uses 'User <telegramId>' when neither a real name nor username exists", async () => {
      h.reset({
        users: [{ ...activeCustomer, firstName: "", lastName: null, username: null }],
      });

      const res = await callList();

      expect(res.status).toBe(200);
      expect(res.body.customers[0].displayName).toBe("User 111222333");
    });
  });
});

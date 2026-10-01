import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { adminRoutes } from "../../apps/api/src/routes/admin";

/**
 * Admin order action routes (refund to wallet, re-send credentials).
 *
 * Business rules under test (apps/api/src/routes/admin.ts):
 * - POST /api/admin/orders/:id/refund  — wallet credit, ledger entry, REFUNDED state, Telegram notice
 * - POST /api/admin/orders/:id/resend  — decrypted credentials re-delivery over Telegram
 *
 * All upstream/external effects are mocked: the database is replaced with an
 * in-memory query emulator and Telegram notification calls are recorded, never sent.
 */

const h = vi.hoisted(() => {
  const notifyOrderRefunded = vi.fn();
  const notifyOrderCredentialsResent = vi.fn();
  const notifyTopUpApproved = vi.fn();
  const notifyTopUpRejected = vi.fn();
  const sendTelegramMessage = vi.fn();
  const encryptPayload = vi.fn();
  const decryptPayload = vi.fn();

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
    notifyOrderRefunded.mockReset();
    notifyOrderCredentialsResent.mockReset();
    decryptPayload.mockReset();
  };

  const db = {
    select: (selection?: Record<string, unknown>) => ({
      from: (table: unknown) => {
        const name = nameOf(table);
        // Mirror drizzle's projection: selection keys map to the table's TS
        // column fields (e.g. productName -> productNameSnapshot). Keys that
        // come from joined tables resolve by their selection key on seeded rows.
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
    notifyOrderRefunded,
    notifyOrderCredentialsResent,
    notifyTopUpApproved,
    notifyTopUpRejected,
    sendTelegramMessage,
    encryptPayload,
    decryptPayload,
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
  sendTelegramMessage: h.sendTelegramMessage,
  notifyTopUpApproved: h.notifyTopUpApproved,
  notifyTopUpRejected: h.notifyTopUpRejected,
  notifyOrderRefunded: h.notifyOrderRefunded,
  notifyOrderCredentialsResent: h.notifyOrderCredentialsResent,
}));

vi.mock("../../apps/api/src/services/encryption", () => ({
  encryptPayload: h.encryptPayload,
  decryptPayload: h.decryptPayload,
}));

type RouteHandler = (request: any, reply: any) => Promise<any>;

const REPLY = Symbol("mock-reply");

function makeReply() {
  const reply: any = {
    statusCode: 200,
    payload: undefined,
    [REPLY]: true,
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
  const handlers = (globalThis as any).__adminRouteHandlers as Map<string, RouteHandler>;
  const handler = handlers.get(`${method} ${url}`);
  if (!handler) throw new Error(`Route not registered: ${method} ${url}`);
  const request = { params: { id }, body, log: { error: () => {} } };
  const result = await handler(request, makeReply());
  if (result && typeof result === "object" && result[REPLY]) {
    return { status: result.statusCode as number, body: result.payload };
  }
  return { status: 200, body: result };
}

const REFUND_URL = "/api/admin/orders/:id/refund";
const RESEND_URL = "/api/admin/orders/:id/resend";

const baseOrder = {
  id: "9f1c3e2a-1111-4222-8333-444455556666",
  publicOrderNo: "ARN-2026-90001",
  status: "DELIVERED",
  totalAmountMmk: 7800,
  customerId: "user-1",
  customerTelegramId: "111222333",
  customerName: "Zaw Zaw",
};

const baseWallet = {
  id: "wallet-1",
  userId: "user-1",
  balanceMmk: 2000,
  totalDepositedMmk: 10000,
  totalSpentMmk: 9000,
};

describe("Admin Order Action Routes", () => {
  beforeAll(async () => {
    const handlers = new Map<string, RouteHandler>();
    const register = (method: string) => (...args: any[]) => {
      handlers.set(`${method} ${args[0]}`, args[args.length - 1]);
    };
    const server = {
      get: register("GET"),
      post: register("POST"),
      put: register("PUT"),
    } as any;
    await adminRoutes(server);
    (globalThis as any).__adminRouteHandlers = handlers;
  });

  beforeEach(() => {
    h.reset({
      orders: [{ ...baseOrder }],
      wallets: [{ ...baseWallet }],
    });
  });

  describe("POST /api/admin/orders/:id/refund", () => {
    it("credits the wallet, writes a REFUND_CREDIT ledger entry, marks the order REFUNDED and notifies the customer", async () => {
      const res = await callRoute("POST", REFUND_URL, baseOrder.publicOrderNo, {
        reason: "Duplicate payment",
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        ok: true,
        publicOrderNo: "ARN-2026-90001",
        refundedAmountMmk: 7800,
        newBalanceMmk: 9800,
        customerName: "Zaw Zaw",
      });

      const walletUpdate = h.updates.find((u) => u.table === "wallets");
      expect(walletUpdate?.patch).toMatchObject({
        balanceMmk: 9800,
        totalSpentMmk: 1200,
      });

      const orderUpdate = h.updates.find((u) => u.table === "orders");
      expect(orderUpdate?.patch.status).toBe("REFUNDED");

      const ledger = h.inserts.find((i) => i.table === "walletLedger");
      expect(ledger?.values).toMatchObject({
        walletId: "wallet-1",
        amountMmk: 7800,
        type: "REFUND_CREDIT",
        referenceId: "ARN-2026-90001",
        notes: "Refund for ARN-2026-90001: Duplicate payment",
      });

      expect(h.notifyOrderRefunded).toHaveBeenCalledTimes(1);
      expect(h.notifyOrderRefunded).toHaveBeenCalledWith({
        telegramId: "111222333",
        publicOrderNo: "ARN-2026-90001",
        amountMmk: 7800,
        newBalanceMmk: 9800,
        reason: "Duplicate payment",
      });
    });

    it("accepts a UUID order id as well as a public order number", async () => {
      const res = await callRoute("POST", REFUND_URL, baseOrder.id, { reason: "Test" });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it("floors totalSpentMmk at zero when the refund exceeds the customer's total spend", async () => {
      h.reset({
        orders: [{ ...baseOrder }],
        wallets: [{ ...baseWallet, totalSpentMmk: 5000 }],
      });

      const res = await callRoute("POST", REFUND_URL, baseOrder.publicOrderNo, { reason: "Test" });

      expect(res.status).toBe(200);
      const walletUpdate = h.updates.find((u) => u.table === "wallets");
      expect(walletUpdate?.patch.totalSpentMmk).toBe(0);
      expect(walletUpdate?.patch.balanceMmk).toBe(9800);
    });

    it("creates a wallet with zero balance first when the customer has none", async () => {
      h.reset({ orders: [{ ...baseOrder }], wallets: [] });

      const res = await callRoute("POST", REFUND_URL, baseOrder.publicOrderNo, { reason: "Test" });

      expect(res.status).toBe(200);
      expect(res.body.newBalanceMmk).toBe(7800);

      const walletInsert = h.inserts.find((i) => i.table === "wallets");
      expect(walletInsert?.values).toMatchObject({
        userId: "user-1",
        balanceMmk: 0,
        totalDepositedMmk: 0,
        totalSpentMmk: 0,
      });

      const walletUpdate = h.updates.find((u) => u.table === "wallets");
      expect(walletUpdate?.patch.balanceMmk).toBe(7800);
    });

    it("returns 404 when the order does not exist", async () => {
      h.reset({ orders: [], wallets: [{ ...baseWallet }] });

      const res = await callRoute("POST", REFUND_URL, "ARN-2026-40404", { reason: "Test" });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ ok: false, error: "Order not found" });
      expect(h.updates).toHaveLength(0);
      expect(h.notifyOrderRefunded).not.toHaveBeenCalled();
    });

    it("rejects a second refund with 400 (idempotency guard)", async () => {
      h.reset({
        orders: [{ ...baseOrder, status: "REFUNDED" }],
        wallets: [{ ...baseWallet }],
      });

      const res = await callRoute("POST", REFUND_URL, baseOrder.publicOrderNo, { reason: "Test" });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ ok: false, error: "This order has already been refunded" });
      expect(h.updates).toHaveLength(0);
      expect(h.inserts).toHaveLength(0);
      expect(h.notifyOrderRefunded).not.toHaveBeenCalled();
    });

    it("still refunds when the customer has no linked Telegram account, skipping the notification", async () => {
      h.reset({
        orders: [{ ...baseOrder, customerTelegramId: null }],
        wallets: [{ ...baseWallet }],
      });

      const res = await callRoute("POST", REFUND_URL, baseOrder.publicOrderNo, { reason: "Test" });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(h.updates.find((u) => u.table === "orders")?.patch.status).toBe("REFUNDED");
      expect(h.notifyOrderRefunded).not.toHaveBeenCalled();
    });

    it("falls back to the default support reason when the body is omitted", async () => {
      const res = await callRoute("POST", REFUND_URL, baseOrder.publicOrderNo);

      expect(res.status).toBe(200);
      expect(h.notifyOrderRefunded).toHaveBeenCalledWith(
        expect.objectContaining({ reason: "Admin Customer Support Refund" })
      );
      const ledger = h.inserts.find((i) => i.table === "walletLedger");
      expect(ledger?.values.notes).toBe("Refund for ARN-2026-90001: Admin Customer Support Refund");
    });
  });

  describe("POST /api/admin/orders/:id/resend", () => {
    beforeEach(() => {
      h.reset({
        orders: [{ ...baseOrder }],
        orderItems: [{ orderId: baseOrder.id, productNameSnapshot: "Gemini AI 18 MONTH" }],
        orderDeliveries: [{ orderId: baseOrder.id, encryptedPayload: "enc-payload-blob" }],
      });
    });

    it("sends decrypted credentials to the customer and confirms success", async () => {
      h.decryptPayload.mockReturnValueOnce({
        username: "buyer@example.test",
        password: "Secret12345!",
      });
      h.notifyOrderCredentialsResent.mockResolvedValueOnce(true);

      const res = await callRoute("POST", RESEND_URL, baseOrder.publicOrderNo);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ok: true,
        message: "Credentials for ARN-2026-90001 successfully re-sent to customer on Telegram!",
      });

      expect(h.decryptPayload).toHaveBeenCalledWith("enc-payload-blob");
      expect(h.notifyOrderCredentialsResent).toHaveBeenCalledTimes(1);
      expect(h.notifyOrderCredentialsResent).toHaveBeenCalledWith({
        telegramId: "111222333",
        publicOrderNo: "ARN-2026-90001",
        productName: "Gemini AI 18 MONTH",
        credentialsText: JSON.stringify(
          { username: "buyer@example.test", password: "Secret12345!" },
          null,
          2
        ),
      });
    });

    it("uses 'Direct Delivery' when the order has no stored delivery record", async () => {
      h.reset({
        orders: [{ ...baseOrder }],
        orderItems: [{ orderId: baseOrder.id, productNameSnapshot: "Gemini AI 18 MONTH" }],
        orderDeliveries: [],
      });
      h.notifyOrderCredentialsResent.mockResolvedValueOnce(true);

      const res = await callRoute("POST", RESEND_URL, baseOrder.publicOrderNo);

      expect(res.status).toBe(200);
      expect(h.notifyOrderCredentialsResent).toHaveBeenCalledWith(
        expect.objectContaining({ credentialsText: "Direct Delivery" })
      );
    });

    it("falls back to the raw stored payload when decryption fails", async () => {
      h.decryptPayload.mockImplementationOnce(() => {
        throw new Error("bad key");
      });
      h.notifyOrderCredentialsResent.mockResolvedValueOnce(true);

      const res = await callRoute("POST", RESEND_URL, baseOrder.publicOrderNo);

      expect(res.status).toBe(200);
      expect(h.notifyOrderCredentialsResent).toHaveBeenCalledWith(
        expect.objectContaining({ credentialsText: "enc-payload-blob" })
      );
    });

    it("defaults the product name when the order has no items", async () => {
      h.reset({
        orders: [{ ...baseOrder }],
        orderItems: [],
        orderDeliveries: [],
      });
      h.notifyOrderCredentialsResent.mockResolvedValueOnce(true);

      const res = await callRoute("POST", RESEND_URL, baseOrder.publicOrderNo);

      expect(res.status).toBe(200);
      expect(h.notifyOrderCredentialsResent).toHaveBeenCalledWith(
        expect.objectContaining({ productName: "Digital Product" })
      );
    });

    it("returns 404 when the order does not exist", async () => {
      h.reset({ orders: [] });

      const res = await callRoute("POST", RESEND_URL, "ARN-2026-40404");

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ ok: false, error: "Order not found" });
      expect(h.notifyOrderCredentialsResent).not.toHaveBeenCalled();
    });

    it("returns 400 when the customer has no linked Telegram ID", async () => {
      h.reset({
        orders: [{ ...baseOrder, customerTelegramId: null }],
        orderItems: [],
        orderDeliveries: [],
      });

      const res = await callRoute("POST", RESEND_URL, baseOrder.publicOrderNo);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        ok: false,
        error: "Customer does not have a linked Telegram ID",
      });
      expect(h.notifyOrderCredentialsResent).not.toHaveBeenCalled();
    });

    it("returns 502 when the Telegram delivery fails", async () => {
      h.notifyOrderCredentialsResent.mockResolvedValueOnce(false);

      const res = await callRoute("POST", RESEND_URL, baseOrder.publicOrderNo);

      expect(res.status).toBe(502);
      expect(res.body).toEqual({
        ok: false,
        error: "Failed to send Telegram message to customer",
      });
    });
  });
});

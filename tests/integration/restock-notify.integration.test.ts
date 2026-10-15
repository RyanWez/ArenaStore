import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { makeUpstreamCategory, makeUpstreamProduct } from "../mocks/upstream";

/**
 * Restock broadcast integration test: runs the real sync → sellable-stock →
 * edge-detection → Telegram fan-out chain against real Postgres, verifying
 * that an upstream 0 -> positive stock transition produces "Restocked!"
 * messages for active customers only.
 */

const xproState = vi.hoisted(() => ({
  balance: "50.00",
  categories: [] as unknown[],
  products: [] as unknown[],
}));

vi.mock("../../apps/api/src/services/xpro-client", () => ({
  xproClient: {
    getBalance: () => Promise.resolve({ ok: true, balance: xproState.balance, balanceUsd: xproState.balance, balanceUsdCents: 5000, currency: "USD" }),
    getCategories: () => Promise.resolve(xproState.categories),
    getProducts: () => Promise.resolve({ products: xproState.products, total: xproState.products.length }),
    createOrder: () => Promise.reject(new Error("not mocked")),
    getHealth: () => Promise.resolve({ ok: true, online: true, latencyMs: 10, service: "mock-xpro", version: "test", time: 0 }),
    getProduct: () => Promise.reject(new Error("not mocked")),
    getOrder: () => Promise.reject(new Error("not mocked")),
    getUsage: () => Promise.reject(new Error("not mocked")),
  },
  digitalcoreClient: {
    getBalance: () => Promise.resolve({ ok: true, balance: "100.00", balanceUsd: "100.00", balanceUsdCents: 10000 }),
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

import { config } from "../../apps/api/src/config";
import { catalogService } from "../../apps/api/src/services/catalog.service";
import { restockNotifier } from "../../apps/api/src/services/restock-notifier";
import { getDb, closeDb, users, products } from "@arena/db";

const CATEGORY_ID = 601;
const PRODUCT_ID = 7001;

const CUSTOMER_TG = "700100";
const ADMIN_TG = "700200";
const SUSPENDED_TG = "700300";

function restockFetchMock(): any {
  const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }));
  globalThis.fetch = fetchMock as any;
  return fetchMock;
}

function sentMessages(fetchMock: any): Array<{ chatId: string; text: string; replyMarkup?: any }> {
  return fetchMock.mock.calls.map(([, init]: any[]) => {
    const body = JSON.parse(init.body);
    return { chatId: String(body.chat_id), text: String(body.text), replyMarkup: body.reply_markup };
  });
}

beforeAll(async () => {
  // The API config normally carries the production token; tests get an empty
  // one from test-env. RestockNotifier skips the broadcast entirely without
  // a token, so point it at a fake one for the duration of this file.
  (config as any).TELEGRAM_BOT_TOKEN = "test-token";
  (config as any).TELEGRAM_BOT_USERNAME = "arena_test_bot";

  xproState.categories = [makeUpstreamCategory({ id: CATEGORY_ID })];
  xproState.products = [makeUpstreamProduct({ productId: PRODUCT_ID, stock: 0, inStock: false })];
  await catalogService.syncFullCatalog(4500);

  const db = getDb();
  await db.insert(users).values([
    { telegramId: CUSTOMER_TG, firstName: "Customer One", role: "CUSTOMER", status: "ACTIVE" },
    { telegramId: ADMIN_TG, firstName: "Admin One", role: "ADMIN", status: "ACTIVE" },
    { telegramId: SUSPENDED_TG, firstName: "Suspended One", role: "CUSTOMER", status: "SUSPENDED" },
    { firstName: "No Telegram", role: "CUSTOMER", status: "ACTIVE" },
  ]);
});

afterAll(async () => {
  await closeDb();
});

describe("Restock broadcast (sync -> 0->positive edge -> customer fan-out)", () => {
  it("notifies active customers when a synced product comes back in stock", async () => {
    const fetchMock = restockFetchMock();

    // Tick 1: product out of stock — silent baseline pass.
    await catalogService.syncFullCatalog(4500);
    const baseline = await restockNotifier.detectAndNotify();
    expect(baseline).toEqual({ restocked: 0, notified: false });
    expect(sentMessages(fetchMock)).toHaveLength(0);

    // Tick 2: the supplier restocked the product upstream.
    xproState.products = [makeUpstreamProduct({ productId: PRODUCT_ID, stock: 5, inStock: true })];
    await catalogService.syncFullCatalog(4500);
    const result = await restockNotifier.detectAndNotify();
    expect(result).toEqual({ restocked: 1, notified: true });

    const messages = sentMessages(fetchMock);
    const customerMsg = messages.find((m) => m.chatId === CUSTOMER_TG);
    expect(customerMsg).toBeTruthy();
    expect(customerMsg!.text).toContain("Restocked!");
    expect(customerMsg!.text).toContain("Gemini AI 18 MONTH");
    expect(customerMsg!.text).toContain("In Stock</b>");
    expect(customerMsg!.text).not.toContain("?start=");
    expect(customerMsg!.replyMarkup?.inline_keyboard[0][0]?.url).toContain("?start=buy_");
    // Every active customer gets their own message; staff, suspended users,
    // and users without a telegram id never do.
    expect(messages.some((m) => m.chatId === ADMIN_TG)).toBe(false);
    expect(messages.some((m) => m.chatId === SUSPENDED_TG)).toBe(false);

    // Tick 3: stock unchanged — no duplicate broadcast.
    await catalogService.syncFullCatalog(4500);
    await restockNotifier.detectAndNotify();
    expect(sentMessages(fetchMock)).toHaveLength(messages.length);
  });

  it("notifies when an admin re-activates a paused product (paused = out of stock)", async () => {
    const fetchMock = restockFetchMock();
    const db = getDb();
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.upstreamProductId, String(PRODUCT_ID)));
    expect(product).toBeTruthy();

    // Pause the product (the admin toggle writes isActive=false): it leaves
    // the buyable set — pausing itself must NOT announce anything.
    await db.update(products).set({ isActive: false }).where(eq(products.id, product.id));
    await catalogService.syncFullCatalog(4500);
    const paused = await restockNotifier.detectAndNotify();
    expect(paused).toEqual({ restocked: 0, notified: false });
    expect(sentMessages(fetchMock)).toHaveLength(0);

    // Re-activate (Paused -> Active toggle): same supplier stock, but the
    // product is buyable again — this is a real restock edge for customers.
    await db.update(products).set({ isActive: true }).where(eq(products.id, product.id));
    const result = await restockNotifier.detectAndNotify();
    expect(result).toEqual({ restocked: 1, notified: true });

    const messages = sentMessages(fetchMock);
    expect(messages.some((m) => m.chatId === CUSTOMER_TG)).toBe(true);
    expect(messages.some((m) => m.chatId === ADMIN_TG)).toBe(false);
    expect(messages.some((m) => m.chatId === SUSPENDED_TG)).toBe(false);

    // A subsequent tick with no change stays silent.
    await catalogService.syncFullCatalog(4500);
    await restockNotifier.detectAndNotify();
    expect(sentMessages(fetchMock)).toHaveLength(messages.length);
  });
});

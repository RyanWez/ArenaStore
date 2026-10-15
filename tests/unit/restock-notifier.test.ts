import { describe, it, expect, vi, beforeEach } from "vitest";
import { RestockNotifier } from "../../apps/api/src/services/restock-notifier";
import { catalogService } from "../../apps/api/src/services/catalog.service";
import * as telegramNotifier from "../../apps/api/src/services/telegram-notifier";
import { BOT_EMOJIS } from "@arena/shared";
import { getDb } from "@arena/db";

vi.mock("../../apps/api/src/services/catalog.service", () => ({
  catalogService: {
    getSellableProducts: vi.fn(),
  },
}));

vi.mock("../../apps/api/src/config", () => ({
  config: {
    TELEGRAM_BOT_TOKEN: "test-token",
    TELEGRAM_BOT_USERNAME: "arena_test_bot",
  },
}));

vi.mock("@arena/db", () => ({
  getDb: vi.fn(),
  appSettings: { key: "key" },
  users: { telegramId: "telegram_id", status: "status", role: "role" },
  products: { id: "id", nameMmk: "name_mmk", retailPriceMmk: "retail_price_mmk" },
  categories: { name: "name", iconEmoji: "icon_emoji" },
}));

/** Minimal Drizzle-like query chain resolving to a queued result array. */
function makeDb(result: any[]) {
  const chain: any = {
    select: () => chain,
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

/** Per-call results consumed in the order detectAndNotify touches the DB:
 * [toggle row(s)], then [product details rows], then [recipient rows]. */
function queueDbResults(...queues: any[][]) {
  let call = 0;
  vi.mocked(getDb).mockImplementation(() => makeDb(queues[Math.min(call++, queues.length - 1)] ?? []));
}

function product(overrides: Partial<any> = {}) {
  return {
    id: 1,
    supplier: "XPRO",
    upstreamProductId: "101",
    categoryId: null,
    nameMmk: "Coursera Plus – 12 Months",
    descriptionMmk: null,
    rawName: "Coursera Plus – 12 Months",
    rawDescription: null,
    retailPriceMmk: 13450,
    formattedRetailPriceMmk: "13,450 MMK",
    supplierPriceUsd: "2.00",
    supplierStock: 10,
    sellableStock: 0,
    deliveryType: "CREDENTIALS",
    isActive: true,
    isWalletConstrained: false,
    syncedAt: new Date(),
    ...overrides,
  } as any;
}

describe("RestockNotifier (0 -> positive sellable stock edge)", () => {
  let notifier: RestockNotifier;
  let sendSpy: any;

  const CUSTOMERS = [{ telegramId: "111" }, { telegramId: "222" }];

  beforeEach(() => {
    vi.clearAllMocks();
    notifier = new RestockNotifier();
    sendSpy = vi.spyOn(telegramNotifier, "sendTelegramMessageFloodAware").mockResolvedValue(true);
    // Default: toggle unset (enabled), no restocked products, full recipient list.
    vi.mocked(catalogService.getSellableProducts).mockResolvedValue([]);
    queueDbResults([], [], CUSTOMERS);
  });

  it("establishes a silent baseline on the first pass (no broadcast on boot)", async () => {
    vi.mocked(catalogService.getSellableProducts).mockResolvedValue([product({ sellableStock: 5 })]);

    const res = await notifier.detectAndNotify();

    expect(res).toEqual({ restocked: 0, notified: false });
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("broadcasts to every active customer when stock returns 0 -> positive", async () => {
    vi.mocked(catalogService.getSellableProducts).mockResolvedValueOnce([product({ sellableStock: 0 })]);
    await notifier.detectAndNotify(); // baseline

    vi.mocked(catalogService.getSellableProducts).mockResolvedValueOnce([product({ sellableStock: 3 })]);
    queueDbResults([], [{ id: 1, nameMmk: "Coursera Plus – 12 Months", retailPriceMmk: 13450, categoryName: "Coursera Plus", categoryIconEmoji: null }], CUSTOMERS);
    const res = await notifier.detectAndNotify();

    expect(res).toEqual({ restocked: 1, notified: true });
    expect(sendSpy).toHaveBeenCalledTimes(2);
    expect(sendSpy).toHaveBeenCalledWith("111", expect.stringContaining("Restocked!"), expect.anything());
    expect(sendSpy).toHaveBeenCalledWith("222", expect.stringContaining("Restocked!"), expect.anything());
  });

  it("stays silent while stock stays positive, and notifies again only after another 0 -> positive edge", async () => {
    vi.mocked(catalogService.getSellableProducts).mockResolvedValueOnce([product({ sellableStock: 4 })]);
    await notifier.detectAndNotify(); // baseline (positive)

    vi.mocked(catalogService.getSellableProducts).mockResolvedValueOnce([product({ sellableStock: 2 })]);
    const stillPositive = await notifier.detectAndNotify();
    expect(stillPositive).toEqual({ restocked: 0, notified: false });
    expect(sendSpy).not.toHaveBeenCalled();

    vi.mocked(catalogService.getSellableProducts).mockResolvedValueOnce([product({ sellableStock: 0 })]);
    await notifier.detectAndNotify(); // sold out
    vi.mocked(catalogService.getSellableProducts).mockResolvedValueOnce([product({ sellableStock: 1 })]);
    queueDbResults([], [{ id: 1, nameMmk: "Coursera Plus – 12 Months", retailPriceMmk: 13450, categoryName: null, categoryIconEmoji: null }], CUSTOMERS);
    const res = await notifier.detectAndNotify();
    expect(res).toEqual({ restocked: 1, notified: true });
    expect(sendSpy).toHaveBeenCalledTimes(CUSTOMERS.length);
  });

  it("treats a newly appeared product as baseline, not a restock", async () => {
    vi.mocked(catalogService.getSellableProducts).mockResolvedValueOnce([product({ sellableStock: 0 })]);
    await notifier.detectAndNotify(); // baseline with product #1 out of stock

    // Product #2 appears in stock for the first time.
    vi.mocked(catalogService.getSellableProducts).mockResolvedValueOnce([
      product({ sellableStock: 0 }),
      product({ id: 2, sellableStock: 7 }),
    ]);
    const res = await notifier.detectAndNotify();

    expect(res).toEqual({ restocked: 0, notified: false });
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("announces an admin re-activation: paused product counts as out of stock", async () => {
    vi.mocked(catalogService.getSellableProducts).mockResolvedValueOnce([product({ sellableStock: 5 })]);
    await notifier.detectAndNotify(); // baseline: active with stock

    // Admin pauses the product — not buyable, tracked as zero.
    vi.mocked(catalogService.getSellableProducts).mockResolvedValueOnce([
      product({ sellableStock: 5, isActive: false }),
    ]);
    const paused = await notifier.detectAndNotify();
    expect(paused).toEqual({ restocked: 0, notified: false });
    expect(sendSpy).not.toHaveBeenCalled();

    // Admin re-activates with the same stock — this IS a buyable edge.
    vi.mocked(catalogService.getSellableProducts).mockResolvedValueOnce([product({ sellableStock: 5 })]);
    queueDbResults([], [{ id: 1, nameMmk: "Plan", retailPriceMmk: 1000, categoryName: null, categoryIconEmoji: null }], CUSTOMERS);
    const res = await notifier.detectAndNotify();

    expect(res).toEqual({ restocked: 1, notified: true });
    expect(sendSpy).toHaveBeenCalledTimes(CUSTOMERS.length);
  });

  it("does not announce a re-activation while the product still has no sellable stock", async () => {
    vi.mocked(catalogService.getSellableProducts).mockResolvedValueOnce([product({ sellableStock: 0 })]);
    await notifier.detectAndNotify(); // baseline

    vi.mocked(catalogService.getSellableProducts).mockResolvedValueOnce([
      product({ sellableStock: 0, isActive: false }),
    ]);
    await notifier.detectAndNotify(); // paused, no stock

    vi.mocked(catalogService.getSellableProducts).mockResolvedValueOnce([product({ sellableStock: 0 })]);
    const res = await notifier.detectAndNotify(); // re-activated but still unbuyable

    expect(res).toEqual({ restocked: 0, notified: false });
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("skips the broadcast while disabled but keeps tracking state (no replay storm on re-enable)", async () => {
    vi.mocked(catalogService.getSellableProducts).mockResolvedValueOnce([product({ sellableStock: 0 })]);
    await notifier.detectAndNotify(); // baseline

    // Disabled while the product restocks.
    vi.mocked(catalogService.getSellableProducts).mockResolvedValueOnce([product({ sellableStock: 9 })]);
    queueDbResults([{ value: "false" }], CUSTOMERS);
    const disabledRes = await notifier.detectAndNotify();
    expect(disabledRes).toEqual({ restocked: 1, notified: false });
    expect(sendSpy).not.toHaveBeenCalled();

    // Re-enabled next tick, stock unchanged — must stay silent.
    vi.mocked(catalogService.getSellableProducts).mockResolvedValueOnce([product({ sellableStock: 9 })]);
    queueDbResults([{ value: "true" }], CUSTOMERS);
    const reEnabledRes = await notifier.detectAndNotify();
    expect(reEnabledRes).toEqual({ restocked: 0, notified: false });
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("drops recipients without a telegram id (staff/status filtering lives in the SQL query)", async () => {
    vi.mocked(catalogService.getSellableProducts).mockResolvedValueOnce([product({ sellableStock: 0 })]);
    await notifier.detectAndNotify(); // baseline

    queueDbResults(
      [],
      [{ id: 1, nameMmk: "Plan", retailPriceMmk: 1000, categoryName: null, categoryIconEmoji: null }],
      [
        { telegramId: null },
        { telegramId: "333" },
      ]
    );
    vi.mocked(catalogService.getSellableProducts).mockResolvedValueOnce([product({ sellableStock: 2 })]);
    await notifier.detectAndNotify();

    // The fake db has no WHERE clause, so the role/status exclusion is
    // exercised by the integration test against a real database; here we
    // assert the service never sends to a null telegram id.
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith("333", expect.any(String), expect.anything());
  });

  it("builds the restock message with brand emoji and MMK price without raw link clutter", () => {
    const text = telegramNotifier.buildRestockedMessage({
      productName: "Coursera Plus – 12 Months",
      priceMmk: 13450,
      botUsername: "@arena_test_bot",
      productId: 42,
    });

    // Brand map custom emoji for Coursera
    expect(text).toContain('<tg-emoji emoji-id="6307450973606389056"');
    expect(text).toContain("Restocked!");
    expect(text).toContain("<b>Coursera Plus – 12 Months</b>");
    expect(text).not.toContain("Category:");
    expect(text).toContain(`<tg-emoji emoji-id="${BOT_EMOJIS.PRICE}"`);
    expect(text).toContain("<b>13,450 Ks</b>");
    expect(text).toContain("In Stock</b>");
    expect(text).not.toContain("href=");
  });

  it("builds the restock keyboard with deep-link buy button", () => {
    const keyboard = telegramNotifier.buildRestockedKeyboard({
      botUsername: "@arena_test_bot",
      productId: 42,
    });

    expect(keyboard).toBeDefined();
    expect(keyboard?.inline_keyboard[0][0].text).toBe("Buy Now");
    expect(keyboard?.inline_keyboard[0][0].url).toBe("https://t.me/arena_test_bot?start=buy_42");
  });

  it("escapes HTML in product names", () => {
    const text = telegramNotifier.buildRestockedMessage({
      productName: '<script>alert("x")</script> Plan',
      priceMmk: 1000,
    });

    expect(text).not.toContain("<script>");
    expect(text).toContain("&lt;script&gt;");
    expect(text).not.toContain("href=");
  });
});

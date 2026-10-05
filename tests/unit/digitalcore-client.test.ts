import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DigitalCoreClient, SupplierError } from "@arena/suppliers";

describe("DigitalCore Partner API Client", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("checks service health successfully via /api/user/me proxy", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        balance: 142.5,
        total_orders: 12,
      }),
    } as Response);

    const client = new DigitalCoreClient({
      baseUrl: "https://mock-dc.local",
      apiKey: "dc_test_key_123",
    });

    const health = await client.getHealth();
    expect(health.online).toBe(true);
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("fetches partner balance with Api-Key header", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        balance: 142.5,
        total_orders: "15",
      }),
    } as Response);

    global.fetch = mockFetch;

    const client = new DigitalCoreClient({
      baseUrl: "https://mock-dc.local",
      apiKey: "dc_test_key_123",
    });

    const res = await client.getBalance();

    expect(res.balanceUsd).toBe("142.50");
    expect(res.balanceUsdCents).toBe(14250);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://mock-dc.local/api/user/me",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Api-Key": "dc_test_key_123",
        }),
      })
    );
  });

  it("lists products and normalizes wholesale tiers", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: "gemini_pro_18_months",
          name: "🤖 Gemini AI 18 MONTH",
          stock: 45,
          price: 0.55,
          tiers: [
            { minQty: 1, maxQty: 9, price: 0.55 },
            { minQty: 10, maxQty: null, price: 0.45 },
          ],
        },
      ],
    } as Response);

    const client = new DigitalCoreClient({
      baseUrl: "https://mock-dc.local",
      apiKey: "dc_test_key_123",
    });

    const products = await client.listProducts();

    expect(products.length).toBe(1);
    expect(products[0].supplier).toBe("DIGITALCORE");
    expect(products[0].upstreamProductId).toBe("gemini_pro_18_months");
    expect(products[0].basePriceUsdCents).toBe(55);
    expect(products[0].basePriceUsd).toBe("0.55");
    expect(products[0].deliveryTypeHint).toBe("LINK");
    expect(products[0].pricingTiers).toEqual([
      { minQty: 1, maxQty: 9, price: 0.55 },
      { minQty: 10, maxQty: null, price: 0.45 },
    ]);
  });

  it("creates an order via POST /api/user/buy with count and id", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        order_id: "dc_ord_9988",
        view_url: "https://digitalcore.top/view/dc_ord_9988",
        total_amount: 1.1,
        quantity: 2,
        items: ["https://gemini.google.com/claim/abc1", "https://gemini.google.com/claim/abc2"],
      }),
    } as Response);

    global.fetch = mockFetch;

    const client = new DigitalCoreClient({
      baseUrl: "https://mock-dc.local",
      apiKey: "dc_test_key_123",
    });

    const result = await client.createOrder({
      upstreamProductId: "gemini_pro_18_months",
      quantity: 2,
    });

    expect(result.upstreamOrderId).toBe("dc_ord_9988");
    expect(result.items.length).toBe(2);
    expect(result.totalUsdCents).toBe(110);
    expect(result.viewUrl).toBe("https://digitalcore.top/view/dc_ord_9988");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://mock-dc.local/api/user/buy",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          id: "gemini_pro_18_months",
          count: 2,
        }),
      })
    );
  });

  it("throws MAX_COUNT_EXCEEDED when quantity exceeds 1,000", async () => {
    const client = new DigitalCoreClient({ baseUrl: "https://mock-dc.local" });

    await expect(
      client.createOrder({
        upstreamProductId: "bulk_item",
        quantity: 1001,
      })
    ).rejects.toThrowError(SupplierError);
  });

  it("throws AMBIGUOUS_TIMEOUT on buy request abort without retrying", async () => {
    const mockFetch = vi.fn().mockImplementation(() => {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      return Promise.reject(err);
    });

    global.fetch = mockFetch;

    const client = new DigitalCoreClient({
      baseUrl: "https://mock-dc.local",
      apiKey: "dc_test_key_123",
      timeoutMs: 50,
    });

    try {
      await client.createOrder({
        upstreamProductId: "gemini_pro_18_months",
        quantity: 1,
      });
      expect.unreachable("Should have thrown");
    } catch (err: any) {
      expect(err).toBeInstanceOf(SupplierError);
      expect(err.code).toBe("AMBIGUOUS_TIMEOUT");
    }

    // Verify buy was called only ONCE (zero retries)
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("maps upstream error response to canonical SupplierError", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        success: false,
        msg: "OUT_OF_STOCK",
      }),
    } as Response);

    const client = new DigitalCoreClient({ baseUrl: "https://mock-dc.local" });

    try {
      await client.createOrder({
        upstreamProductId: "out_of_stock_item",
        quantity: 1,
      });
      expect.unreachable("Should have thrown");
    } catch (err: any) {
      expect(err).toBeInstanceOf(SupplierError);
      expect(err.code).toBe("OUT_OF_STOCK");
    }
  });

  it("retries on 500 status before succeeding for read requests", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ msg: "Internal error" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ balance: 50, total_orders: 1 }),
      } as Response);

    global.fetch = mockFetch;

    const client = new DigitalCoreClient({
      baseUrl: "https://mock-dc.local",
      apiKey: "dc_test_key_123",
    });

    const res = await client.getBalance();
    expect(res.balanceUsd).toBe("50.00");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("verifies response total_amount matches pricing tiers and throws on mismatch", async () => {
    // Upstream returns 2.00 but expected is 0.55 * 2 = 1.10
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        order_id: "dc_mismatch_1",
        quantity: 2,
        total_amount: 2.0, // Mismatch!
        items: ["key1", "key2"],
      }),
    } as Response);

    const client = new DigitalCoreClient({
      baseUrl: "https://mock-dc.local",
      apiKey: "dc_test_key_123",
    });

    await expect(
      client.createOrder({
        upstreamProductId: "gemini_pro",
        quantity: 2,
        pricingTiers: [{ minQty: 1, maxQty: null, price: "0.55" }],
      })
    ).rejects.toThrowError(/Total amount mismatch/);
  });

  it("accepts valid response total_amount when matching pricing tiers", async () => {
    // Upstream returns 1.10 which matches 0.55 * 2
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        order_id: "dc_match_1",
        quantity: 2,
        total_amount: 1.1,
        items: ["key1", "key2"],
      }),
    } as Response);

    const client = new DigitalCoreClient({
      baseUrl: "https://mock-dc.local",
      apiKey: "dc_test_key_123",
    });

    const res = await client.createOrder({
      upstreamProductId: "gemini_pro",
      quantity: 2,
      pricingTiers: [{ minQty: 1, maxQty: null, price: "0.55" }],
    });

    expect(res.upstreamOrderId).toBe("dc_match_1");
    expect(res.totalUsdCents).toBe(110);
  });
});

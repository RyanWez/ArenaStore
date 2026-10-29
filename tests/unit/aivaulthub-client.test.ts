import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AIVaultHubClient, SupplierError } from "@arena/suppliers";

describe("AIVaultHub Reseller API Client", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("checks service health successfully via /me endpoint", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        chat_id: 8777968077,
        balance: 50.0,
        currency: "USD",
      }),
    } as Response);

    const client = new AIVaultHubClient({
      baseUrl: "https://mock-avh.local/api/v1",
      apiKey: "avh_test_key_123",
    });

    const health = await client.getHealth();
    expect(health.online).toBe(true);
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("fetches partner balance with X-API-Key header", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        chat_id: 8777968077,
        balance: 142.5,
        currency: "USD",
      }),
    } as Response);

    global.fetch = mockFetch;

    const client = new AIVaultHubClient({
      baseUrl: "https://mock-avh.local/api/v1",
      apiKey: "avh_test_key_123",
    });

    const res = await client.getBalance();

    expect(res.balanceUsd).toBe("142.50");
    expect(res.balanceUsdCents).toBe(14250);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://mock-avh.local/api/v1/me",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-API-Key": "avh_test_key_123",
        }),
      })
    );
  });

  it("lists products and normalizes pricing tiers", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        currency: "USD",
        rate: "1 USD = 100 INR (fixed)",
        products: [
          {
            service_id: "service_gemini_static",
            name: "Gemini Pro 18M (Static Domain)",
            stock: 828,
            custom_pricing: false,
            pricing_tiers: [
              { min: 1, max: 10000, price: 0.75 },
            ],
            bulk_discounts: [],
          },
          {
            service_id: "service_1790855554",
            name: "ChatGPT Plus UPI",
            stock: 0,
            pricing_tiers: [
              { min: 1, max: 3, price: 5.0 },
              { min: 4, max: 7, price: 4.6 },
              { min: 7, max: 1000, price: 4.2 },
            ],
          },
        ],
      }),
    } as Response);

    const client = new AIVaultHubClient({
      baseUrl: "https://mock-avh.local/api/v1",
      apiKey: "avh_test_key_123",
    });

    const products = await client.listProducts();
    expect(products.length).toBe(2);

    expect(products[0].supplier).toBe("AIVAULTHUB");
    expect(products[0].upstreamProductId).toBe("service_gemini_static");
    expect(products[0].name).toBe("Gemini Pro 18M (Static Domain)");
    expect(products[0].stock).toBe(828);
    expect(products[0].inStock).toBe(true);
    expect(products[0].basePriceUsd).toBe("0.75");
    expect(products[0].basePriceUsdCents).toBe(75);
    expect(products[0].pricingTiers).toEqual([
      { minQty: 1, maxQty: 10000, price: 0.75 },
    ]);

    expect(products[1].inStock).toBe(false);
    expect(products[1].basePriceUsd).toBe("5.00");
    expect(products[1].pricingTiers?.length).toBe(3);
  });

  it("creates order with external_order_id and accept_normal_price", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        success: true,
        order_id: "API89XKZ42",
        external_order_id: "ARENA-EXT-12345",
        service_id: "service_gemini_static",
        quantity: 1,
        total_cost: 0.75,
        new_balance: 49.25,
        currency: "USD",
        products: ["https://gemini.google.com/redeem?token=xyz123"],
      }),
    } as Response);

    global.fetch = mockFetch;

    const client = new AIVaultHubClient({
      baseUrl: "https://mock-avh.local/api/v1",
      apiKey: "avh_test_key_123",
    });

    const result = await client.createOrder({
      upstreamProductId: "service_gemini_static",
      quantity: 1,
      externalOrderId: "ARENA-EXT-12345",
    });

    expect(result.upstreamOrderId).toBe("API89XKZ42");
    expect(result.quantity).toBe(1);
    expect(result.totalUsdCents).toBe(75);
    expect(result.items).toEqual(["https://gemini.google.com/redeem?token=xyz123"]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://mock-avh.local/api/v1/order",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          service_id: "service_gemini_static",
          quantity: 1,
          external_order_id: "ARENA-EXT-12345",
          accept_normal_price: true,
        }),
      })
    );
  });

  it("handles 402 Insufficient Balance error properly", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      json: async () => ({
        error: "Insufficient balance",
      }),
    } as Response);

    const client = new AIVaultHubClient({
      baseUrl: "https://mock-avh.local/api/v1",
      apiKey: "avh_test_key_123",
    });

    await expect(
      client.createOrder({
        upstreamProductId: "service_gemini_static",
        quantity: 1,
        externalOrderId: "ARENA-EXT-12345",
      })
    ).rejects.toThrowError(SupplierError);

    try {
      await client.createOrder({
        upstreamProductId: "service_gemini_static",
        quantity: 1,
        externalOrderId: "ARENA-EXT-12345",
      });
    } catch (err: any) {
      expect(err.code).toBe("INSUFFICIENT_BALANCE");
      expect(err.statusCode).toBe(402);
    }
  });

  it("handles 401 Auth Failed error properly", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: "invalid_api_key",
      }),
    } as Response);

    const client = new AIVaultHubClient({
      baseUrl: "https://mock-avh.local/api/v1",
      apiKey: "wrong_key",
    });

    try {
      await client.getBalance();
    } catch (err: any) {
      expect(err.code).toBe("AUTH_FAILED");
      expect(err.statusCode).toBe(401);
    }
  });

  it("fetches single order by id", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        order_id: "API89XKZ42",
        status: "delivered",
        service_id: "service_gemini_static",
        quantity: 1,
        total_cost: 0.75,
        currency: "USD",
        created_at: "2026-10-29T10:00:00Z",
        products: ["KEY-GEMINI-123"],
      }),
    } as Response);

    const client = new AIVaultHubClient({
      baseUrl: "https://mock-avh.local/api/v1",
      apiKey: "avh_test_key_123",
    });

    const order = await client.getOrder("API89XKZ42");
    expect(order).not.toBeNull();
    expect(order?.id).toBe("API89XKZ42");
    expect(order?.totalUsdCents).toBe(75);
    expect(order?.items).toEqual(["KEY-GEMINI-123"]);
  });

  it("retries on 500 status before succeeding for read and idempotent requests", async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: "internal_error" }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          chat_id: 8777968077,
          balance: 10.0,
          currency: "USD",
        }),
      } as Response;
    });

    const client = new AIVaultHubClient({
      baseUrl: "https://mock-avh.local/api/v1",
      apiKey: "avh_test_key_123",
    });

    const bal = await client.getBalance();
    expect(bal.balanceUsd).toBe("10.00");
    expect(callCount).toBe(2);
  });
});


import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { XProClient, XProApiError } from "../../apps/api/src/services/xpro-client";

describe("XPro Partner API Client", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("checks service health successfully", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        service: "xproseller-partner-api",
        version: "1.0.0",
        time: 1790766928,
      }),
    } as Response);

    const client = new XProClient({ baseUrl: "http://mock-api.local" });
    const health = await client.getHealth();

    expect(health.ok).toBe(true);
    expect(health.service).toBe("xproseller-partner-api");
  });

  it("fetches partner balance with Authorization header", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        balance: "1.00",
        currency: "USD",
        userId: 8777968077,
      }),
    } as Response);

    global.fetch = mockFetch;

    const client = new XProClient({
      baseUrl: "http://mock-api.local",
      apiKey: "sk_test_mock_key",
    });

    const res = await client.getBalance();

    expect(res.ok).toBe(true);
    expect(res.balance).toBe("1.00");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://mock-api.local/balance",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk_test_mock_key",
        }),
      })
    );
  });

  it("places an idempotent order with externalOrderId", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        order: {
          orderId: 481,
          externalOrderId: "arn-unique-12345",
          productId: 12,
          productName: "Gemini AI 18 MONTH",
          quantity: 1,
          unitPrice: 0.69,
          total: 0.69,
          currency: "USD",
          status: "COMPLETED",
        },
        delivery: {
          type: "CREDENTIALS",
          lines: ["user@gmail.com:pass123"],
        },
        balanceAfter: "0.31",
      }),
    } as Response);

    global.fetch = mockFetch;

    const client = new XProClient({
      baseUrl: "http://mock-api.local",
      apiKey: "sk_test_key",
    });

    const res = await client.createOrder({
      productId: 12,
      quantity: 1,
      externalOrderId: "arn-unique-12345",
    });

    expect(res.ok).toBe(true);
    expect(res.order.orderId).toBe(481);
    expect(res.order.externalOrderId).toBe("arn-unique-12345");
    expect(res.delivery.lines).toEqual(["user@gmail.com:pass123"]);
  });

  it("throws XProApiError with correct code on upstream error", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        ok: false,
        error: {
          code: "OUT_OF_STOCK",
          message: "Not enough stock available",
          requestId: "req_test_123",
        },
      }),
    } as Response);

    const client = new XProClient({
      baseUrl: "http://mock-api.local",
      apiKey: "sk_test_key",
    });

    await expect(
      client.createOrder({
        productId: 99,
        quantity: 10,
        externalOrderId: "arn-fail-1",
      })
    ).rejects.toThrowError(XProApiError);
  });

  it("retries on 500 error before succeeding", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ ok: false, error: { code: "SERVER_ERROR" } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, balance: "5.00", currency: "USD" }),
      } as Response);

    global.fetch = mockFetch;

    const client = new XProClient({
      baseUrl: "http://mock-api.local",
      apiKey: "sk_test_key",
    });

    const res = await client.getBalance();
    expect(res.balance).toBe("5.00");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

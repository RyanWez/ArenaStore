import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";

describe("API Rate Limiting Protection", () => {
  it("enforces strict rate limits on admin login and returns 429 after 5 failed attempts", async () => {
    const server = Fastify();

    await server.register(rateLimit, {
      global: false,
    });

    server.post(
      "/api/admin/auth/login",
      {
        config: {
          rateLimit: {
            max: 5,
            timeWindow: 1000 * 60,
            keyGenerator: (req) => `test_login_${req.ip}`,
            errorResponseBuilder: (_req, context) => ({
              ok: false,
              error: "Rate limit exceeded. Too many login attempts.",
              statusCode: 429,
              retryAfter: Math.ceil(context.ttl / 1000),
            }),
          },
        },
      },
      async () => {
        return { ok: false, error: "Invalid credentials" };
      }
    );

    // Make 5 requests (all should pass through to route handler)
    for (let i = 0; i < 5; i++) {
      const res = await server.inject({
        method: "POST",
        url: "/api/admin/auth/login",
        payload: { email: "admin@arenastore.mm", password: "wrong" },
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.ok).toBe(false);
      expect(data.error).toBe("Invalid credentials");
    }

    // 6th request must be blocked with HTTP 429 Rate limit exceeded!
    const blockedRes = await server.inject({
      method: "POST",
      url: "/api/admin/auth/login",
      payload: { email: "admin@arenastore.mm", password: "wrong" },
    });

    expect(blockedRes.statusCode).toBe(429);
    const blockedData = JSON.parse(blockedRes.body);
    expect(blockedData.ok).toBe(false);
    expect(blockedData.error).toContain("Rate limit exceeded");
    expect(blockedData.retryAfter).toBeGreaterThan(0);
  });

  it("enforces per-telegram-user rate limits on order creation", async () => {
    const server = Fastify();

    await server.register(rateLimit, {
      global: false,
    });

    server.post(
      "/api/orders",
      {
        config: {
          rateLimit: {
            max: 3,
            timeWindow: 1000 * 60,
            hook: "preValidation",
            keyGenerator: (req) => {
              const tgId = (req.body as any)?.telegramId;
              return tgId ? `order_tg_${tgId}` : `order_ip_${req.ip}`;
            },
            errorResponseBuilder: (_req, context) => ({
              ok: false,
              error: "Order rate limit exceeded. Please wait.",
              statusCode: 429,
              retryAfter: Math.ceil(context.ttl / 1000),
            }),
          },
        },
      },
      async (req) => {
        return { ok: true, orderId: "ord-test" };
      }
    );

    // User A makes 3 requests (all pass)
    for (let i = 0; i < 3; i++) {
      const res = await server.inject({
        method: "POST",
        url: "/api/orders",
        payload: { telegramId: "user_123" },
      });
      expect(res.statusCode).toBe(200);
    }

    // User A's 4th request is blocked
    const userABlocked = await server.inject({
      method: "POST",
      url: "/api/orders",
      payload: { telegramId: "user_123" },
    });
    expect(userABlocked.statusCode).toBe(429);

    // User B with a DIFFERENT telegramId is NOT blocked!
    const userBRes = await server.inject({
      method: "POST",
      url: "/api/orders",
      payload: { telegramId: "user_999" },
    });
    expect(userBRes.statusCode).toBe(200);
  });
});

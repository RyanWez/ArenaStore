import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";

describe("API Server Security Hardening", () => {
  it("trusts proxy headers to accurately identify client IP behind reverse proxies", async () => {
    const server = Fastify({ trustProxy: true });

    server.get("/test-ip", async (req) => {
      return { ip: req.ip, ips: req.ips };
    });

    const res = await server.inject({
      method: "GET",
      url: "/test-ip",
      headers: {
        "x-forwarded-for": "203.0.113.195, 10.0.0.1",
      },
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.ip).toBe("203.0.113.195");
  });

  it("isolates login rate limits per account on shared proxy IP", async () => {
    const server = Fastify({ trustProxy: true });
    await server.register(rateLimit, { global: false });

    server.post(
      "/login",
      {
        config: {
          rateLimit: {
            hook: "preHandler",
            max: 3,
            timeWindow: 60000,
            keyGenerator: (req) => {
              const rawEmail = (req.body as any)?.email;
              const identifier = rawEmail ? String(rawEmail).toLowerCase().trim() : "anon";
              return `login_${req.ip}_${identifier}`;
            },
          },
        },
      },
      async () => ({ ok: true })
    );

    // 3 failed logins for admin1@arena.com from IP 1.2.3.4
    for (let i = 0; i < 3; i++) {
      const res = await server.inject({
        method: "POST",
        url: "/login",
        headers: { "x-forwarded-for": "1.2.3.4" },
        payload: { email: "admin1@arena.com" },
      });
      expect(res.statusCode).toBe(200);
    }

    // 4th login for admin1@arena.com from same IP is rate-limited
    const blockedRes = await server.inject({
      method: "POST",
      url: "/login",
      headers: { "x-forwarded-for": "1.2.3.4" },
      payload: { email: "admin1@arena.com" },
    });
    expect(blockedRes.statusCode).toBe(429);

    // admin2@arena.com from the SAME IP is NOT locked out!
    const otherAdminRes = await server.inject({
      method: "POST",
      url: "/login",
      headers: { "x-forwarded-for": "1.2.3.4" },
      payload: { email: "admin2@arena.com" },
    });
    expect(otherAdminRes.statusCode).toBe(200);
  });

  it("restricts CORS credentials and rejects unauthorized external origins", async () => {
    const server = Fastify();
    const allowedOrigins = ["http://localhost:3000", "https://admin.arenastore.mm"];

    await server.register(cors, {
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        const isAllowed =
          allowedOrigins.includes(origin) ||
          /^https:\/\/.*\.vercel\.app$/.test(origin);

        if (isAllowed) {
          cb(null, true);
        } else {
          cb(new Error("CORS origin not allowed"), false);
        }
      },
      credentials: true,
    });

    server.get("/api/test", async () => ({ ok: true }));

    // 1. Allowed domain succeeds with Access-Control-Allow-Origin
    const allowedRes = await server.inject({
      method: "GET",
      url: "/api/test",
      headers: {
        origin: "https://admin.arenastore.mm",
      },
    });
    expect(allowedRes.statusCode).toBe(200);
    expect(allowedRes.headers["access-control-allow-origin"]).toBe("https://admin.arenastore.mm");
    expect(allowedRes.headers["access-control-allow-credentials"]).toBe("true");

    // 2. Vercel preview domain succeeds
    const vercelRes = await server.inject({
      method: "GET",
      url: "/api/test",
      headers: {
        origin: "https://arena-store-preview-abc.vercel.app",
      },
    });
    expect(vercelRes.statusCode).toBe(200);
    expect(vercelRes.headers["access-control-allow-origin"]).toBe("https://arena-store-preview-abc.vercel.app");

    // 3. Unauthorized attacker domain does NOT receive credentials/reflection
    const evilRes = await server.inject({
      method: "GET",
      url: "/api/test",
      headers: {
        origin: "https://evil-attacker.com",
      },
    });
    expect(evilRes.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

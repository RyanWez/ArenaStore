import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";

describe("API Server Security Hardening", () => {
  it("ignores fake X-Forwarded-For when trustProxy is disabled (default-secure)", async () => {
    const server = Fastify({ trustProxy: false });

    server.get("/test-ip", async (req) => {
      return { ip: req.ip };
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
    // When trustProxy is false, Fastify ignores XFF and binds to real connection remoteAddress (127.0.0.1)
    expect(data.ip).toBe("127.0.0.1");
  });

  it("resolves client IP from trusted reverse proxy (loopback, uniquelocal) and strips spoofed prefixes", async () => {
    // Fastify with 'loopback, uniquelocal' trusts private reverse proxies (Render edge proxy, Docker, etc.)
    const server = Fastify({ trustProxy: "loopback, uniquelocal" });

    server.get("/test-ip", async (req) => {
      return { ip: req.ip };
    });

    // 1. Through Render reverse proxy (10.0.0.1): client sent fake XFF "203.0.113.195", but proxy appended real client IP "198.51.100.42"
    const proxyRes = await server.inject({
      method: "GET",
      url: "/test-ip",
      remoteAddress: "10.0.0.1",
      headers: {
        "x-forwarded-for": "203.0.113.195, 198.51.100.42",
      },
    });
    expect(proxyRes.statusCode).toBe(200);
    const proxyData = JSON.parse(proxyRes.body);
    // Resolves to the real client IP, stripping the spoofed prefix
    expect(proxyData.ip).toBe("198.51.100.42");

    // 2. Direct attacker connection from public IP (198.51.100.99) trying to spoof XFF "8.8.8.8"
    const directRes = await server.inject({
      method: "GET",
      url: "/test-ip",
      remoteAddress: "198.51.100.99",
      headers: {
        "x-forwarded-for": "8.8.8.8",
      },
    });
    expect(directRes.statusCode).toBe(200);
    const directData = JSON.parse(directRes.body);
    // Fastify refuses to trust XFF from a non-private peer, binding to socket address
    expect(directData.ip).toBe("198.51.100.99");
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

  it("restricts CORS credentials and rejects arbitrary external domains including vercel.app", async () => {
    const server = Fastify();
    const allowedOrigins = ["http://localhost:3000", "https://admin.arenastore.mm"];

    await server.register(cors, {
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        const isAllowed = allowedOrigins.includes(origin);

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

    // 2. Arbitrary Vercel domain is rejected under hardened CORS policy
    const vercelRes = await server.inject({
      method: "GET",
      url: "/api/test",
      headers: {
        origin: "https://attacker.vercel.app",
      },
    });
    expect(vercelRes.headers["access-control-allow-origin"]).toBeUndefined();

    // 3. Unauthorized attacker domain is rejected
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

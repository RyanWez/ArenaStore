import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { InMemoryRedis } from "../setup/in-memory-redis";

const h = vi.hoisted(() => ({ redis: undefined as InMemoryRedis | undefined }));
vi.mock("../../apps/api/src/services/redis", () => ({
  getRedis: () => h.redis as never,
}));

import { buildServer } from "../../apps/api/src/server";
import { setCoreRedis, storeAuthService } from "@arena/core";
import { config } from "../../apps/api/src/config";

let app: FastifyInstance;

describe("Store Auth Integration Tests (/api/store/auth/*)", () => {
  beforeAll(async () => {
    h.redis = new InMemoryRedis();
    setCoreRedis(h.redis);
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /api/store/auth/ticket", () => {
    it("generates a new 4-digit challenge ticket with device metadata", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/store/auth/ticket",
        headers: {
          "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.ok).toBe(true);
      expect(body.ticketId).toMatch(/^tk_[a-f0-9]{24}$/);
      expect(body.code).toMatch(/^\d{4}$/);
      expect(body.expiresIn).toBe(300);
      expect(body.deviceSummary).toBe("Safari · iPhone");

      // Verify ticket state in Redis
      const ticket = await storeAuthService.getTicket(body.ticketId);
      expect(ticket).not.toBeNull();
      expect(ticket?.status).toBe("PENDING");
      expect(ticket?.code).toBe(body.code);
    });
  });

  describe("POST /api/store/auth/telegram-webapp", () => {
    function createSignedInitData(user: { id: number; first_name: string; username?: string }) {
      const botToken = config.TELEGRAM_BOT_TOKEN || "test-telegram-bot-token";
      const authDate = Math.floor(Date.now() / 1000).toString();
      const params = new Map([
        ["auth_date", authDate],
        ["query_id", "AAHd_webapp_query_123"],
        ["user", JSON.stringify(user)],
      ]);

      const dataCheckString = Array.from(params.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join("\n");

      const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
      const hash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

      return `auth_date=${authDate}&query_id=AAHd_webapp_query_123&user=${encodeURIComponent(
        JSON.stringify(user)
      )}&hash=${hash}`;
    }

    it("logs in instantly with valid Telegram Mini App initData and sets cookie", async () => {
      const tgUser = {
        id: 7788990011,
        first_name: "Thant",
        username: "thantzintg",
      };
      const validInitData = createSignedInitData(tgUser);

      const res = await app.inject({
        method: "POST",
        url: "/api/store/auth/telegram-webapp",
        payload: { initData: validInitData },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.ok).toBe(true);
      expect(body.token).toMatch(/^[a-f0-9]{64}$/);
      expect(body.user.telegramId).toBe("7788990011");
      expect(body.user.firstName).toBe("Thant");
      expect(body.user.username).toBe("thantzintg");

      // Verify cookie
      const setCookie = res.headers["set-cookie"] as string;
      expect(setCookie).toBeDefined();
      expect(setCookie).toContain("arena_store_session=");
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Lax");
    });

    it("rejects tampered initData with 401", async () => {
      const tgUser = { id: 1234567, first_name: "Kyaw" };
      const validInitData = createSignedInitData(tgUser);
      const tampered = validInitData.replace("1234567", "9999999");

      const res = await app.inject({
        method: "POST",
        url: "/api/store/auth/telegram-webapp",
        payload: { initData: tampered },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.payload);
      expect(body.ok).toBe(false);
      expect(body.error).toContain("Unauthorized Telegram Mini App data");
    });
  });

  describe("GET /api/store/auth/me & POST /api/store/auth/logout", () => {
    it("returns 401 when unauthenticated", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/store/auth/me",
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns profile with valid session cookie, then terminates on logout", async () => {
      // 1. Create a customer session
      const tgId = `998877${Date.now().toString().slice(-4)}`;
      const { user } = (await storeAuthService.createCustomerSession({
        id: 9999,
        telegramId: tgId,
        firstName: "Session User",
        username: "sessionuser",
        role: "CUSTOMER",
      }).then(async (token) => ({
        token,
        user: await storeAuthService.getCustomerSession(token),
      }))) as any;

      const token = await storeAuthService.createCustomerSession({
        id: 12345,
        telegramId: tgId,
        firstName: "Test Profile User",
        username: "testprofile",
        role: "CUSTOMER",
      });

      // 2. Fetch /me using cookie
      const meRes = await app.inject({
        method: "GET",
        url: "/api/store/auth/me",
        headers: {
          cookie: `arena_store_session=${token}`,
        },
      });

      expect(meRes.statusCode).toBe(200);
      const meBody = JSON.parse(meRes.payload);
      expect(meBody.ok).toBe(true);
      expect(meBody.user.telegramId).toBe(tgId);
      expect(meBody.user.firstName).toBe("Test Profile User");

      // 3. Fetch /me using Bearer header
      const bearerRes = await app.inject({
        method: "GET",
        url: "/api/store/auth/me",
        headers: {
          authorization: `Bearer ${token}`,
        },
      });
      expect(bearerRes.statusCode).toBe(200);

      // 4. Logout
      const logoutRes = await app.inject({
        method: "POST",
        url: "/api/store/auth/logout",
        headers: {
          cookie: `arena_store_session=${token}`,
        },
      });
      expect(logoutRes.statusCode).toBe(200);
      const setCookie = logoutRes.headers["set-cookie"] as string;
      expect(setCookie).toContain("Max-Age=0");

      // 5. Subsequent /me should return 401
      const meAfterLogout = await app.inject({
        method: "GET",
        url: "/api/store/auth/me",
        headers: {
          cookie: `arena_store_session=${token}`,
        },
      });
      expect(meAfterLogout.statusCode).toBe(401);
    });
  });

  describe("GET /api/store/auth/events/:ticketId (SSE Stream)", () => {
    it("immediately emits connected event and streams confirmed event upon bot matching", async () => {
      // 1. Generate challenge ticket
      const ticket = await storeAuthService.createTicket({
        ip: "127.0.0.1",
        userAgent: "Chrome",
      });

      // 2. Simulate Bot confirming the ticket after 50ms
      setTimeout(async () => {
        await storeAuthService.confirmTicket(ticket.ticketId, "88887777", {
          firstName: "SSE Confirmed User",
          username: "sseuser",
        });
      }, 50);

      // 3. Connect to SSE stream
      const res = await app.inject({
        method: "GET",
        url: `/api/store/auth/events/${ticket.ticketId}`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("text/event-stream");
      expect(res.payload).toContain("event: connected");
      expect(res.payload).toContain("event: confirmed");
      expect(res.payload).toContain("88887777");
      expect(res.payload).toContain("SSE Confirmed User");

      // Extract token from SSE confirmed event data
      const match = res.payload.match(/event: confirmed\ndata: (\{.*\})/);
      expect(match).not.toBeNull();
      const confirmedData = JSON.parse(match![1]);
      expect(confirmedData.ok).toBe(true);
      expect(confirmedData.token).toBeDefined();

      // Test exchanging confirmed token for session cookie via POST /api/store/auth/session
      const sessionRes = await app.inject({
        method: "POST",
        url: "/api/store/auth/session",
        payload: { token: confirmedData.token },
      });
      expect(sessionRes.statusCode).toBe(200);
      expect(sessionRes.headers["set-cookie"]).toBeDefined();
    });

    it("rejects malformed ticketId format with 400", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/store/auth/events/malicious-ticket-id",
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.ok).toBe(false);
      expect(body.error).toContain("Invalid ticketId format");
    });
  });

  describe("Security Hardening & Anti-Abuse", () => {
    it("prevents ticket replay attacks by refusing to reuse consumed tickets", async () => {
      // 1. Create and confirm a ticket
      const ticket = await storeAuthService.createTicket({
        ip: "127.0.0.1",
        userAgent: "Security-Tester",
      });

      await storeAuthService.confirmTicket(ticket.ticketId, "777888999", {
        firstName: "Legit Customer",
        username: "legit",
      });

      // 2. First exchange via /session succeeds
      const firstExchange = await app.inject({
        method: "POST",
        url: "/api/store/auth/session",
        payload: { ticketId: ticket.ticketId },
      });
      expect(firstExchange.statusCode).toBe(200);
      const firstBody = JSON.parse(firstExchange.payload);
      expect(firstBody.ok).toBe(true);
      expect(firstBody.token).toBeDefined();

      // 3. Second exchange attempt with the same ticketId (replay attack) MUST fail
      const replayAttempt = await app.inject({
        method: "POST",
        url: "/api/store/auth/session",
        payload: { ticketId: ticket.ticketId },
      });
      expect(replayAttempt.statusCode).toBe(400);
      const replayBody = JSON.parse(replayAttempt.payload);
      expect(replayBody.ok).toBe(false);
      expect(replayBody.error).toContain("Challenge ticket not found, expired, or not confirmed");
    });

    it("blocks suspended users from logging in with 403 ACCOUNT_SUSPENDED", async () => {
      const suspendedTgId = "999000111";

      // Create user first
      const { botOrderService } = await import("@arena/core");
      const { getDb, users } = await import("@arena/db");
      const { eq } = await import("drizzle-orm");
      const db = getDb();

      await botOrderService.getOrCreateUser({
        telegramId: suspendedTgId,
        firstName: "Bad Actor",
      });

      // Suspend user in DB
      await db.update(users).set({ status: "SUSPENDED" }).where(eq(users.telegramId, suspendedTgId));

      // Attempt to access /me with a session for this suspended user
      const suspendedToken = await storeAuthService.createCustomerSession({
        id: 9999,
        telegramId: suspendedTgId,
        firstName: "Bad Actor",
        role: "CUSTOMER",
      });

      const meRes = await app.inject({
        method: "GET",
        url: "/api/store/auth/me",
        headers: {
          authorization: `Bearer ${suspendedToken}`,
        },
      });

      expect(meRes.statusCode).toBe(403);
      const body = JSON.parse(meRes.payload);
      expect(body.ok).toBe(false);
      expect(body.code).toBe("ACCOUNT_SUSPENDED");
    });
  });
});

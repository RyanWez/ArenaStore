import { describe, it, expect, beforeEach } from "vitest";
import crypto from "node:crypto";
import {
  StoreAuthService,
  setCoreRedis,
  type MiniAppInitDataUser,
} from "../../packages/core/src/index";
import { InMemoryRedis } from "../setup/in-memory-redis";

describe("StoreAuthService Unit Tests", () => {
  let authService: StoreAuthService;
  let fakeRedis: InMemoryRedis;
  const mockBotToken = "123456789:ABCdefGHIjklMNOpqrsTUVwxyz_mock_token";

  beforeEach(() => {
    fakeRedis = new InMemoryRedis();
    setCoreRedis(fakeRedis);
    authService = new StoreAuthService();
  });

  describe("Device Summary Formatting", () => {
    it("formats common browser and operating system user agents", () => {
      const chromeWin =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
      expect(authService.formatDeviceSummary(chromeWin)).toBe("Chrome · Windows");

      const safariIphone =
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1";
      expect(authService.formatDeviceSummary(safariIphone)).toBe("Safari · iPhone");

      const firefoxLinux = "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:122.0) Gecko/20100101 Firefox/122.0";
      expect(authService.formatDeviceSummary(firefoxLinux)).toBe("Firefox · Linux");

      const edgeMac =
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";
      expect(authService.formatDeviceSummary(edgeMac)).toBe("Edge · macOS");

      expect(authService.formatDeviceSummary("")).toBe("Web Browser");
    });
  });

  describe("Challenge Ticket Lifecycle", () => {
    it("creates a 4-digit challenge ticket with 300s TTL", async () => {
      const ticket = await authService.createTicket({
        ip: "103.112.54.12",
        userAgent: "Mozilla/5.0 (X11; Linux x86_64) Firefox/122.0",
      });

      expect(ticket.ticketId).toMatch(/^tk_[a-f0-9]{24}$/);
      expect(ticket.code).toMatch(/^\d{4}$/);
      expect(parseInt(ticket.code, 10)).toBeGreaterThanOrEqual(1000);
      expect(parseInt(ticket.code, 10)).toBeLessThan(10000);
      expect(ticket.status).toBe("PENDING");
      expect(ticket.ip).toBe("103.112.54.12");
      expect(ticket.deviceSummary).toBe("Firefox · Linux");
      expect(ticket.expiresAt - ticket.createdAt).toBe(300 * 1000);

      // Verify stored in Redis
      const stored = await authService.getTicket(ticket.ticketId);
      expect(stored).not.toBeNull();
      expect(stored?.code).toBe(ticket.code);
    });

    it("confirms a pending ticket and emits notification event", async () => {
      const ticket = await authService.createTicket({
        ip: "192.168.1.1",
        userAgent: "Mozilla/5.0 (iPhone) Safari/604.1",
      });

      let eventReceived: any = null;
      authService.localEmitter.once(`ticket:${ticket.ticketId}`, (payload) => {
        eventReceived = payload;
      });

      const confirmRes = await authService.confirmTicket(ticket.ticketId, "987654321", {
        firstName: "Aung Aung",
        username: "aungaung",
      });

      expect(confirmRes.success).toBe(true);
      expect(confirmRes.ticket?.status).toBe("CONFIRMED");
      expect(confirmRes.ticket?.telegramId).toBe("987654321");
      expect(confirmRes.ticket?.firstName).toBe("Aung Aung");
      expect(confirmRes.ticket?.username).toBe("aungaung");

      // Verify event was fired
      expect(eventReceived).not.toBeNull();
      expect(eventReceived.type).toBe("CONFIRMED");
      expect(eventReceived.ticket.telegramId).toBe("987654321");

      // Attempting to confirm again should be rejected
      const secondConfirm = await authService.confirmTicket(ticket.ticketId, "987654321");
      expect(secondConfirm.success).toBe(false);
      expect(secondConfirm.reason).toBe("TICKET_CONFIRMED");
    });

    it("cancels a ticket and emits cancellation event", async () => {
      const ticket = await authService.createTicket({
        ip: "192.168.1.1",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
      });

      let eventReceived: any = null;
      authService.localEmitter.once(`ticket:${ticket.ticketId}`, (payload) => {
        eventReceived = payload;
      });

      const cancelRes = await authService.cancelTicket(ticket.ticketId, "USER_REJECTED");
      expect(cancelRes).toBe(true);

      const updated = await authService.getTicket(ticket.ticketId);
      expect(updated?.status).toBe("CANCELLED");

      expect(eventReceived).not.toBeNull();
      expect(eventReceived.type).toBe("CANCELLED");
      expect(eventReceived.reason).toBe("USER_REJECTED");
    });
  });

  describe("Telegram Mini App initData Validation", () => {
    function generateValidInitData(
      userObj: MiniAppInitDataUser,
      botToken: string,
      authDateSeconds = Math.floor(Date.now() / 1000)
    ) {
      const params = new Map<string, string>([
        ["auth_date", authDateSeconds.toString()],
        ["query_id", "AAG6z4k1AAAAALrPiTWZfX88"],
        ["user", JSON.stringify(userObj)],
      ]);

      const dataCheckString = Array.from(params.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join("\n");

      const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
      const hash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

      return `auth_date=${authDateSeconds}&query_id=AAG6z4k1AAAAALrPiTWZfX88&user=${encodeURIComponent(
        JSON.stringify(userObj)
      )}&hash=${hash}`;
    }

    it("successfully validates authentic initData and extracts user payload", () => {
      const mockUser: MiniAppInitDataUser = {
        id: 123456789,
        first_name: "Kyaw",
        last_name: "Kyaw",
        username: "kyawkyaw",
        language_code: "my",
      };

      const validInitData = generateValidInitData(mockUser, mockBotToken);
      const res = authService.validateMiniAppInitData(validInitData, mockBotToken);

      expect(res.valid).toBe(true);
      expect(res.user?.id).toBe(123456789);
      expect(res.user?.first_name).toBe("Kyaw");
      expect(res.user?.username).toBe("kyawkyaw");
    });

    it("rejects tampered initData where parameters were modified", () => {
      const mockUser: MiniAppInitDataUser = {
        id: 123456789,
        first_name: "Hacker",
      };

      const validInitData = generateValidInitData(mockUser, mockBotToken);
      // Tamper user ID in payload
      const tamperedInitData = validInitData.replace("123456789", "999999999");

      const res = authService.validateMiniAppInitData(tamperedInitData, mockBotToken);
      expect(res.valid).toBe(false);
      expect(res.reason).toBe("INVALID_SIGNATURE");
    });

    it("rejects initData signed with a different bot token", () => {
      const mockUser: MiniAppInitDataUser = {
        id: 123456789,
        first_name: "Kyaw",
      };

      const initDataFromDifferentBot = generateValidInitData(mockUser, "different_bot_token_123");
      const res = authService.validateMiniAppInitData(initDataFromDifferentBot, mockBotToken);

      expect(res.valid).toBe(false);
      expect(res.reason).toBe("INVALID_SIGNATURE");
    });

    it("rejects expired initData (> 24 hours old)", () => {
      const mockUser: MiniAppInitDataUser = {
        id: 123456789,
        first_name: "Kyaw",
      };

      const twentyFiveHoursAgo = Math.floor(Date.now() / 1000) - 25 * 3600;
      const expiredInitData = generateValidInitData(mockUser, mockBotToken, twentyFiveHoursAgo);

      const res = authService.validateMiniAppInitData(expiredInitData, mockBotToken);
      expect(res.valid).toBe(false);
      expect(res.reason).toBe("INIT_DATA_EXPIRED");
    });

    it("rejects initData missing hash", () => {
      const res = authService.validateMiniAppInitData("query_id=123&user=%7B%7D", mockBotToken);
      expect(res.valid).toBe(false);
      expect(res.reason).toBe("MISSING_HASH");
    });

    it("rejects initData with malformed hash", () => {
      const res = authService.validateMiniAppInitData("hash=not-a-valid-hex-64-chars&auth_date=12345", mockBotToken);
      expect(res.valid).toBe(false);
      expect(res.reason).toBe("MALFORMED_HASH");
    });

    it("rejects initData with future auth_date beyond clock drift", () => {
      const mockUser = { id: 12345, first_name: "Time", username: "traveler" };
      const futureDate = Math.floor(Date.now() / 1000) + 120; // 2 minutes in future
      const futureInitData = generateValidInitData(mockUser, mockBotToken, futureDate);

      const res = authService.validateMiniAppInitData(futureInitData, mockBotToken);
      expect(res.valid).toBe(false);
      expect(res.reason).toBe("FUTURE_AUTH_DATE");
    });
  });

  describe("Customer Session Management", () => {
    it("creates, retrieves, and terminates customer sessions", async () => {
      const sessionUser = {
        id: 42,
        telegramId: "876543210",
        firstName: "Thant",
        lastName: "Zin",
        username: "thantzin",
        role: "CUSTOMER",
      };

      const token = await authService.createCustomerSession(sessionUser);
      expect(token).toMatch(/^[a-f0-9]{64}$/);

      const retrieved = await authService.getCustomerSession(token);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.userId).toBe(42);
      expect(retrieved?.telegramId).toBe("876543210");
      expect(retrieved?.firstName).toBe("Thant");

      const terminated = await authService.terminateCustomerSession(token);
      expect(terminated).toBe(true);

      const afterTermination = await authService.getCustomerSession(token);
      expect(afterTermination).toBeNull();
    });

    it("enforces single-use tickets via consumeTicket to prevent replay", async () => {
      const ticket = await authService.createTicket({
        ip: "127.0.0.1",
        userAgent: "Security-Tester",
      });

      await authService.confirmTicket(ticket.ticketId, "999888777", { firstName: "Tester" });

      // First consumption succeeds
      const firstConsume = await authService.consumeTicket(ticket.ticketId);
      expect(firstConsume).toBe(true);

      // Second consumption must fail (prevent replay)
      const secondConsume = await authService.consumeTicket(ticket.ticketId);
      expect(secondConsume).toBe(false);

      const finalTicket = await authService.getTicket(ticket.ticketId);
      expect(finalTicket?.status).toBe("CONSUMED");
    });
  });
});

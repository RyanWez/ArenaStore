import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import { getCoreRedis, getSharedSubscriberRedis } from "../redis";

export const TICKET_TTL_SECONDS = 300; // 5 minutes
export const STORE_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
export const MINI_APP_MAX_AGE_SECONDS = 24 * 60 * 60; // 24 hours

export interface AuthTicket {
  ticketId: string;
  code: string; // 4-digit code e.g. "3717"
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "EXPIRED" | "CONSUMED";
  ip: string;
  userAgent: string;
  deviceSummary: string;
  telegramId?: string;
  firstName?: string;
  lastName?: string | null;
  username?: string | null;
  confirmedAt?: number;
  createdAt: number;
  expiresAt: number;
}

export interface CustomerSession {
  userId: number;
  telegramId: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  role: string;
}

export interface MiniAppInitDataUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export class StoreAuthService {
  /**
   * Local EventEmitter for zero-latency in-process event delivery and test mocking.
   */
  public readonly localEmitter = new EventEmitter();

  private pubSubInitialized = false;

  constructor() {
    this.localEmitter.setMaxListeners(1000);
  }

  /**
   * Initializes a single shared Redis subscriber that listens on pattern `arena:store_auth:events:*`
   * and routes cluster events directly to the local EventEmitter.
   * Multiplexes unlimited SSE clients onto a single Redis connection.
   */
  initPubSubListener(): void {
    if (this.pubSubInitialized) return;
    this.pubSubInitialized = true;

    try {
      const sub = getSharedSubscriberRedis();
      if (typeof sub.psubscribe === "function") {
        sub.psubscribe("arena:store_auth:events:*").catch((err: any) => {
          console.warn("[StoreAuthService] Redis psubscribe error:", err?.message || err);
        });
        sub.on("pmessage", (_pattern: string, _channel: string, message: string) => {
          try {
            const data = JSON.parse(message);
            if (data && data.ticketId) {
              this.localEmitter.emit(`ticket:${data.ticketId}`, data);
            }
          } catch (err: any) {
            console.warn("[StoreAuthService] Redis pmessage parse error:", err?.message || err);
          }
        });
      }
    } catch (err: any) {
      console.warn("[StoreAuthService] Failed to init pubsub listener:", err?.message || err);
    }
  }

  /**
   * Formats client User-Agent into a clean summary (e.g. "Chrome · Windows", "Safari · iPhone").
   */
  formatDeviceSummary(userAgent: string): string {
    if (!userAgent) return "Web Browser";

    let browser = "Browser";
    if (userAgent.includes("Firefox")) browser = "Firefox";
    else if (userAgent.includes("Edg")) browser = "Edge";
    else if (userAgent.includes("Chrome") && !userAgent.includes("Edg")) browser = "Chrome";
    else if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) browser = "Safari";

    let os = "Desktop";
    if (userAgent.includes("iPhone")) os = "iPhone";
    else if (userAgent.includes("iPad")) os = "iPad";
    else if (userAgent.includes("Android")) os = "Android";
    else if (userAgent.includes("Macintosh") || userAgent.includes("Mac OS")) os = "macOS";
    else if (userAgent.includes("Windows")) os = "Windows";
    else if (userAgent.includes("Linux")) os = "Linux";

    return `${browser} · ${os}`;
  }

  /**
   * Creates a 4-digit challenge ticket with 300s TTL.
   */
  async createTicket(params: {
    ip: string;
    userAgent: string;
    deviceSummary?: string;
  }): Promise<AuthTicket> {
    const code = crypto.randomInt(1000, 10000).toString();
    const ticketId = `tk_${crypto.randomBytes(12).toString("hex")}`;
    const now = Date.now();
    const expiresAt = now + TICKET_TTL_SECONDS * 1000;

    const ticket: AuthTicket = {
      ticketId,
      code,
      status: "PENDING",
      ip: params.ip || "Unknown",
      userAgent: params.userAgent || "",
      deviceSummary: params.deviceSummary || this.formatDeviceSummary(params.userAgent),
      createdAt: now,
      expiresAt,
    };

    const redis = getCoreRedis();
    await redis.setex(
      `arena:store_auth:ticket:${ticketId}`,
      TICKET_TTL_SECONDS,
      JSON.stringify(ticket)
    );

    return ticket;
  }

  /**
   * Fetches an active challenge ticket by ID.
   */
  async getTicket(ticketId: string): Promise<AuthTicket | null> {
    const redis = getCoreRedis();
    const raw = await redis.get(`arena:store_auth:ticket:${ticketId}`);
    if (!raw) return null;

    try {
      const ticket: AuthTicket = JSON.parse(raw);
      if (Date.now() > ticket.expiresAt) {
        ticket.status = "EXPIRED";
      }
      return ticket;
    } catch {
      return null;
    }
  }

  /**
   * Confirms a challenge ticket when user selects the matching 4-digit code in Telegram.
   */
  async confirmTicket(
    ticketId: string,
    telegramId: string,
    profile?: { firstName?: string; lastName?: string | null; username?: string | null }
  ): Promise<{ success: boolean; reason?: string; ticket?: AuthTicket }> {
    const redis = getCoreRedis();
    const ticket = await this.getTicket(ticketId);

    if (!ticket) {
      return { success: false, reason: "TICKET_NOT_FOUND" };
    }

    if (ticket.status !== "PENDING") {
      return { success: false, reason: `TICKET_${ticket.status}` };
    }

    const remainingTtlSeconds = Math.max(1, Math.floor((ticket.expiresAt - Date.now()) / 1000));

    ticket.status = "CONFIRMED";
    ticket.telegramId = telegramId;
    ticket.firstName = profile?.firstName || ticket.firstName;
    ticket.lastName = profile?.lastName !== undefined ? profile.lastName : ticket.lastName;
    ticket.username = profile?.username !== undefined ? profile.username : ticket.username;
    ticket.confirmedAt = Date.now();

    await redis.setex(
      `arena:store_auth:ticket:${ticketId}`,
      remainingTtlSeconds,
      JSON.stringify(ticket)
    );

    const eventPayload = {
      type: "CONFIRMED",
      ticketId,
      ticket,
    };

    // Emit via in-memory emitter for immediate local delivery
    this.localEmitter.emit(`ticket:${ticketId}`, eventPayload);

    // Publish to Redis Pub/Sub for multi-instance cluster propagation
    if (typeof redis.publish === "function") {
      await redis.publish(
        `arena:store_auth:events:${ticketId}`,
        JSON.stringify(eventPayload)
      ).catch((err: any) => {
        console.warn("[StoreAuthService] Redis publish error:", err?.message || err);
      });
    }

    return { success: true, ticket };
  }

  /**
   * Cancels a challenge ticket (user rejected or clicked wrong code).
   */
  async cancelTicket(ticketId: string, reason = "USER_CANCELLED"): Promise<boolean> {
    const redis = getCoreRedis();
    const ticket = await this.getTicket(ticketId);
    if (!ticket) return false;

    ticket.status = "CANCELLED";
    const remainingTtlSeconds = Math.max(1, Math.floor((ticket.expiresAt - Date.now()) / 1000));

    await redis.setex(
      `arena:store_auth:ticket:${ticketId}`,
      remainingTtlSeconds,
      JSON.stringify(ticket)
    );

    const eventPayload = {
      type: "CANCELLED",
      ticketId,
      reason,
    };

    this.localEmitter.emit(`ticket:${ticketId}`, eventPayload);

    if (typeof redis.publish === "function") {
      await redis.publish(
        `arena:store_auth:events:${ticketId}`,
        JSON.stringify(eventPayload)
      ).catch(() => {});
    }

    return true;
  }

  /**
   * Atomically marks a confirmed ticket as CONSUMED so it cannot be replayed.
   */
  async consumeTicket(ticketId: string): Promise<boolean> {
    const redis = getCoreRedis();
    const ticket = await this.getTicket(ticketId);
    if (!ticket || ticket.status !== "CONFIRMED") return false;

    ticket.status = "CONSUMED";
    const remainingTtlSeconds = Math.max(1, Math.floor((ticket.expiresAt - Date.now()) / 1000));

    await redis.setex(
      `arena:store_auth:ticket:${ticketId}`,
      remainingTtlSeconds,
      JSON.stringify(ticket)
    );
    return true;
  }

  /**
   * Validates Telegram Mini App initData HMAC-SHA256 signature.
   */
  validateMiniAppInitData(
    initData: string,
    botToken: string
  ): { valid: boolean; user?: MiniAppInitDataUser; authDate?: number; reason?: string } {
    if (!initData || !botToken) {
      return { valid: false, reason: "MISSING_INIT_DATA_OR_BOT_TOKEN" };
    }

    try {
      const params = new URLSearchParams(initData);
      const hash = params.get("hash");
      if (!hash) {
        return { valid: false, reason: "MISSING_HASH" };
      }
      if (!/^[a-f0-9]{64}$/i.test(hash)) {
        return { valid: false, reason: "MALFORMED_HASH" };
      }

      params.delete("hash");

      // Sort remaining keys alphabetically and join as key=value\nkey=value
      const sortedKeys = Array.from(params.keys()).sort();
      const dataCheckString = sortedKeys
        .map((key) => `${key}=${params.get(key)}`)
        .join("\n");

      // Secret key = HMAC_SHA256("WebAppData", botToken)
      const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();

      // Calculated signature
      const computedHash = crypto
        .createHmac("sha256", secretKey)
        .update(dataCheckString)
        .digest("hex");

      const computedBuffer = Buffer.from(computedHash, "hex");
      const hashBuffer = Buffer.from(hash, "hex");

      if (computedBuffer.length !== hashBuffer.length || !crypto.timingSafeEqual(computedBuffer, hashBuffer)) {
        return { valid: false, reason: "INVALID_SIGNATURE" };
      }

      // Check auth_date expiry and clock drift
      const rawAuthDate = params.get("auth_date");
      const authDate = parseInt(rawAuthDate || "0", 10);
      if (!rawAuthDate || !Number.isFinite(authDate) || authDate <= 0) {
        return { valid: false, reason: "INVALID_AUTH_DATE" };
      }

      const nowSeconds = Math.floor(Date.now() / 1000);
      if (authDate > nowSeconds + 60) {
        return { valid: false, reason: "FUTURE_AUTH_DATE", authDate };
      }
      if (nowSeconds - authDate > MINI_APP_MAX_AGE_SECONDS) {
        return { valid: false, reason: "INIT_DATA_EXPIRED", authDate };
      }

      // Parse user JSON
      const rawUser = params.get("user");
      if (!rawUser) {
        return { valid: false, reason: "MISSING_USER_PAYLOAD", authDate };
      }

      const user: MiniAppInitDataUser = JSON.parse(rawUser);
      return { valid: true, user, authDate };
    } catch (err: any) {
      return { valid: false, reason: err?.message || "MALFORMED_INIT_DATA" };
    }
  }

  /**
   * Issues a cryptographically secure 7-day customer session.
   */
  async createCustomerSession(user: {
    id: number;
    telegramId: string;
    firstName: string;
    lastName?: string | null;
    username?: string | null;
    role: string;
  }): Promise<string> {
    const token = crypto.randomBytes(32).toString("hex");
    const sessionData: CustomerSession = {
      userId: user.id,
      telegramId: user.telegramId,
      username: user.username || null,
      firstName: user.firstName,
      lastName: user.lastName || null,
      role: user.role,
    };

    const redis = getCoreRedis();
    await redis.setex(
      `arena:store_session:${token}`,
      STORE_SESSION_TTL_SECONDS,
      JSON.stringify(sessionData)
    );

    // Track active sessions for this telegramId for logout-all support with TTL safety
    if (typeof redis.sadd === "function") {
      const setKey = `arena:store_user_sessions:${user.telegramId}`;
      await redis.sadd(setKey, token).catch(() => {});
      if (typeof redis.expire === "function") {
        await redis.expire(setKey, STORE_SESSION_TTL_SECONDS + 86400).catch(() => {});
      }
    }

    return token;
  }

  /**
   * Retrieves active customer session by token.
   */
  async getCustomerSession(token: string): Promise<CustomerSession | null> {
    if (!token) return null;
    const redis = getCoreRedis();
    const raw = await redis.get(`arena:store_session:${token}`);
    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Terminates a single session.
   */
  async terminateCustomerSession(token: string): Promise<boolean> {
    if (!token) return false;
    const redis = getCoreRedis();
    const session = await this.getCustomerSession(token);

    await redis.del(`arena:store_session:${token}`);
    if (session && typeof redis.srem === "function") {
      await redis.srem(`arena:store_user_sessions:${session.telegramId}`, token).catch(() => {});
    }
    return true;
  }

  /**
   * Terminates all active customer sessions across all devices for a user.
   */
  async terminateAllCustomerSessions(telegramId: string): Promise<number> {
    const redis = getCoreRedis();
    if (typeof redis.smembers !== "function") return 0;

    const tokens: string[] = await redis.smembers(`arena:store_user_sessions:${telegramId}`).catch(() => []);
    if (tokens.length === 0) return 0;

    const pipeline = typeof redis.pipeline === "function" ? redis.pipeline() : null;
    if (pipeline) {
      for (const t of tokens) {
        pipeline.del(`arena:store_session:${t}`);
      }
      pipeline.del(`arena:store_user_sessions:${telegramId}`);
      await pipeline.exec();
    } else {
      for (const t of tokens) {
        await redis.del(`arena:store_session:${t}`);
      }
      await redis.del(`arena:store_user_sessions:${telegramId}`);
    }

    return tokens.length;
  }
}

export const storeAuthService = new StoreAuthService();

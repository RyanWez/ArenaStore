import { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  storeAuthService,
  botOrderService,
  TICKET_TTL_SECONDS,
  STORE_SESSION_TTL_SECONDS,
} from "@arena/core";
import { config } from "../../config";

const ticketIdRegex = /^tk_[a-f0-9]{24}$/;

const telegramWebAppSchema = z.object({
  initData: z.string().min(1, "Telegram WebApp initData is required"),
});

const sessionSchema = z
  .object({
    token: z.string().regex(/^[a-f0-9]{64}$/, "Invalid token format").optional(),
    ticketId: z.string().regex(ticketIdRegex, "Invalid ticketId format").optional(),
  })
  .refine((data) => Boolean(data.token || data.ticketId), {
    message: "Either token or ticketId must be provided",
  });

export function buildStoreCookieHeader(token: string, isProd: boolean, maxAge = STORE_SESSION_TTL_SECONDS): string {
  const directives = [
    `arena_store_session=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (isProd) directives.push("Secure");
  return directives.join("; ");
}

export function buildClearStoreCookieHeader(isProd: boolean): string {
  const directives = [
    "arena_store_session=",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (isProd) directives.push("Secure");
  return directives.join("; ");
}

/**
 * Extracts store session token from Bearer Authorization header or arena_store_session cookie.
 */
export function extractStoreToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.replace("Bearer ", "").trim();
  }
  if (request.headers.cookie) {
    const match = request.headers.cookie.match(/arena_store_session=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

export async function storeAuthRoutes(server: FastifyInstance) {
  const isProd = config.NODE_ENV === "production";

  // Initialize shared Redis subscriber in non-test cluster environments
  if (config.NODE_ENV !== "test") {
    storeAuthService.initPubSubListener();
  }

  /**
   * POST /api/store/auth/ticket
   * Generates a 4-digit challenge ticket for external desktop/mobile browsers (Flow A).
   * Rate limited to 15 ticket creations per minute per IP to prevent Redis exhaustion.
   */
  server.post(
    "/api/store/auth/ticket",
    {
      config: {
        rateLimit: {
          max: 15,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const ip = request.ip || "Unknown";
      const userAgent = request.headers["user-agent"] || "";

      const ticket = await storeAuthService.createTicket({ ip, userAgent });

      return reply.status(200).send({
        ok: true,
        ticketId: ticket.ticketId,
        code: ticket.code,
        expiresIn: TICKET_TTL_SECONDS,
        expiresAt: ticket.expiresAt,
        deviceSummary: ticket.deviceSummary,
      });
    }
  );

  /**
   * GET /api/store/auth/events/:ticketId
   * Server-Sent Events (SSE) stream alerting the browser when the ticket is confirmed in Telegram.
   */
  server.get(
    "/api/store/auth/events/:ticketId",
    async (request: FastifyRequest<{ Params: { ticketId: string } }>, reply) => {
      const { ticketId } = request.params;

      if (!ticketIdRegex.test(ticketId)) {
        return reply.status(400).send({
          ok: false,
          error: "Invalid ticketId format.",
        });
      }

      const ticket = await storeAuthService.getTicket(ticketId);

      if (!ticket) {
        return reply.status(404).send({
          ok: false,
          error: "Challenge ticket not found or expired.",
        });
      }

      // Prepare SSE Response
      reply.raw.setHeader("Content-Type", "text/event-stream");
      reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.setHeader("X-Accel-Buffering", "no");

      const origin = request.headers.origin;
      if (origin) {
        reply.raw.setHeader("Access-Control-Allow-Origin", origin);
        reply.raw.setHeader("Access-Control-Allow-Credentials", "true");
      }

      reply.raw.flushHeaders?.();

      const sendSseMessage = (event: string, data: any) => {
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      // If ticket was already confirmed before SSE connected
      if (ticket.status === "CONFIRMED" && ticket.telegramId) {
        await storeAuthService.consumeTicket(ticketId);

        const userData = await botOrderService.getOrCreateUser({
          telegramId: ticket.telegramId,
          firstName: ticket.firstName,
          lastName: ticket.lastName,
          username: ticket.username,
        });

        if (!userData) {
          sendSseMessage("error", { ok: false, error: "Failed to load user record" });
          reply.raw.end();
          return;
        }

        const { user, wallet } = userData;

        if (user.status !== "ACTIVE") {
          sendSseMessage("error", {
            ok: false,
            error: "Account has been suspended or banned. Please contact support.",
            code: "ACCOUNT_SUSPENDED",
          });
          reply.raw.end();
          return;
        }

        const token = await storeAuthService.createCustomerSession({
          id: user.id,
          telegramId: user.telegramId || ticket.telegramId,
          firstName: user.firstName,
          lastName: user.lastName,
          username: user.username,
          role: user.role,
        });
        reply.raw.setHeader("Set-Cookie", buildStoreCookieHeader(token, isProd));

        sendSseMessage("confirmed", {
          ok: true,
          token,
          user: {
            id: user.id,
            telegramId: user.telegramId || ticket.telegramId,
            firstName: user.firstName,
            lastName: user.lastName,
            username: user.username,
            role: user.role,
            balanceMmk: wallet.balanceMmk,
          },
        });
        reply.raw.end();
        return;
      }

      // If ticket was cancelled or expired
      if (ticket.status === "CANCELLED" || ticket.status === "EXPIRED" || ticket.status === "CONSUMED") {
        sendSseMessage(ticket.status.toLowerCase(), { ok: false, reason: ticket.status });
        reply.raw.end();
        return;
      }

      // Initial keepalive handshake
      sendSseMessage("connected", {
        ticketId,
        status: ticket.status,
        expiresAt: ticket.expiresAt,
      });

      let isClosed = false;

      const cleanup = () => {
        if (isClosed) return;
        isClosed = true;
        storeAuthService.localEmitter.off(`ticket:${ticketId}`, onLocalEvent);
      };

      const handleTicketEvent = async (payload: any) => {
        if (isClosed) return;

        if (payload.type === "CONFIRMED" && payload.ticket?.telegramId) {
          try {
            await storeAuthService.consumeTicket(ticketId);

            const userData = await botOrderService.getOrCreateUser({
              telegramId: payload.ticket.telegramId,
              firstName: payload.ticket.firstName,
              lastName: payload.ticket.lastName,
              username: payload.ticket.username,
            });

            if (!userData) {
              sendSseMessage("error", { ok: false, error: "Failed to load user record" });
              return;
            }

            const { user, wallet } = userData;

            if (user.status !== "ACTIVE") {
              sendSseMessage("error", {
                ok: false,
                error: "Account has been suspended or banned. Please contact support.",
                code: "ACCOUNT_SUSPENDED",
              });
              return;
            }

            const token = await storeAuthService.createCustomerSession({
              id: user.id,
              telegramId: user.telegramId || payload.ticket.telegramId,
              firstName: user.firstName,
              lastName: user.lastName,
              username: user.username,
              role: user.role,
            });

            sendSseMessage("confirmed", {
              ok: true,
              token,
              user: {
                id: user.id,
                telegramId: user.telegramId || payload.ticket.telegramId,
                firstName: user.firstName,
                lastName: user.lastName,
                username: user.username,
                role: user.role,
                balanceMmk: wallet.balanceMmk,
              },
            });
          } catch (err: any) {
            sendSseMessage("error", { ok: false, error: err?.message || "Session creation failed" });
          } finally {
            cleanup();
            reply.raw.end();
          }
        } else if (payload.type === "CANCELLED") {
          sendSseMessage("cancelled", { ok: false, reason: payload.reason || "CANCELLED" });
          cleanup();
          reply.raw.end();
        }
      };

      const onLocalEvent = (payload: any) => {
        void handleTicketEvent(payload);
      };

      storeAuthService.localEmitter.on(`ticket:${ticketId}`, onLocalEvent);

      // Auto-timeout when ticket reaches expiration
      const remainingMs = Math.max(0, ticket.expiresAt - Date.now());
      const timeoutTimer = setTimeout(() => {
        if (!isClosed) {
          sendSseMessage("expired", { ok: false, reason: "TICKET_EXPIRED" });
          cleanup();
          reply.raw.end();
        }
      }, remainingMs);

      // Keepalive ping every 15s to keep connections alive across NAT/Cloudflare
      const pingInterval = setInterval(() => {
        if (!isClosed) {
          reply.raw.write(": ping\n\n");
        }
      }, 15000);

      request.raw.on("close", () => {
        clearTimeout(timeoutTimer);
        clearInterval(pingInterval);
        cleanup();
      });
    }
  );

  /**
   * POST /api/store/auth/telegram-webapp
   * Validates Telegram Mini App initData signature for zero-click instant authentication (Flow B).
   * Rate limited to 30 requests per minute per IP.
   */
  server.post(
    "/api/store/auth/telegram-webapp",
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const parseResult = telegramWebAppSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          ok: false,
          error: parseResult.error.errors[0]?.message || "Invalid request body.",
        });
      }

      const { initData } = parseResult.data;
      const botToken = config.TELEGRAM_BOT_TOKEN || (config.NODE_ENV === "test" ? "test-telegram-bot-token" : "");

      const validation = storeAuthService.validateMiniAppInitData(initData, botToken);
      if (!validation.valid || !validation.user) {
        return reply.status(401).send({
          ok: false,
          error: "Unauthorized Telegram Mini App data.",
          reason: validation.reason,
        });
      }

      const tgUser = validation.user;
      const userData = await botOrderService.getOrCreateUser({
        telegramId: String(tgUser.id),
        firstName: tgUser.first_name,
        lastName: tgUser.last_name || null,
        username: tgUser.username || null,
      });

      if (!userData) {
        return reply.status(500).send({
          ok: false,
          error: "Failed to initialize customer account.",
        });
      }

      const { user, wallet } = userData;

      if (user.status !== "ACTIVE") {
        return reply.status(403).send({
          ok: false,
          error: "Account has been suspended or banned. Please contact support.",
          code: "ACCOUNT_SUSPENDED",
        });
      }

      const token = await storeAuthService.createCustomerSession({
        id: user.id,
        telegramId: user.telegramId || String(tgUser.id),
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        role: user.role,
      });
      reply.header("Set-Cookie", buildStoreCookieHeader(token, isProd));

      return reply.status(200).send({
        ok: true,
        token,
        user: {
          id: user.id,
          telegramId: user.telegramId || String(tgUser.id),
          firstName: user.firstName,
          lastName: user.lastName,
          username: user.username,
          role: user.role,
          balanceMmk: wallet.balanceMmk,
        },
      });
    }
  );

  /**
   * POST /api/store/auth/session
   * Exchanges a confirmed token or ticketId to set the HttpOnly arena_store_session cookie.
   * Single-use ticket enforcement prevents token replay.
   * Rate limited to 30 requests per minute per IP.
   */
  server.post(
    "/api/store/auth/session",
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const parseResult = sessionSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          ok: false,
          error: parseResult.error.errors[0]?.message || "Invalid session request.",
        });
      }

      const { token: inputToken, ticketId } = parseResult.data;
      let token = inputToken;

      if (!token && ticketId) {
        const ticket = await storeAuthService.getTicket(ticketId);
        if (!ticket || ticket.status !== "CONFIRMED" || !ticket.telegramId) {
          return reply.status(400).send({
            ok: false,
            error: "Challenge ticket not found, expired, or not confirmed.",
          });
        }

        // Atomically consume ticket to prevent replay attacks
        const consumed = await storeAuthService.consumeTicket(ticketId);
        if (!consumed) {
          return reply.status(400).send({
            ok: false,
            error: "Challenge ticket has already been used.",
          });
        }

        const userData = await botOrderService.getOrCreateUser({
          telegramId: ticket.telegramId,
          firstName: ticket.firstName,
          lastName: ticket.lastName,
          username: ticket.username,
        });

        if (!userData) {
          return reply.status(500).send({
            ok: false,
            error: "Failed to initialize customer account.",
          });
        }

        if (userData.user.status !== "ACTIVE") {
          return reply.status(403).send({
            ok: false,
            error: "Account has been suspended or banned. Please contact support.",
            code: "ACCOUNT_SUSPENDED",
          });
        }

        token = await storeAuthService.createCustomerSession({
          id: userData.user.id,
          telegramId: userData.user.telegramId || ticket.telegramId,
          firstName: userData.user.firstName,
          lastName: userData.user.lastName,
          username: userData.user.username,
          role: userData.user.role,
        });
      }

      if (!token) {
        return reply.status(400).send({
          ok: false,
          error: "Missing or invalid session token or confirmed ticketId.",
        });
      }

      const session = await storeAuthService.getCustomerSession(token);
      if (!session) {
        return reply.status(401).send({
          ok: false,
          error: "Invalid or expired session token.",
        });
      }

      reply.header("Set-Cookie", buildStoreCookieHeader(token, isProd));
      return reply.status(200).send({
        ok: true,
        token,
        user: session,
      });
    }
  );

  /**
   * GET /api/store/auth/me
   * Returns active customer profile and balance from session.
   */
  server.get("/api/store/auth/me", async (request, reply) => {
    const token = extractStoreToken(request);
    if (!token) {
      return reply.status(401).send({
        ok: false,
        error: "Unauthorized. Missing store session cookie or Bearer token.",
      });
    }

    const session = await storeAuthService.getCustomerSession(token);
    if (!session) {
      return reply.status(401).send({
        ok: false,
        error: "Session expired or invalid. Please sign in again.",
      });
    }

    const userData = await botOrderService.getOrCreateUser({
      telegramId: session.telegramId,
      firstName: session.firstName,
      lastName: session.lastName,
      username: session.username,
    });

    if (!userData) {
      return reply.status(404).send({
        ok: false,
        error: "User account not found.",
      });
    }

    const { user, wallet } = userData;

    if (user.status !== "ACTIVE") {
      return reply.status(403).send({
        ok: false,
        error: "Account has been suspended or banned. Please contact support.",
        code: "ACCOUNT_SUSPENDED",
      });
    }

    return reply.status(200).send({
      ok: true,
      user: {
        id: user.id,
        telegramId: user.telegramId || session.telegramId,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        role: user.role,
        balanceMmk: wallet.balanceMmk,
        totalDepositedMmk: wallet.totalDepositedMmk,
        totalSpentMmk: wallet.totalSpentMmk,
        memberSince: user.createdAt,
      },
    });
  });

  /**
   * POST /api/store/auth/logout
   * Terminates active customer session and clears cookie.
   */
  server.post("/api/store/auth/logout", async (request, reply) => {
    const token = extractStoreToken(request);
    if (token) {
      await storeAuthService.terminateCustomerSession(token);
    }
    reply.header("Set-Cookie", buildClearStoreCookieHeader(isProd));
    return reply.status(200).send({ ok: true });
  });

  /**
   * POST /api/store/auth/logout-all
   * Terminates all customer sessions across all devices.
   */
  server.post("/api/store/auth/logout-all", async (request, reply) => {
    const token = extractStoreToken(request);
    if (!token) {
      return reply.status(401).send({
        ok: false,
        error: "Unauthorized.",
      });
    }

    const session = await storeAuthService.getCustomerSession(token);
    if (session) {
      await storeAuthService.terminateAllCustomerSessions(session.telegramId);
    }

    reply.header("Set-Cookie", buildClearStoreCookieHeader(isProd));
    return reply.status(200).send({ ok: true });
  });
}

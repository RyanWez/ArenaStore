import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { registerRateLimit } from "./plugins/rate-limit";
import { healthRoutes } from "./routes/health";
import { catalogRoutes } from "./routes/catalog";
import { orderRoutes } from "./routes/orders";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { authService } from "./services/auth.service";
import { catalogService } from "./services/catalog.service";
import { startCatalogSyncScheduler } from "./services/catalog-scheduler";
import { config } from "./config";

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    trustProxy: config.TRUST_PROXY,
    logger: {
      level: process.env.LOG_LEVEL || "info",
      redact: ["req.headers.authorization", "headers.authorization"],
    },
  });

  // Plugins
  const configuredOrigins = (config.CORS_ORIGIN || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  await server.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (e.g. fastify.inject tests, curl, server-to-server, Telegram webhooks)
      if (!origin) return cb(null, true);

      const isAllowed =
        configuredOrigins.includes(origin) ||
        (config.NODE_ENV !== "production" &&
          (origin.includes("localhost") || origin.includes("127.0.0.1"))) ||
        /^https:\/\/.*\.vercel\.app$/.test(origin);

      if (isAllowed) {
        cb(null, true);
      } else {
        cb(new Error("CORS origin not allowed"), false);
      }
    },
    credentials: true,
  });
  await server.register(sensible);
  await registerRateLimit(server);

  // Authentication preHandler hook for /api/admin/* — login is the only exempt
  // route. Slip images and Telegram file proxies carry customer PII and require
  // a session like any other admin route (the admin app's same-origin Nitro
  // proxy forwards the session cookie for <img> requests).
  server.addHook("preHandler", async (request, reply) => {
    const url = request.url.split("?")[0];
    const isExemptRoute = url === "/api/admin/auth/login";

    if (url.startsWith("/api/admin/") && !isExemptRoute) {
      let token: string | null = null;
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.replace("Bearer ", "").trim();
      } else if (request.headers.cookie) {
        const match = request.headers.cookie.match(/arena_admin_token=([^;]+)/);
        if (match) token = decodeURIComponent(match[1]);
      }

      if (!token) {
        return reply.status(401).send({
          ok: false,
          error: "Unauthorized. Please log in to access admin functions.",
        });
      }

      const session = await authService.getSession(token);
      if (!session) {
        return reply.status(401).send({
          ok: false,
          error: "Session expired or invalid. Please log in again.",
        });
      }

      (request as any).adminUser = session;
    }
  });

  // Register Routes
  await server.register(healthRoutes);
  await server.register(catalogRoutes);
  await server.register(orderRoutes);
  await server.register(authRoutes);
  await server.register(adminRoutes);

  // Custom global error handler
  server.setErrorHandler((error: any, _request, reply) => {
    server.log.error(error);
    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      ok: false,
      error: error.message || "Internal Server Error",
    });
  });

  // Seed default admin in database if not present
  await authService.seedDefaultAdmin().catch((err) => {
    server.log.warn(`Admin seed deferred: ${err.message}`);
  });

  // Automatic catalog sync: once at startup, then on a fixed cadence
  // (CATALOG_SYNC_INTERVAL_MINUTES; 0 or test environment disables it).
  // Each tick also purges expired stock reservations so the sellable-stock
  // aggregate stays small.
  if (config.NODE_ENV !== "test" && config.CATALOG_SYNC_INTERVAL_MINUTES > 0) {
    const scheduler = startCatalogSyncScheduler({
      intervalMinutes: config.CATALOG_SYNC_INTERVAL_MINUTES,
      sync: async () => {
        await catalogService.purgeExpiredReservations();
        return catalogService.syncFullCatalog();
      },
    });
    server.addHook("onClose", async () => {
      scheduler.stop();
    });
  }

  return server;
}

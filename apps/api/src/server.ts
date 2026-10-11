import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import compress from "@fastify/compress";
import etag from "@fastify/etag";
import { registerRateLimit } from "./plugins/rate-limit";
import { healthRoutes } from "./routes/health";
import { catalogRoutes } from "./routes/catalog";
import { adminRoutes } from "./routes/admin";
import { adminUsersRoutes } from "./routes/admin-users";
import { adminBroadcastRoutes } from "./routes/admin-broadcast";
import { botRoutes } from "./routes/bot";
import { authRoutes } from "./routes/auth";
import { mmpayRoutes } from "./routes/mmpay";
import { authService } from "./services/auth.service";
import { rbacService } from "./services/rbac.service";
import { catalogService } from "./services/catalog.service";
import { restockNotifier } from "./services/restock-notifier";
import {
  startCatalogSyncScheduler,
  startBalanceCheckScheduler,
} from "./services/catalog-scheduler";
import { startMmpayReconcileScheduler } from "./services/mmpay-reconcile-scheduler";
import { mmpayService } from "./services/mmpay.service";
import { supplierBalanceMonitor } from "./services/supplier-balance-monitor";
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
          (origin.includes("localhost") || origin.includes("127.0.0.1")));

      if (isAllowed) {
        cb(null, true);
      } else {
        cb(new Error("CORS origin not allowed"), false);
      }
    },
    credentials: true,
  });
  await server.register(sensible);
  await server.register(compress, { global: true, threshold: 1024 });
  await server.register(etag);
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
      (request as any).adminUserToken = token;
    }
  });

  // Register Routes
  await server.register(healthRoutes);
  await server.register(catalogRoutes);
  await server.register(authRoutes);
  await server.register(adminRoutes);
  await server.register(adminUsersRoutes);
  await server.register(adminBroadcastRoutes);
  await server.register(botRoutes);
  await server.register(mmpayRoutes);

  // Custom global error handler
  server.setErrorHandler((error: any, _request, reply) => {
    server.log.error(error);
    const statusCode = error.statusCode || 500;
    const isProd = config.NODE_ENV === "production";
    const clientMessage =
      statusCode >= 500 && isProd
        ? "An internal server error occurred."
        : error.message || "Internal Server Error";

    reply.status(statusCode).send({
      ok: false,
      error: clientMessage,
    });
  });

  // Seed default admin in database if not present
  await authService.seedDefaultAdmin().catch((err) => {
    server.log.warn(`Admin seed deferred: ${err.message}`);
  });

  // Seed the default roles + permission sets (idempotent)
  await rbacService.seedDefaultRoles().catch((err) => {
    server.log.warn(`RBAC seed deferred: ${err.message}`);
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
        const result = await catalogService.syncFullCatalog();
        // Announce anything that just became buyable again (supplier restock,
        // wallet top-up, local-limit raise, re-activation) to all bot users.
        await restockNotifier.detectAndNotify();
        return result;
      },
    });
    server.addHook("onClose", async () => {
      scheduler.stop();
    });
  }

  // Supplier balance monitoring on its own (shorter) cadence so low-balance
  // alerts are not delayed by the catalog sync interval. The monitor is
  // coalesced: it alerts once per drop and re-arms on recovery.
  if (config.NODE_ENV !== "test" && config.BALANCE_CHECK_INTERVAL_MINUTES > 0) {
    const balanceScheduler = startBalanceCheckScheduler({
      intervalMinutes: config.BALANCE_CHECK_INTERVAL_MINUTES,
      check: () => supplierBalanceMonitor.checkBalances(),
    });
    server.addHook("onClose", async () => {
      balanceScheduler.stop();
    });
  }

  // MMQR reconciliation sweep: the safety net for a webhook that was never
  // delivered. Pulls still-PENDING MMQR orders from the gateway and credits any
  // it reports as paid. Only runs with real MMPay credentials; the interval
  // (seconds) is configurable and 0 disables it. Off in tests.
  if (
    config.NODE_ENV !== "test" &&
    config.MMPAY_RECONCILE_INTERVAL_SECONDS > 0 &&
    mmpayService.ready
  ) {
    const reconcileScheduler = startMmpayReconcileScheduler({
      intervalSeconds: config.MMPAY_RECONCILE_INTERVAL_SECONDS,
    });
    server.addHook("onClose", async () => {
      reconcileScheduler.stop();
    });
  }

  return server;
}

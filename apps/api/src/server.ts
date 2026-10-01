import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { healthRoutes } from "./routes/health";
import { catalogRoutes } from "./routes/catalog";
import { orderRoutes } from "./routes/orders";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { authService } from "./services/auth.service";
import { catalogService } from "./services/catalog.service";

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
      redact: ["req.headers.authorization", "headers.authorization"],
    },
  });

  // Plugins
  await server.register(cors, {
    origin: true,
    credentials: true,
  });
  await server.register(sensible);

  // Authentication preHandler hook for /api/admin/* (excluding /api/admin/auth/login)
  server.addHook("preHandler", async (request, reply) => {
    const url = request.url.split("?")[0];
    if (url.startsWith("/api/admin/") && url !== "/api/admin/auth/login") {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return reply.status(401).send({
          ok: false,
          error: "Unauthorized. Please log in to access admin functions.",
        });
      }

      const token = authHeader.replace("Bearer ", "").trim();
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

  // Synchronize categories and products on server start to ensure foreign key and mapping alignment
  catalogService
    .syncCategories()
    .then(() => catalogService.syncProducts())
    .then((count) => server.log.info(`Catalog synchronized on startup: ${count} products aligned`))
    .catch((err) => server.log.warn(`Startup catalog sync error: ${err.message}`));

  return server;
}

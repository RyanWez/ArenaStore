import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { healthRoutes } from "./routes/health";
import { catalogRoutes } from "./routes/catalog";
import { orderRoutes } from "./routes/orders";
import { adminRoutes } from "./routes/admin";

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

  // Register Routes
  await server.register(healthRoutes);
  await server.register(catalogRoutes);
  await server.register(orderRoutes);
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

  return server;
}

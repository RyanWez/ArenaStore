import { FastifyInstance } from "fastify";
import { getDb } from "@arena/db";
import { sql } from "drizzle-orm";
import { xproClient } from "../services/xpro-client";

export async function healthRoutes(server: FastifyInstance) {
  server.get("/", async () => {
    return {
      status: "ok",
      service: "Arena Store API & Telegram Bot",
      healthEndpoint: "/health",
      timestamp: new Date().toISOString(),
    };
  });

  server.get("/health", async (_request, reply) => {
    let dbStatus = "unknown";
    let dbHealthy = false;
    try {
      const db = getDb();
      await db.execute(sql`SELECT 1`);
      dbStatus = "connected";
      dbHealthy = true;
    } catch (err: any) {
      dbStatus = `error: ${err.message}`;
    }

    let upstreamStatus = "unknown";
    try {
      const upstreamHealth = await xproClient.getHealth();
      upstreamStatus = upstreamHealth.ok ? "healthy" : "degraded";
    } catch (err: any) {
      upstreamStatus = `error: ${err.message}`;
    }

    // A dead database means the API cannot serve requests: answer 503 so HTTP
    // uptime monitors (e.g. UptimeRobot) treat it as an outage. A degraded
    // upstream partner API alone stays 200 with `degraded: true` — the store
    // keeps serving from local catalog state.
    if (!dbHealthy) {
      reply.code(503);
      return {
        status: "degraded",
        degraded: true,
        timestamp: new Date().toISOString(),
        services: {
          database: dbStatus,
          upstreamPartnerApi: upstreamStatus,
        },
      };
    }

    return {
      status: "ok",
      degraded: upstreamStatus !== "healthy",
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        upstreamPartnerApi: upstreamStatus,
      },
    };
  });
}

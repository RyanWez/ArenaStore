import { FastifyInstance } from "fastify";
import { getDb } from "@arena/db";
import { sql } from "drizzle-orm";
import { xproClient } from "../services/xpro-client";

export async function healthRoutes(server: FastifyInstance) {
  server.get("/health", async () => {
    let dbStatus = "unknown";
    try {
      const db = getDb();
      await db.execute(sql`SELECT 1`);
      dbStatus = "connected";
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

    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        upstreamPartnerApi: upstreamStatus,
      },
    };
  });
}

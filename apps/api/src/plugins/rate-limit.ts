import { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { getRedis } from "../services/redis";

export async function registerRateLimit(server: FastifyInstance) {
  let redisClient = null;
  try {
    redisClient = getRedis();
  } catch (err: any) {
    console.warn("[RateLimit] Could not initialize Redis for rate limiting, falling back to memory:", err.message);
  }

  await server.register(rateLimit, {
    global: true,
    max: 120, // Default: 120 requests per minute per IP
    timeWindow: "1 minute",
    redis: redisClient || undefined,
    allowList: (req) => {
      // Exclude healthcheck route from rate limiting
      return req.url === "/health" || req.url === "/api/health";
    },
    errorResponseBuilder: (request, context) => {
      const retryAfterSeconds = Math.ceil(context.ttl / 1000);
      return {
        ok: false,
        error: `Rate limit exceeded. Too many requests, please slow down.`,
        retryAfter: retryAfterSeconds,
        statusCode: 429,
      };
    },
  });
}

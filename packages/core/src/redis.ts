import Redis from "ioredis";
import { getCoreConfig } from "./config";

let sharedRedis: Redis | any | null = null;

/**
 * Allows injecting an in-memory or mock Redis instance (e.g. for unit and integration testing).
 */
export function setCoreRedis(instance: any): void {
  sharedRedis = instance;
}

/**
 * Returns the shared Redis client used for command execution (get/set/del/publish).
 */
export function getCoreRedis(): Redis {
  if (!sharedRedis) {
    const config = getCoreConfig();
    const redisUrl = config.REDIS_URL || "redis://localhost:6379";

    sharedRedis = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      retryStrategy(times) {
        return Math.min(times * 100, 3000);
      },
    });

    sharedRedis.on("error", (err: any) => {
      console.error("[@arena/core Redis Error]", err?.message || err);
    });
  }
  return sharedRedis;
}

let sharedSubscriberRedis: Redis | any | null = null;

/**
 * Allows injecting a mock subscriber instance for testing.
 */
export function setSharedSubscriberRedis(instance: any): void {
  sharedSubscriberRedis = instance;
}

/**
 * Returns a single shared Redis subscriber instance for pattern/channel subscriptions across SSE streams.
 * Prevents exhausting Redis connection limits (maxclients) by multiplexing multiple clients over one connection.
 */
export function getSharedSubscriberRedis(): Redis {
  if (!sharedSubscriberRedis) {
    const config = getCoreConfig();
    const redisUrl = config.REDIS_URL || "redis://localhost:6379";

    sharedSubscriberRedis = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      retryStrategy(times) {
        return Math.min(times * 100, 3000);
      },
    });

    sharedSubscriberRedis.on("error", (err: any) => {
      console.error("[@arena/core Redis Shared Subscriber Error]", err?.message || err);
    });
  }
  return sharedSubscriberRedis;
}

/**
 * Spawns a dedicated Redis client instance for Pub/Sub subscriptions (SSE streams).
 * In ioredis, an active subscriber connection cannot issue regular get/set commands.
 */
export function createSubscriberRedis(): Redis {
  return getSharedSubscriberRedis();
}


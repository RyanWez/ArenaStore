import Redis from "ioredis";
import { config } from "../config";

let redisInstance: Redis | null = null;

export function getRedis(): Redis {
  if (!redisInstance) {
    redisInstance = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      retryStrategy(times) {
        return Math.min(times * 100, 3000);
      },
    });

    redisInstance.on("error", (err) => {
      console.error("[Redis Error]", err.message);
    });
  }
  return redisInstance;
}

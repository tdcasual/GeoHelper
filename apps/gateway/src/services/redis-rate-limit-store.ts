import { KvClient } from "./kv-client";
import { RateLimitStore } from "./rate-limit-store";

const RATE_LIMIT_PREFIX = "geohelper:ratelimit:";

const keyForRateLimit = (key: string): string => `${RATE_LIMIT_PREFIX}${key}`;

export const createRedisRateLimitStore = (
  kvClient: KvClient
): RateLimitStore => {
  const trackedKeys = new Set<string>();

  return {
    consume: async (key, windowMs) => {
      const rateLimitKey = keyForRateLimit(key);
      const ttlMs = Math.max(1, windowMs);
      const now = Date.now();
      trackedKeys.add(rateLimitKey);

      const created = await kvClient.set(rateLimitKey, "1", {
        ttlMs,
        onlyIfAbsent: true
      });
      if (created) {
        return {
          count: 1,
          resetAt: now + ttlMs
        };
      }

      const count = await kvClient.increment(rateLimitKey);
      let remainingTtlMs = await kvClient.getTtlMs(rateLimitKey);
      if (remainingTtlMs === null || remainingTtlMs <= 0) {
        await kvClient.expire(rateLimitKey, ttlMs);
        remainingTtlMs = ttlMs;
      }

      return {
        count,
        resetAt: now + remainingTtlMs
      };
    },
    clear: async () => {
      await Promise.all(
        [...trackedKeys].map(async (key) => {
          await kvClient.delete(key);
        })
      );
      trackedKeys.clear();
    }
  };
};

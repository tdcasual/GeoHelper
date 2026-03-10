export type RateLimitStoreResult<T> = T | Promise<T>;

export interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export interface RateLimitStore {
  consume: (
    key: string,
    windowMs: number
  ) => RateLimitStoreResult<RateLimitBucket>;
  clear: () => RateLimitStoreResult<void>;
}

export const createMemoryRateLimitStore = (): RateLimitStore => {
  const buckets = new Map<string, RateLimitBucket>();

  return {
    consume: (key, windowMs) => {
      const now = Date.now();
      const existing = buckets.get(key);

      if (!existing || existing.resetAt <= now) {
        const next = {
          count: 1,
          resetAt: now + windowMs
        };
        buckets.set(key, next);
        return next;
      }

      const next = {
        ...existing,
        count: existing.count + 1
      };
      buckets.set(key, next);
      return next;
    },
    clear: () => {
      buckets.clear();
    }
  };
};

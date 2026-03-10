import {
  createMemoryRateLimitStore,
  RateLimitStore
} from "./rate-limit-store";

const defaultRateLimitStore = createMemoryRateLimitStore();

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

export const getDefaultRateLimitStore = (): RateLimitStore =>
  defaultRateLimitStore;

export const consumeRateLimit = (
  key: string,
  max: number,
  windowMs: number,
  store: RateLimitStore = defaultRateLimitStore
): RateLimitResult => {
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    const next = {
      count: 1,
      resetAt: now + windowMs
    };
    store.set(key, next);
    return {
      allowed: true,
      limit: max,
      remaining: Math.max(0, max - 1),
      resetAt: next.resetAt
    };
  }

  const next = {
    ...existing,
    count: existing.count + 1
  };
  store.set(key, next);

  const remaining = Math.max(0, max - next.count);
  return {
    allowed: next.count <= max,
    limit: max,
    remaining,
    resetAt: next.resetAt
  };
};

export const clearRateLimits = (
  store: RateLimitStore = defaultRateLimitStore
): void => {
  store.clear();
};

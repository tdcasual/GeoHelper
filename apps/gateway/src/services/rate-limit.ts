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

export const consumeRateLimit = async (
  key: string,
  max: number,
  windowMs: number,
  store: RateLimitStore = defaultRateLimitStore
): Promise<RateLimitResult> => {
  const bucket = await store.consume(key, windowMs);
  const remaining = Math.max(0, max - bucket.count);

  return {
    allowed: bucket.count <= max,
    limit: max,
    remaining,
    resetAt: bucket.resetAt
  };
};

export const clearRateLimits = (
  store: RateLimitStore = defaultRateLimitStore
): void => {
  void store.clear();
};

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

export const consumeRateLimit = (
  key: string,
  max: number,
  windowMs: number
): RateLimitResult => {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const next: Bucket = {
      count: 1,
      resetAt: now + windowMs
    };
    buckets.set(key, next);
    return {
      allowed: true,
      limit: max,
      remaining: Math.max(0, max - 1),
      resetAt: next.resetAt
    };
  }

  existing.count += 1;
  buckets.set(key, existing);

  const remaining = Math.max(0, max - existing.count);
  return {
    allowed: existing.count <= max,
    limit: max,
    remaining,
    resetAt: existing.resetAt
  };
};

export const clearRateLimits = (): void => {
  buckets.clear();
};

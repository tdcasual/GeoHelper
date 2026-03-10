export interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export interface RateLimitStore {
  get: (key: string) => RateLimitBucket | undefined;
  set: (key: string, bucket: RateLimitBucket) => void;
  clear: () => void;
}

export const createMemoryRateLimitStore = (): RateLimitStore => {
  const buckets = new Map<string, RateLimitBucket>();

  return {
    get: (key) => buckets.get(key),
    set: (key, bucket) => {
      buckets.set(key, bucket);
    },
    clear: () => {
      buckets.clear();
    }
  };
};

import { createClient } from "redis";

export interface KvSetOptions {
  onlyIfAbsent?: boolean;
  ttlMs?: number;
  ttlSeconds?: number;
}

export interface KvClient {
  get: (key: string) => Promise<string | null>;
  set: (
    key: string,
    value: string,
    options?: KvSetOptions
  ) => Promise<boolean>;
  delete: (key: string) => Promise<void>;
  increment: (key: string) => Promise<number>;
  expire: (key: string, ttlMs: number) => Promise<boolean>;
  getTtlMs: (key: string) => Promise<number | null>;
  clear?: () => Promise<void>;
  disconnect?: () => Promise<void>;
}

interface MemoryKvEntry {
  value: string;
  expiresAt?: number;
}

const resolveExpiresAt = (options?: KvSetOptions): number | undefined => {
  if (options?.ttlMs && options.ttlMs > 0) {
    return Date.now() + options.ttlMs;
  }

  if (options?.ttlSeconds && options.ttlSeconds > 0) {
    return Date.now() + options.ttlSeconds * 1000;
  }

  return undefined;
};

export const createMemoryKvClient = (): KvClient => {
  const store = new Map<string, MemoryKvEntry>();

  const readEntry = (key: string): MemoryKvEntry | undefined => {
    const entry = store.get(key);
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      store.delete(key);
      return undefined;
    }

    return entry;
  };

  return {
    get: async (key) => readEntry(key)?.value ?? null,
    set: async (key, value, options) => {
      if (options?.onlyIfAbsent && readEntry(key)) {
        return false;
      }

      store.set(key, {
        value,
        expiresAt: resolveExpiresAt(options)
      });
      return true;
    },
    delete: async (key) => {
      store.delete(key);
    },
    increment: async (key) => {
      const current = readEntry(key);
      const nextValue = Number.parseInt(current?.value ?? "0", 10) + 1;
      store.set(key, {
        value: String(nextValue),
        expiresAt: current?.expiresAt
      });
      return nextValue;
    },
    expire: async (key, ttlMs) => {
      const current = readEntry(key);
      if (!current) {
        return false;
      }

      store.set(key, {
        value: current.value,
        expiresAt: Date.now() + Math.max(1, ttlMs)
      });
      return true;
    },
    getTtlMs: async (key) => {
      const current = readEntry(key);
      if (!current?.expiresAt) {
        return null;
      }

      return Math.max(0, current.expiresAt - Date.now());
    },
    clear: async () => {
      store.clear();
    }
  };
};

export const createRedisKvClient = (redisUrl: string): KvClient => {
  const client = createClient({
    url: redisUrl
  });
  let connectPromise: Promise<void> | null = null;

  const ensureConnected = async (): Promise<void> => {
    if (client.isOpen) {
      return;
    }

    if (!connectPromise) {
      connectPromise = client.connect().finally(() => {
        connectPromise = null;
      });
    }

    await connectPromise;
  };

  return {
    get: async (key) => {
      await ensureConnected();
      return client.get(key);
    },
    set: async (key, value, options) => {
      await ensureConnected();
      const response = await client.set(key, value, {
        ...(options?.ttlSeconds && options.ttlSeconds > 0
          ? { EX: Math.max(1, Math.ceil(options.ttlSeconds)) }
          : {}),
        ...(options?.ttlMs && options.ttlMs > 0
          ? { PX: Math.max(1, Math.ceil(options.ttlMs)) }
          : {}),
        ...(options?.onlyIfAbsent ? { NX: true } : {})
      });
      return response === "OK";
    },
    delete: async (key) => {
      await ensureConnected();
      await client.del(key);
    },
    increment: async (key) => {
      await ensureConnected();
      return client.incr(key);
    },
    expire: async (key, ttlMs) => {
      await ensureConnected();
      return client.pExpire(key, Math.max(1, Math.ceil(ttlMs)));
    },
    getTtlMs: async (key) => {
      await ensureConnected();
      const ttlMs = await client.pTTL(key);
      if (ttlMs < 0) {
        return null;
      }
      return ttlMs;
    },
    disconnect: async () => {
      if (client.isOpen) {
        await client.quit();
      }
    }
  };
};

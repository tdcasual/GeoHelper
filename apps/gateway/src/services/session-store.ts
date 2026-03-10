export type SessionStoreResult<T> = T | Promise<T>;

export interface SessionRevocationStore {
  add: (tokenHash: string, ttlSeconds?: number) => SessionStoreResult<void>;
  has: (tokenHash: string) => SessionStoreResult<boolean>;
  clear: () => SessionStoreResult<void>;
}

export const createMemorySessionRevocationStore = (): SessionRevocationStore => {
  const revokedTokenHashes = new Map<string, number | undefined>();

  const getExpiry = (tokenHash: string): number | undefined => {
    const expiresAt = revokedTokenHashes.get(tokenHash);
    if (expiresAt && expiresAt <= Date.now()) {
      revokedTokenHashes.delete(tokenHash);
      return undefined;
    }

    return expiresAt;
  };

  return {
    add: (tokenHash, ttlSeconds) => {
      revokedTokenHashes.set(
        tokenHash,
        ttlSeconds ? Date.now() + Math.max(1, ttlSeconds) * 1000 : undefined
      );
    },
    has: (tokenHash) => {
      const expiresAt = getExpiry(tokenHash);
      return expiresAt !== undefined || revokedTokenHashes.has(tokenHash);
    },
    clear: () => {
      revokedTokenHashes.clear();
    }
  };
};

import { KvClient } from "./kv-client";
import { SessionRevocationStore } from "./session-store";

const SESSION_REVOKE_PREFIX = "geohelper:session:revoked:";

const keyForTokenHash = (tokenHash: string): string =>
  `${SESSION_REVOKE_PREFIX}${tokenHash}`;

export const createRedisSessionRevocationStore = (
  kvClient: KvClient
): SessionRevocationStore => {
  const trackedKeys = new Set<string>();

  return {
    add: async (tokenHash, ttlSeconds) => {
      const key = keyForTokenHash(tokenHash);
      trackedKeys.add(key);
      await kvClient.set(key, "1", {
        ttlSeconds: ttlSeconds ? Math.max(1, ttlSeconds) : undefined
      });
    },
    has: async (tokenHash) =>
      (await kvClient.get(keyForTokenHash(tokenHash))) !== null,
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

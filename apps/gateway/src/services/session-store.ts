export interface SessionRevocationStore {
  add: (tokenHash: string) => void;
  has: (tokenHash: string) => boolean;
  clear: () => void;
}

export const createMemorySessionRevocationStore = (): SessionRevocationStore => {
  const revokedTokenHashes = new Set<string>();

  return {
    add: (tokenHash) => {
      revokedTokenHashes.add(tokenHash);
    },
    has: (tokenHash) => revokedTokenHashes.has(tokenHash),
    clear: () => {
      revokedTokenHashes.clear();
    }
  };
};

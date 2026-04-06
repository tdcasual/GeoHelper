import type { MemoryEntry } from "@geohelper/agent-protocol";

import type { MemoryLookup, RankedMemoryEntry } from "./memory-types";

export interface MemoryRanker {
  rank: (input: {
    entry: MemoryEntry;
    lookup: MemoryLookup;
    lookupIndex: number;
    lookupCount: number;
  }) => RankedMemoryEntry;
}

export const createMemoryRanker = (): MemoryRanker => ({
  rank: ({ entry, lookup, lookupIndex, lookupCount }) => ({
    entry,
    score: (lookupCount - lookupIndex) * 1000,
    reason: `lookup:${lookup.scope}:${lookup.scopeId}`
  })
});

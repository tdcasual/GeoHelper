import type { MemoryEntry, MemoryScope } from "@geohelper/agent-protocol";
import type { MemoryRepo } from "@geohelper/agent-store";

import { createMemoryRanker, type MemoryRanker } from "./memory-ranker";
import type {
  MemoryLookup,
  MemoryLookupOptions,
  RankedMemoryEntry
} from "./memory-types";

export interface MemoryRetriever {
  forScope: (lookup: MemoryLookup) => Promise<MemoryEntry[]>;
  forThread: (threadId: string, key?: string) => Promise<MemoryEntry[]>;
  forWorkspace: (workspaceId: string, key?: string) => Promise<MemoryEntry[]>;
  forLookups: (
    lookups: MemoryLookup[],
    options?: MemoryLookupOptions
  ) => Promise<RankedMemoryEntry[]>;
}

export interface CreateMemoryRetrieverOptions {
  memoryRepo: Pick<MemoryRepo, "listMemoryEntries">;
  ranker?: MemoryRanker;
}

const listByScope = (
  memoryRepo: Pick<MemoryRepo, "listMemoryEntries">,
  scope: MemoryScope,
  scopeId: string,
  key?: string
): Promise<MemoryEntry[]> =>
  Promise.resolve(
    memoryRepo.listMemoryEntries({
      scope,
      scopeId,
      key
    })
  );

export const createMemoryRetriever = ({
  memoryRepo,
  ranker = createMemoryRanker()
}: CreateMemoryRetrieverOptions): MemoryRetriever => ({
  forScope: ({ scope, scopeId, key }) =>
    listByScope(memoryRepo, scope, scopeId, key),
  forThread: (threadId, key) => listByScope(memoryRepo, "thread", threadId, key),
  forWorkspace: (workspaceId, key) =>
    listByScope(memoryRepo, "workspace", workspaceId, key),
  forLookups: async (lookups, options = {}) => {
    const ranked = new Map<string, RankedMemoryEntry>();

    const lookupResults = await Promise.all(
      lookups.map((lookup) =>
        listByScope(memoryRepo, lookup.scope, lookup.scopeId, lookup.key)
      )
    );

    for (const [lookupIndex, entries] of lookupResults.entries()) {
      for (const entry of entries) {
        const nextRanked = ranker.rank({
          entry,
          lookup: lookups[lookupIndex]!,
          lookupIndex,
          lookupCount: lookups.length
        });
        const existing = ranked.get(entry.id);

        if (!existing || nextRanked.score > existing.score) {
          ranked.set(entry.id, nextRanked);
        }
      }
    }

    const ordered = [...ranked.values()].sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return right.entry.createdAt.localeCompare(left.entry.createdAt);
    });

    if (typeof options.limit === "number") {
      return ordered.slice(0, Math.max(0, options.limit));
    }

    return ordered;
  }
});

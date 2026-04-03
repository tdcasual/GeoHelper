import type { MemoryEntry, MemoryScope } from "@geohelper/agent-protocol";
import type { MemoryRepo } from "@geohelper/agent-store";

import type { MemoryLookup } from "./memory-types";

export interface MemoryRetriever {
  forScope: (lookup: MemoryLookup) => Promise<MemoryEntry[]>;
  forThread: (threadId: string, key?: string) => Promise<MemoryEntry[]>;
  forWorkspace: (workspaceId: string, key?: string) => Promise<MemoryEntry[]>;
}

export interface CreateMemoryRetrieverOptions {
  memoryRepo: Pick<MemoryRepo, "listMemoryEntries">;
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
  memoryRepo
}: CreateMemoryRetrieverOptions): MemoryRetriever => ({
  forScope: ({ scope, scopeId, key }) =>
    listByScope(memoryRepo, scope, scopeId, key),
  forThread: (threadId, key) => listByScope(memoryRepo, "thread", threadId, key),
  forWorkspace: (workspaceId, key) =>
    listByScope(memoryRepo, "workspace", workspaceId, key)
});

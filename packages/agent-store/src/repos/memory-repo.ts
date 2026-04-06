import type { MemoryEntry, MemoryScope } from "@geohelper/agent-protocol";

import type { AgentStoreResult } from "./run-repo";

export interface MemoryEntryFilter {
  scope?: MemoryScope;
  scopeId?: string;
  key?: string;
  sourceRunId?: string;
  sourceArtifactId?: string;
}

export interface MemoryRepo {
  writeMemoryEntry: (entry: MemoryEntry) => AgentStoreResult<void>;
  listMemoryEntries: (filter?: MemoryEntryFilter) => AgentStoreResult<MemoryEntry[]>;
  listMemoryEntriesForRun: (runId: string) => AgentStoreResult<MemoryEntry[]>;
}

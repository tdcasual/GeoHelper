import type { MemoryEntry } from "@geohelper/agent-protocol";

import type { AgentStoreResult } from "./run-repo";

export interface MemoryRepo {
  writeMemoryEntry: (entry: MemoryEntry) => AgentStoreResult<void>;
  listMemoryEntriesForRun: (runId: string) => AgentStoreResult<MemoryEntry[]>;
}

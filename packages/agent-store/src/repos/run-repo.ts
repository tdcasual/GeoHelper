import type { Artifact, Checkpoint, MemoryEntry, Run, RunEvent } from "@geohelper/agent-protocol";

export type AgentStoreResult<T> = T | Promise<T>;

export interface RunSnapshot {
  run: Run;
  events: RunEvent[];
  checkpoints: Checkpoint[];
  artifacts: Artifact[];
  memoryEntries: MemoryEntry[];
}

export interface RunRepo {
  createRun: (run: Run) => AgentStoreResult<void>;
  getRun: (runId: string) => AgentStoreResult<Run | null>;
}

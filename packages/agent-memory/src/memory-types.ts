import type { MemoryEntry, MemoryScope } from "@geohelper/agent-protocol";

export interface MemoryLookup {
  scope: MemoryScope;
  scopeId: string;
  key?: string;
}

export interface MemoryLookupOptions {
  limit?: number;
}

export interface RankedMemoryEntry {
  entry: MemoryEntry;
  score: number;
  reason: string;
}

export interface MemoryWriteInput
  extends Omit<MemoryEntry, "sourceRunId" | "sourceArtifactId"> {
  sourceRunId: string;
  sourceArtifactId: string;
}

export interface MemoryWriteResult {
  status: "written" | "deduplicated";
  entry: MemoryEntry;
}

export interface MemoryWriteDecisionWrite {
  action: "write";
}

export interface MemoryWriteDecisionDeduplicate {
  action: "deduplicate";
  existingEntry: MemoryEntry;
}

export type MemoryWriteDecision =
  | MemoryWriteDecisionWrite
  | MemoryWriteDecisionDeduplicate;

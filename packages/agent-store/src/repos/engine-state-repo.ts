import type { AgentStoreResult } from "./run-repo";

export interface WorkflowBudgetUsageState {
  modelCalls: number;
  toolCalls: number;
}

export interface WorkflowEngineStateRecord {
  runId: string;
  nextNodeId: string | null;
  visitedNodeIds: string[];
  emittedEventCount: number;
  spawnedRunIds: string[];
  budgetUsage: WorkflowBudgetUsageState;
  pendingCheckpointId: string;
  updatedAt: string;
}

export interface EngineStateRepo {
  upsertState: (
    state: WorkflowEngineStateRecord
  ) => AgentStoreResult<void>;
  getState: (
    runId: string
  ) => AgentStoreResult<WorkflowEngineStateRecord | null>;
  deleteState: (runId: string) => AgentStoreResult<void>;
}

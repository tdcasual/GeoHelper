import type { AgentStoreResult } from "./run-repo";

export interface RunDispatch {
  id: string;
  runId: string;
  workerId?: string;
  createdAt: string;
  claimedAt?: string;
}

export interface ClaimNextDispatchInput {
  workerId: string;
  claimedAt: string;
}

export interface DispatchRepo {
  enqueueRun: (
    runId: string,
    createdAt?: string
  ) => AgentStoreResult<RunDispatch>;
  claimNextDispatch: (
    input: ClaimNextDispatchInput
  ) => AgentStoreResult<RunDispatch | null>;
  completeDispatch: (dispatchId: string) => AgentStoreResult<void>;
}

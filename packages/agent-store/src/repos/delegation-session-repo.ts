import type { AgentStoreResult } from "./run-repo";

export type DelegationSessionStatus = "pending" | "completed" | "failed" | "cancelled";

export interface DelegationSessionRecord {
  id: string;
  runId: string;
  checkpointId: string;
  delegationName: string;
  agentRef: string;
  serviceRef?: string;
  status: DelegationSessionStatus;
  outputArtifactIds: string[];
  result?: unknown;
  claimedBy?: string;
  claimedAt?: string;
  claimExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export interface DelegationSessionFilter {
  runId?: string;
  status?: DelegationSessionStatus;
  agentRef?: string;
  serviceRef?: string;
  claimedBy?: string;
}

export interface DelegationSessionRepo {
  upsertSession: (session: DelegationSessionRecord) => AgentStoreResult<void>;
  getSession: (sessionId: string) => AgentStoreResult<DelegationSessionRecord | null>;
  listSessions: (filter?: DelegationSessionFilter) => AgentStoreResult<DelegationSessionRecord[]>;
  deleteSession: (sessionId: string) => AgentStoreResult<void>;
}

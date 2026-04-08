import type { AgentStoreResult } from "./run-repo";

export type AcpSessionStatus = "pending" | "completed" | "failed" | "cancelled";

export interface AcpSessionRecord {
  id: string;
  runId: string;
  checkpointId: string;
  delegationName: string;
  agentRef: string;
  serviceRef?: string;
  status: AcpSessionStatus;
  outputArtifactIds: string[];
  result?: unknown;
  claimedBy?: string;
  claimedAt?: string;
  claimExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export interface AcpSessionFilter {
  runId?: string;
  status?: AcpSessionStatus;
  agentRef?: string;
  serviceRef?: string;
  claimedBy?: string;
}

export interface AcpSessionRepo {
  upsertSession: (session: AcpSessionRecord) => AgentStoreResult<void>;
  getSession: (sessionId: string) => AgentStoreResult<AcpSessionRecord | null>;
  listSessions: (filter?: AcpSessionFilter) => AgentStoreResult<AcpSessionRecord[]>;
  deleteSession: (sessionId: string) => AgentStoreResult<void>;
}

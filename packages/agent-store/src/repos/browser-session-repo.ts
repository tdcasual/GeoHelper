import type { AgentStoreResult } from "./run-repo";

export interface BrowserSessionRecord {
  id: string;
  runId: string;
  allowedToolNames: string[];
  createdAt: string;
}

export interface BrowserSessionRepo {
  createSession: (session: BrowserSessionRecord) => AgentStoreResult<void>;
  getSession: (
    sessionId: string
  ) => AgentStoreResult<BrowserSessionRecord | null>;
  deleteSession: (sessionId: string) => AgentStoreResult<void>;
}

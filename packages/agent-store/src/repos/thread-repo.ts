import type { AgentStoreResult } from "./run-repo";

export interface AgentThread {
  id: string;
  title: string;
  createdAt: string;
}

export interface ThreadRepo {
  createThread: (thread: AgentThread) => AgentStoreResult<void>;
  getThread: (threadId: string) => AgentStoreResult<AgentThread | null>;
  listThreads: () => AgentStoreResult<AgentThread[]>;
}

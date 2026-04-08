import type {
  Artifact,
  Checkpoint,
  CheckpointStatus,
  MemoryEntry,
  Run,
  RunEvent
} from "@geohelper/agent-protocol";

import type {
  AcpSessionRecord,
  AcpSessionRepo,
  AcpSessionStatus
} from "./repos/acp-session-repo";
import type { ArtifactRepo } from "./repos/artifact-repo";
import type {
  BrowserSessionRecord,
  BrowserSessionRepo
} from "./repos/browser-session-repo";
import type { CheckpointRepo } from "./repos/checkpoint-repo";
import type {
  ClaimNextDispatchInput,
  DispatchRepo,
  RunDispatch
} from "./repos/dispatch-repo";
import type {
  EngineStateRepo,
  WorkflowEngineStateRecord
} from "./repos/engine-state-repo";
import type { EventRepo } from "./repos/event-repo";
import type { MemoryEntryFilter, MemoryRepo } from "./repos/memory-repo";
import type { AgentStoreResult, RunFilter, RunRepo, RunSnapshot } from "./repos/run-repo";
import type { AgentThread, ThreadRepo } from "./repos/thread-repo";
export { createSqliteAgentStore } from "./sqlite-store";

const bySequence = (left: RunEvent, right: RunEvent): number =>
  left.sequence - right.sequence;

const byCreatedAt = <T extends { createdAt: string }>(left: T, right: T): number =>
  left.createdAt.localeCompare(right.createdAt);

const matchesRunFilter = (run: Run, filter: RunFilter = {}): boolean => {
  if (filter.status && run.status !== filter.status) {
    return false;
  }

  if (filter.parentRunId && run.parentRunId !== filter.parentRunId) {
    return false;
  }

  return true;
};

const matchesMemoryFilter = (
  entry: MemoryEntry,
  filter: MemoryEntryFilter = {}
): boolean => {
  if (filter.scope && entry.scope !== filter.scope) {
    return false;
  }

  if (filter.scopeId && entry.scopeId !== filter.scopeId) {
    return false;
  }

  if (filter.key && entry.key !== filter.key) {
    return false;
  }

  if (filter.sourceRunId && entry.sourceRunId !== filter.sourceRunId) {
    return false;
  }

  if (
    filter.sourceArtifactId &&
    entry.sourceArtifactId !== filter.sourceArtifactId
  ) {
    return false;
  }

  return true;
};

export interface AgentStore {
  runs: RunRepo;
  events: EventRepo;
  checkpoints: CheckpointRepo;
  artifacts: ArtifactRepo;
  memory: MemoryRepo;
  dispatches: DispatchRepo;
  engineStates: EngineStateRepo;
  threads: ThreadRepo;
  acpSessions: AcpSessionRepo;
  browserSessions: BrowserSessionRepo;
  loadRunSnapshot: (runId: string) => AgentStoreResult<RunSnapshot | null>;
}

export const createMemoryAgentStore = (): AgentStore => {
  const runs = new Map<string, Run>();
  const eventsByRun = new Map<string, RunEvent[]>();
  const checkpointsByRun = new Map<string, Map<string, Checkpoint>>();
  const artifactsByRun = new Map<string, Map<string, Artifact>>();
  const memoryEntries = new Map<string, MemoryEntry>();
  const runDispatches: RunDispatch[] = [];
  const engineStates = new Map<string, WorkflowEngineStateRecord>();
  const threads = new Map<string, AgentThread>();
  const acpSessions = new Map<string, AcpSessionRecord>();
  const browserSessions = new Map<string, BrowserSessionRecord>();
  let dispatchCount = 0;

  const runRepo: RunRepo = {
    createRun: (run) => {
      runs.set(run.id, run);
    },
    getRun: (runId) => runs.get(runId) ?? null,
    listRuns: (filter = {}) =>
      [...runs.values()]
        .filter((run) => matchesRunFilter(run, filter))
        .sort(byCreatedAt)
  };

  const eventRepo: EventRepo = {
    appendRunEvent: (event) => {
      const next = [...(eventsByRun.get(event.runId) ?? []), event].sort(bySequence);
      eventsByRun.set(event.runId, next);
    },
    listRunEvents: (runId) => [...(eventsByRun.get(runId) ?? [])].sort(bySequence)
  };

  const checkpointRepo: CheckpointRepo = {
    upsertCheckpoint: (checkpoint) => {
      const next = new Map(checkpointsByRun.get(checkpoint.runId) ?? []);
      next.set(checkpoint.id, checkpoint);
      checkpointsByRun.set(checkpoint.runId, next);
    },
    getCheckpoint: (checkpointId) =>
      [...checkpointsByRun.values()]
        .flatMap((items) => [...items.values()])
        .find((item) => item.id === checkpointId) ?? null,
    listRunCheckpoints: (runId) =>
      [...(checkpointsByRun.get(runId)?.values() ?? [])].sort(byCreatedAt),
    listCheckpointsByStatus: (status: CheckpointStatus) =>
      [...checkpointsByRun.values()]
        .flatMap((items) => [...items.values()])
        .filter((item) => item.status === status)
        .sort(byCreatedAt)
  };

  const artifactRepo: ArtifactRepo = {
    writeArtifact: (artifact) => {
      const next = new Map(artifactsByRun.get(artifact.runId) ?? []);
      next.set(artifact.id, artifact);
      artifactsByRun.set(artifact.runId, next);
    },
    getArtifact: (artifactId) =>
      [...artifactsByRun.values()]
        .flatMap((artifacts) => [...artifacts.values()])
        .find((artifact) => artifact.id === artifactId) ?? null,
    listRunArtifacts: (runId) =>
      [...(artifactsByRun.get(runId)?.values() ?? [])].sort(byCreatedAt)
  };

  const listMemoryEntries = (filter: MemoryEntryFilter = {}): MemoryEntry[] =>
    [...memoryEntries.values()]
      .filter((entry) => matchesMemoryFilter(entry, filter))
      .sort(byCreatedAt);

  const memoryRepo: MemoryRepo = {
    writeMemoryEntry: (entry) => {
      memoryEntries.set(entry.id, entry);
    },
    listMemoryEntries,
    listMemoryEntriesForRun: (runId) => listMemoryEntries({ sourceRunId: runId })
  };

  const dispatchRepo: DispatchRepo = {
    enqueueRun: (runId, createdAt = new Date().toISOString()) => {
      dispatchCount += 1;
      const dispatch: RunDispatch = {
        id: `dispatch_${dispatchCount}`,
        runId,
        createdAt
      };

      runDispatches.push(dispatch);

      return dispatch;
    },
    claimNextDispatch: ({
      workerId,
      claimedAt
    }: ClaimNextDispatchInput) => {
      const nextDispatch = runDispatches.find(
        (dispatch) => dispatch.workerId === undefined
      );

      if (!nextDispatch) {
        return null;
      }

      nextDispatch.workerId = workerId;
      nextDispatch.claimedAt = claimedAt;

      return {
        ...nextDispatch
      };
    },
    completeDispatch: (dispatchId) => {
      const dispatchIndex = runDispatches.findIndex(
        (dispatch) => dispatch.id === dispatchId
      );

      if (dispatchIndex >= 0) {
        runDispatches.splice(dispatchIndex, 1);
      }
    }
  };

  const engineStateRepo: EngineStateRepo = {
    upsertState: (state) => {
      engineStates.set(state.runId, state);
    },
    getState: (runId) => engineStates.get(runId) ?? null,
    deleteState: (runId) => {
      engineStates.delete(runId);
    }
  };

  const threadRepo: ThreadRepo = {
    createThread: (thread) => {
      threads.set(thread.id, thread);
    },
    getThread: (threadId) => threads.get(threadId) ?? null,
    listThreads: () => [...threads.values()].sort(byCreatedAt)
  };

  const acpSessionRepo: AcpSessionRepo = {
    upsertSession: (session) => {
      acpSessions.set(session.id, session);
    },
    getSession: (sessionId) => acpSessions.get(sessionId) ?? null,
    listSessions: (filter = {}) =>
      [...acpSessions.values()]
        .filter((session) => {
          if (filter.runId && session.runId !== filter.runId) {
            return false;
          }

          if (
            filter.status &&
            (session.status as AcpSessionStatus) !== filter.status
          ) {
            return false;
          }

          if (filter.agentRef && session.agentRef !== filter.agentRef) {
            return false;
          }

          if (filter.serviceRef && session.serviceRef !== filter.serviceRef) {
            return false;
          }

          if (filter.claimedBy && session.claimedBy !== filter.claimedBy) {
            return false;
          }

          return true;
        })
        .sort(byCreatedAt),
    deleteSession: (sessionId) => {
      acpSessions.delete(sessionId);
    }
  };

  const browserSessionRepo: BrowserSessionRepo = {
    createSession: (session) => {
      browserSessions.set(session.id, session);
    },
    getSession: (sessionId) => browserSessions.get(sessionId) ?? null,
    deleteSession: (sessionId) => {
      browserSessions.delete(sessionId);
    }
  };

  return {
    runs: runRepo,
    events: eventRepo,
    checkpoints: checkpointRepo,
    artifacts: artifactRepo,
    memory: memoryRepo,
    dispatches: dispatchRepo,
    engineStates: engineStateRepo,
    threads: threadRepo,
    acpSessions: acpSessionRepo,
    browserSessions: browserSessionRepo,
    loadRunSnapshot: async (runId) => {
      const run = await runRepo.getRun(runId);
      if (!run) {
        return null;
      }

      return {
        run,
        events: await eventRepo.listRunEvents(runId),
        checkpoints: await checkpointRepo.listRunCheckpoints(runId),
        artifacts: await artifactRepo.listRunArtifacts(runId),
        childRuns: await runRepo.listRuns({
          parentRunId: runId
        }),
        memoryEntries: await memoryRepo.listMemoryEntriesForRun(runId)
      };
    }
  };
};

export type * from "./repos/acp-session-repo";
export type * from "./repos/artifact-repo";
export type * from "./repos/browser-session-repo";
export type * from "./repos/checkpoint-repo";
export type * from "./repos/dispatch-repo";
export type * from "./repos/engine-state-repo";
export type * from "./repos/event-repo";
export type * from "./repos/memory-repo";
export type * from "./repos/run-repo";
export type * from "./repos/thread-repo";

export const packageName = "@geohelper/agent-store";

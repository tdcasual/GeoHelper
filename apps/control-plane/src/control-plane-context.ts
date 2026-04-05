import { createPlatformRuntimeContext, type PlatformRuntimeContext } from "@geohelper/agent-core";
import { createGeometryPlatformBootstrap } from "@geohelper/agent-domain-geometry";
import type {
  Checkpoint,
  CheckpointStatus,
  PlatformAgentDefinition,
  PlatformRunProfile,
  RunBudget,
  RunEvent
} from "@geohelper/agent-protocol";
import {
  type AgentStore,
  createMemoryAgentStore,
  createSqliteAgentStore} from "@geohelper/agent-store";
import {
  createWorkerRuntime,
  type WorkerToolRegistration
} from "@geohelper/worker";

interface PlatformToolCatalogRegistration extends WorkerToolRegistration {
  permissions?: string[];
  retryable?: boolean;
}

export interface ControlPlaneThread {
  id: string;
  title: string;
  createdAt: string;
}

export interface BrowserSession {
  id: string;
  runId: string;
  allowedToolNames: string[];
  createdAt: string;
}

export interface ControlPlaneServices {
  store: AgentStore;
  threads: Map<string, ControlPlaneThread>;
  browserSessions: Map<string, BrowserSession>;
  platformRuntime: PlatformRuntimeContext<
    PlatformAgentDefinition,
    PlatformToolCatalogRegistration,
    unknown
  >;
  runProfiles: Map<string, PlatformRunProfile>;
  now: () => string;
  buildThreadId: () => string;
  buildRunId: () => string;
  buildEventId: () => string;
  buildBrowserSessionId: () => string;
  processRun: (runId: string) => Promise<void>;
  resumeRunFromCheckpoint: (input: {
    runId: string;
    checkpointId: string;
    response: unknown;
  }) => Promise<void>;
  resumeRunFromBrowserTool: (input: {
    runId: string;
    checkpointId: string;
    output: unknown;
  }) => Promise<void>;
}

export const DEFAULT_RUN_BUDGET: RunBudget = {
  maxModelCalls: 6,
  maxToolCalls: 8,
  maxDurationMs: 120000
};

const createIdFactory = (prefix: string): (() => string) => {
  let count = 0;

  return () => {
    count += 1;
    return `${prefix}_${count}`;
  };
};

export const createControlPlaneStoreFromEnv = (
  env: NodeJS.ProcessEnv = process.env
): AgentStore => {
  const sqlitePath = env.GEOHELPER_AGENT_STORE_SQLITE_PATH?.trim();

  if (sqlitePath) {
    return createSqliteAgentStore({
      path: sqlitePath
    });
  }

  return createMemoryAgentStore();
};

export const createControlPlaneServices = (
  overrides: Partial<ControlPlaneServices> = {}
): ControlPlaneServices => {
  const store = overrides.store ?? createControlPlaneStoreFromEnv();
  const platformRuntime =
    overrides.platformRuntime ??
    createPlatformRuntimeContext(createGeometryPlatformBootstrap());
  const workerRuntime = createWorkerRuntime({
    store,
    platformRuntime
  });

  const processRun =
    overrides.processRun ??
    (async (runId: string): Promise<void> => {
      workerRuntime.runLoop.enqueue(runId);
      await workerRuntime.runLoop.tick();
    });

  const resumeRunFromCheckpoint =
    overrides.resumeRunFromCheckpoint ??
    (async ({
      runId,
      checkpointId,
      response
    }: {
      runId: string;
      checkpointId: string;
      response: unknown;
    }): Promise<void> => {
      workerRuntime.runLoop.submitCheckpointResolution({
        runId,
        checkpointId,
        response
      });
      workerRuntime.runLoop.enqueue(runId);
      await workerRuntime.runLoop.tick();
    });

  const resumeRunFromBrowserTool =
    overrides.resumeRunFromBrowserTool ??
    (async ({
      runId,
      checkpointId,
      output
    }: {
      runId: string;
      checkpointId: string;
      output: unknown;
    }): Promise<void> => {
      workerRuntime.runLoop.submitBrowserToolResult({
        runId,
        checkpointId,
        output
      });
      workerRuntime.runLoop.enqueue(runId);
      await workerRuntime.runLoop.tick();
    });

  return {
    store,
    threads: overrides.threads ?? new Map(),
    browserSessions: overrides.browserSessions ?? new Map(),
    platformRuntime,
    runProfiles: overrides.runProfiles ?? platformRuntime.runProfiles,
    now: overrides.now ?? (() => new Date().toISOString()),
    buildThreadId: overrides.buildThreadId ?? createIdFactory("thread"),
    buildRunId: overrides.buildRunId ?? createIdFactory("run"),
    buildEventId: overrides.buildEventId ?? createIdFactory("event"),
    buildBrowserSessionId:
      overrides.buildBrowserSessionId ?? createIdFactory("browser_session"),
    processRun,
    resumeRunFromCheckpoint,
    resumeRunFromBrowserTool
  };
};

export const appendRunEvent = async (
  services: ControlPlaneServices,
  runId: string,
  type: string,
  payload: Record<string, unknown>
): Promise<RunEvent> => {
  const existingEvents = await services.store.events.listRunEvents(runId);
  const event: RunEvent = {
    id: services.buildEventId(),
    runId,
    sequence: existingEvents.length + 1,
    type,
    payload,
    createdAt: services.now()
  };

  await services.store.events.appendRunEvent(event);

  return event;
};

export const findCheckpointById = async (
  services: ControlPlaneServices,
  checkpointId: string
): Promise<Checkpoint | null> => {
  const statuses: CheckpointStatus[] = [
    "pending",
    "resolved",
    "expired",
    "cancelled"
  ];

  for (const status of statuses) {
    const checkpoint = (
      await services.store.checkpoints.listCheckpointsByStatus(status)
    ).find((item) => item.id === checkpointId);

    if (checkpoint) {
      return checkpoint;
    }
  }

  return null;
};

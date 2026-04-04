import type {
  Checkpoint,
  CheckpointStatus,
  RunBudget,
  RunEvent} from "@geohelper/agent-protocol";
import { type AgentStore,createMemoryAgentStore } from "@geohelper/agent-store";

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
  now: () => string;
  buildThreadId: () => string;
  buildRunId: () => string;
  buildEventId: () => string;
  buildBrowserSessionId: () => string;
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

export const createControlPlaneServices = (
  overrides: Partial<ControlPlaneServices> = {}
): ControlPlaneServices => ({
  store: overrides.store ?? createMemoryAgentStore(),
  threads: overrides.threads ?? new Map(),
  browserSessions: overrides.browserSessions ?? new Map(),
  now: overrides.now ?? (() => new Date().toISOString()),
  buildThreadId: overrides.buildThreadId ?? createIdFactory("thread"),
  buildRunId: overrides.buildRunId ?? createIdFactory("run"),
  buildEventId: overrides.buildEventId ?? createIdFactory("event"),
  buildBrowserSessionId:
    overrides.buildBrowserSessionId ?? createIdFactory("browser_session")
});

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

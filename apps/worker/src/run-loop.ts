import {
  createWorkflowEngine,
  type NodeHandler,
  type NodeHandlerMap,
  type PlatformRuntimeContext,
  type WorkflowEngineState,
  type WorkflowExecutionResult
} from "@geohelper/agent-core";
import type {
  PlatformAgentDefinition,
  PlatformRunResolutionFailureReason,
  Run,
  RunEvent
} from "@geohelper/agent-protocol";
import { type CheckpointKind,CheckpointSchema } from "@geohelper/agent-protocol";
import type { AgentStore } from "@geohelper/agent-store";

import {
  type BrowserToolDispatch,
  type BrowserToolResult,
  createBrowserToolDispatch} from "./browser-tool-dispatch";
import { createModelDispatch } from "./model-dispatch";

export interface WorkerToolRegistration {
  name: string;
  kind: string;
}

export interface CheckpointResolution {
  runId: string;
  checkpointId: string;
  response: unknown;
}

export interface RunLoopOptions {
  store: AgentStore;
  platformRuntime: PlatformRuntimeContext<
    PlatformAgentDefinition,
    WorkerToolRegistration,
    unknown
  >;
  handlers?: NodeHandlerMap;
  browserToolDispatch?: BrowserToolDispatch;
  now?: () => string;
  buildCheckpointId?: () => string;
}

const defaultNow = (): string => new Date().toISOString();

const createCheckpointIdFactory = (): (() => string) => {
  let count = 0;

  return () => {
    count += 1;
    return `checkpoint_${count}`;
  };
};

const createToolHandler = (
  tools: Record<string, WorkerToolRegistration>,
  now: () => string,
  buildCheckpointId: () => string
): NodeHandler => async ({ run, node }) => {
  const toolName =
    typeof node.config.toolName === "string" ? node.config.toolName : node.id;
  const tool = tools[toolName];

  if (tool?.kind === "browser_tool") {
    return {
      type: "checkpoint",
      checkpoint: CheckpointSchema.parse({
        id: buildCheckpointId(),
        runId: run.id,
        nodeId: node.id,
        kind: "tool_result",
        status: "pending",
        title: `Await browser tool: ${toolName}`,
        prompt: `Wait for browser tool ${toolName} to finish.`,
        createdAt: now()
      })
    };
  }

  return {
    type: "continue"
  };
};

const createCheckpointHandler = (
  now: () => string,
  buildCheckpointId: () => string
): NodeHandler => async ({ run, node }) => {
  const checkpointKind =
    typeof node.config.checkpointKind === "string"
      ? (node.config.checkpointKind as CheckpointKind)
      : "human_input";

  return {
    type: "checkpoint",
    checkpoint: CheckpointSchema.parse({
      id: buildCheckpointId(),
      runId: run.id,
      nodeId: node.id,
      kind: checkpointKind,
      status: "pending",
      title: node.name,
      prompt: `Resolve checkpoint "${node.name}" to continue the run.`,
      createdAt: now()
    })
  };
};

const mapExecutionStatusToRunStatus = (
  status: WorkflowExecutionResult["status"]
): Run["status"] => {
  if (status === "completed") {
    return "completed";
  }

  if (status === "failed") {
    return "failed";
  }

  return "waiting_for_checkpoint";
};

export const createRunLoop = ({
  store,
  platformRuntime,
  handlers = {},
  browserToolDispatch = createBrowserToolDispatch(),
  now = defaultNow,
  buildCheckpointId = createCheckpointIdFactory()
}: RunLoopOptions) => {
  const queue: string[] = [];
  const pausedStates = new Map<string, WorkflowEngineState>();
  const persistedEngineEventCounts = new Map<string, number>();
  const checkpointResolutions = new Map<string, CheckpointResolution>();
  const engine = createWorkflowEngine({
    now,
    handlers: createModelDispatch({
      tool: createToolHandler(
        platformRuntime.tools,
        now,
        buildCheckpointId
      ),
      checkpoint: createCheckpointHandler(now, buildCheckpointId),
      ...handlers
    })
  });

  const persistExecutionEvents = async (
    runId: string,
    events: RunEvent[]
  ): Promise<void> => {
    const alreadyPersisted = persistedEngineEventCounts.get(runId) ?? 0;
    const nextEvents = events.slice(alreadyPersisted);

    if (nextEvents.length === 0) {
      return;
    }

    const storedEvents = await store.events.listRunEvents(runId);
    let nextSequence = storedEvents.length + 1;

    for (const event of nextEvents) {
      await store.events.appendRunEvent({
        ...event,
        id: `event_${nextSequence}`,
        sequence: nextSequence
      });
      nextSequence += 1;
    }

    persistedEngineEventCounts.set(runId, events.length);
  };

  const persistRunStatus = async (
    run: Run,
    status: Run["status"]
  ): Promise<Run> => {
    const updatedRun: Run = {
      ...run,
      status,
      updatedAt: now()
    };

    await store.runs.createRun(updatedRun);

    return updatedRun;
  };

  const failRun = async (
    run: Run,
    reason:
      | PlatformRunResolutionFailureReason
      | NonNullable<WorkflowExecutionResult["failureReason"]>,
    missingName?: string
  ): Promise<WorkflowExecutionResult> => {
    const storedEvents = await store.events.listRunEvents(run.id);
    const failureEvent: RunEvent = {
      id: `event_${storedEvents.length + 1}`,
      runId: run.id,
      sequence: storedEvents.length + 1,
      type: "run.failed",
      payload: {
        reason,
        profileId: run.profileId,
        ...(missingName ? { missingName } : {})
      },
      createdAt: now()
    };

    await store.events.appendRunEvent(failureEvent);
    await persistRunStatus(run, "failed");

    return {
      status: "failed",
      visitedNodeIds: [],
      events: [...storedEvents, failureEvent],
      spawnedRunIds: [],
      failureReason: reason
    };
  };

  const resolvePendingBrowserCheckpoint = async (
    resolution: CheckpointResolution
  ): Promise<void> => {
    const pendingCheckpoint = (
      await store.checkpoints.listCheckpointsByStatus("pending")
    ).find((checkpoint) => checkpoint.id === resolution.checkpointId);

    if (!pendingCheckpoint) {
      return;
    }

    await store.checkpoints.upsertCheckpoint({
      ...pendingCheckpoint,
      status: "resolved",
      response: resolution.response,
      resolvedAt: now()
    });
  };

  return {
    enqueue: (runId: string): void => {
      queue.push(runId);
    },
    claimNextRun: (): string | null => queue.shift() ?? null,
    submitCheckpointResolution: (resolution: CheckpointResolution): void => {
      checkpointResolutions.set(resolution.runId, resolution);
    },
    submitBrowserToolResult: (result: BrowserToolResult): void => {
      browserToolDispatch.submitResult(result);
    },
    tick: async (): Promise<WorkflowExecutionResult | null> => {
      const runId = queue.shift();
      if (!runId) {
        return null;
      }

      const run = await store.runs.getRun(runId);
      if (!run) {
        return null;
      }

      const resolution = platformRuntime.resolveRun(run);
      if (!resolution.ok) {
        return failRun(run, resolution.reason, resolution.missingName);
      }

      if (run.status === "waiting_for_checkpoint") {
        const pausedState = pausedStates.get(runId);
        let checkpointResolution = checkpointResolutions.get(runId) ?? null;

        if (!pausedState) {
          return null;
        }

        if (checkpointResolution) {
          checkpointResolutions.delete(runId);
        } else {
          const browserResult = browserToolDispatch.consumeResult(runId);

          checkpointResolution = browserResult
            ? {
                runId: browserResult.runId,
                checkpointId: browserResult.checkpointId,
                response: browserResult.output
              }
            : null;
        }

        if (!checkpointResolution) {
          return null;
        }

        await resolvePendingBrowserCheckpoint(checkpointResolution);

        const result = await engine.resume({
          state: pausedState,
          resolution: {
            checkpointId: checkpointResolution.checkpointId,
            response: checkpointResolution.response
          }
        });

        await persistExecutionEvents(runId, result.events);
        await persistRunStatus(run, mapExecutionStatusToRunStatus(result.status));

        if (result.status === "waiting_for_checkpoint" && result.state) {
          pausedStates.set(runId, result.state);
          if (result.pendingCheckpoint) {
            await store.checkpoints.upsertCheckpoint(result.pendingCheckpoint);
          }
        } else {
          pausedStates.delete(runId);
          persistedEngineEventCounts.delete(runId);
        }

        return result;
      }

      const result = await engine.execute({
        run,
        workflow: resolution.value.workflow
      });

      await persistExecutionEvents(runId, result.events);
      await persistRunStatus(run, mapExecutionStatusToRunStatus(result.status));

      if (result.status === "waiting_for_checkpoint" && result.state) {
        pausedStates.set(runId, result.state);
        if (result.pendingCheckpoint) {
          await store.checkpoints.upsertCheckpoint(result.pendingCheckpoint);
        }
      } else {
        pausedStates.delete(runId);
        persistedEngineEventCounts.delete(runId);
      }

      return result;
    }
  };
};

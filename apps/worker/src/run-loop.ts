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
  type BrowserToolResult
} from "./browser-tool-dispatch";
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
  now?: () => string;
  buildCheckpointId?: () => string;
  workerId?: string;
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

const readSync = <T>(value: T | Promise<T>): T => value as T;

export const createRunLoop = ({
  store,
  platformRuntime,
  handlers = {},
  now = defaultNow,
  buildCheckpointId = createCheckpointIdFactory(),
  workerId = "worker_local"
}: RunLoopOptions) => {
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
    events: RunEvent[],
    alreadyPersisted = 0
  ): Promise<void> => {
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
    await store.engineStates.deleteState(run.id);

    return {
      status: "failed",
      visitedNodeIds: [],
      events: [...storedEvents, failureEvent],
      spawnedRunIds: [],
      failureReason: reason
    };
  };

  const persistWaitingState = async (
    runId: string,
    state: WorkflowEngineState,
    pendingCheckpointId: string
  ): Promise<void> => {
    await store.engineStates.upsertState({
      runId,
      nextNodeId: state.nextNodeId,
      visitedNodeIds: state.visitedNodeIds,
      emittedEventCount: state.events.length,
      spawnedRunIds: state.spawnedRunIds,
      budgetUsage: state.budgetUsage,
      pendingCheckpointId,
      updatedAt: now()
    });
  };

  const resolvePendingBrowserCheckpoint = (result: BrowserToolResult): void => {
    const pendingCheckpoint = readSync(
      store.checkpoints.getCheckpoint(result.checkpointId)
    );

    if (!pendingCheckpoint || pendingCheckpoint.status !== "pending") {
      return;
    }

    void readSync(
      store.checkpoints.upsertCheckpoint({
      ...pendingCheckpoint,
      status: "resolved",
      response: result.output,
      resolvedAt: now()
      })
    );
  };

  const rehydrateWaitingState = async (
    run: Run,
    workflow: WorkflowEngineState["workflow"]
  ): Promise<{
    state: WorkflowEngineState;
    resolution: CheckpointResolution;
    emittedEventCount: number;
  } | null> => {
    const storedState = await store.engineStates.getState(run.id);

    if (!storedState) {
      return null;
    }

    const pendingCheckpoint = await store.checkpoints.getCheckpoint(
      storedState.pendingCheckpointId
    );

    if (!pendingCheckpoint || pendingCheckpoint.status !== "resolved") {
      return null;
    }

    return {
      state: {
        run,
        workflow,
        nextNodeId: storedState.nextNodeId,
        visitedNodeIds: storedState.visitedNodeIds,
        events: await store.events.listRunEvents(run.id),
        spawnedRunIds: storedState.spawnedRunIds,
        budgetUsage: storedState.budgetUsage,
        pendingCheckpoint
      },
      resolution: {
        runId: run.id,
        checkpointId: pendingCheckpoint.id,
        response: pendingCheckpoint.response
      },
      emittedEventCount: storedState.emittedEventCount
    };
  };

  return {
    enqueue: (runId: string): void => {
      void store.dispatches.enqueueRun(runId, now());
    },
    claimNextRun: (): string | null =>
      readSync(
        store.dispatches.claimNextDispatch({
        workerId,
        claimedAt: now()
        })
      )?.runId ?? null,
    submitCheckpointResolution: (_resolution: CheckpointResolution): void => {},
    submitBrowserToolResult: (result: BrowserToolResult): void => {
      resolvePendingBrowserCheckpoint(result);
    },
    tick: async (): Promise<WorkflowExecutionResult | null> => {
      const dispatch = await store.dispatches.claimNextDispatch({
        workerId,
        claimedAt: now()
      });

      if (!dispatch) {
        return null;
      }

      try {
        const run = await store.runs.getRun(dispatch.runId);
        if (!run) {
          return null;
        }

        const resolution = platformRuntime.resolveRun(run);
        if (!resolution.ok) {
          return failRun(run, resolution.reason, resolution.missingName);
        }

        if (run.status === "waiting_for_checkpoint") {
          const resumedState = await rehydrateWaitingState(
            run,
            resolution.value.workflow
          );

          if (!resumedState) {
            return null;
          }

          const result = await engine.resume({
            state: resumedState.state,
            resolution: {
              checkpointId: resumedState.resolution.checkpointId,
              response: resumedState.resolution.response
            }
          });

          await persistExecutionEvents(
            run.id,
            result.events,
            resumedState.emittedEventCount
          );
          await persistRunStatus(run, mapExecutionStatusToRunStatus(result.status));

          if (result.status === "waiting_for_checkpoint" && result.state) {
            if (result.pendingCheckpoint) {
              await store.checkpoints.upsertCheckpoint(result.pendingCheckpoint);
              await persistWaitingState(
                run.id,
                result.state,
                result.pendingCheckpoint.id
              );
            }
          } else {
            await store.engineStates.deleteState(run.id);
          }

          return result;
        }

        const result = await engine.execute({
          run,
          workflow: resolution.value.workflow
        });

        await persistExecutionEvents(run.id, result.events);
        await persistRunStatus(run, mapExecutionStatusToRunStatus(result.status));

        if (result.status === "waiting_for_checkpoint" && result.state) {
          if (result.pendingCheckpoint) {
            await store.checkpoints.upsertCheckpoint(result.pendingCheckpoint);
            await persistWaitingState(
              run.id,
              result.state,
              result.pendingCheckpoint.id
            );
          }
        } else {
          await store.engineStates.deleteState(run.id);
        }

        return result;
      } finally {
        await store.dispatches.completeDispatch(dispatch.id);
      }
    }
  };
};

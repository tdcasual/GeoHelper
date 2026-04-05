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
import { CheckpointSchema } from "@geohelper/agent-protocol";
import type { AgentStore } from "@geohelper/agent-store";

import {
  type BrowserToolDispatch,
  type BrowserToolResult,
  createBrowserToolDispatch} from "./browser-tool-dispatch";
import { createModelDispatch } from "./model-dispatch";

export interface RunLoopOptions {
  store: AgentStore;
  platformRuntime: PlatformRuntimeContext<
    PlatformAgentDefinition,
    unknown,
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
  now: () => string,
  buildCheckpointId: () => string
): NodeHandler => async ({ run, node }) => {
  const toolKind =
    typeof node.config.toolKind === "string" ? node.config.toolKind : null;
  const toolName =
    typeof node.config.toolName === "string" ? node.config.toolName : node.id;

  if (toolKind === "browser_tool") {
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
  const engine = createWorkflowEngine({
    now,
    handlers: createModelDispatch({
      tool: createToolHandler(now, buildCheckpointId),
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
    result: BrowserToolResult
  ): Promise<void> => {
    const pendingCheckpoint = (
      await store.checkpoints.listCheckpointsByStatus("pending")
    ).find((checkpoint) => checkpoint.id === result.checkpointId);

    if (!pendingCheckpoint) {
      return;
    }

    await store.checkpoints.upsertCheckpoint({
      ...pendingCheckpoint,
      status: "resolved",
      response: result.output,
      resolvedAt: now()
    });
  };

  return {
    enqueue: (runId: string): void => {
      queue.push(runId);
    },
    claimNextRun: (): string | null => queue.shift() ?? null,
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
        const browserResult = browserToolDispatch.consumeResult(runId);

        if (!pausedState || !browserResult) {
          return null;
        }

        await resolvePendingBrowserCheckpoint(browserResult);

        const result = await engine.resume({
          state: pausedState,
          resolution: {
            checkpointId: browserResult.checkpointId,
            response: browserResult.output
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

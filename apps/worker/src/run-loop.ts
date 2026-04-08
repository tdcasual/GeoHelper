import { randomUUID } from "node:crypto";

import {
  type LoadedPortableAgentBundle,
  loadPortableAgentBundleFromFs} from "@geohelper/agent-bundle";
import {
  createBundleBackedContextAssembler
} from "@geohelper/agent-context";
import {
  createWorkflowEngine,
  type NodeHandler,
  type NodeHandlerMap,
  type PlatformRuntimeContext,
  type WorkflowCheckpointResolution,
  type WorkflowEngineState,
  type WorkflowExecutionResult
} from "@geohelper/agent-core";
import {
  createEvaluatorDriver,
  createPlatformNodeHandlers,
  type PlatformNodeHandlerOptions
} from "@geohelper/agent-intelligence";
import type {
  Artifact,
  PlatformAgentDefinition,
  PlatformRunResolutionFailureReason,
  Run,
  RunEvent
} from "@geohelper/agent-protocol";
import {
  ArtifactSchema,
  type CheckpointKind,
  CheckpointSchema
} from "@geohelper/agent-protocol";
import {
  resolveBundleDelegation,
  resolveDelegationRunProfileId
} from "@geohelper/agent-sdk";
import type { AgentStore } from "@geohelper/agent-store";

import {
  type BrowserToolResult
} from "./browser-tool-dispatch";

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
  intelligence?: PlatformNodeHandlerOptions;
  now?: () => string;
  buildCheckpointId?: () => string;
  workerId?: string;
}

const defaultNow = (): string => new Date().toISOString();

const createCheckpointIdFactory = (): (() => string) => {
  return () => `checkpoint_${randomUUID()}`;
};

const buildRunEventId = (runId: string, sequence: number): string =>
  `event_${runId}_${sequence}`;

const buildSubagentRunId = (parentRunId: string, nodeId: string): string =>
  `run_child_${parentRunId}_${nodeId}`;

const buildAcpSessionId = (runId: string, nodeId: string): string =>
  `acp_session_${runId}_${nodeId}`;

const parseInputArtifactIds = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.filter(
    (artifactId): artifactId is string =>
      typeof artifactId === "string" && artifactId.length > 0
  );
};

const isTerminalRunStatus = (status: Run["status"]): boolean =>
  status === "completed" || status === "failed" || status === "cancelled";

const mergeArtifactIds = (
  existingArtifactIds: string[],
  nextArtifactIds: string[]
): string[] => [...new Set([...existingArtifactIds, ...nextArtifactIds])];

const buildBrowserToolArtifactId = (runId: string, nodeId: string): string =>
  `artifact_browser_tool_result_${runId}_${nodeId}`;

const createBrowserToolArtifact = (input: {
  runId: string;
  nodeId: string;
  toolName: string;
  checkpointId: string;
  output: unknown;
  createdAt: string;
}): Artifact => {
  const parsed = ArtifactSchema.safeParse(input.output);

  if (parsed.success) {
    return parsed.data;
  }

  return ArtifactSchema.parse({
    id: buildBrowserToolArtifactId(input.runId, input.nodeId),
    runId: input.runId,
    kind: "tool_result",
    contentType: "application/json",
    storage: "inline",
    inlineData: input.output,
    metadata: {
      toolName: input.toolName,
      sourceCheckpointId: input.checkpointId
    },
    createdAt: input.createdAt
  });
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
        metadata: {
          toolName
        },
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

const createSubagentHandler = (
  store: AgentStore,
  platformRuntime: PlatformRuntimeContext<
    PlatformAgentDefinition,
    WorkerToolRegistration,
    unknown
  >,
  now: () => string,
  buildCheckpointId: () => string,
  resolveBundle: (run: Run) => LoadedPortableAgentBundle | null
): NodeHandler => async ({ run, node }) => {
  const delegationName =
    typeof node.config.delegation === "string"
      ? node.config.delegation
      : typeof node.config.delegationName === "string"
        ? node.config.delegationName
        : null;
  const delegation = resolveBundleDelegation({
    bundle: resolveBundle(run),
    delegationName,
    nodeId: node.id
  });

  if (!delegation.ok) {
    return {
      type: "fail",
      reason: "delegation_error",
      message: delegation.message
    };
  }

  if (delegation.value.mode === "acp-agent") {
    const createdAt = now();
    const checkpoint = CheckpointSchema.parse({
      id: buildCheckpointId(),
      runId: run.id,
      nodeId: node.id,
      kind: "human_input",
      status: "pending",
      title: `Await ACP delegation: ${delegation.value.name}`,
      prompt: `Resolve ACP delegation ${delegation.value.name} to continue the run.`,
      metadata: {
        delegationMode: delegation.value.mode,
        delegationName: delegation.value.name,
        agentRef: delegation.value.agentRef,
        serviceRef: delegation.value.serviceRef,
        acpSessionId: buildAcpSessionId(run.id, node.id)
      },
      createdAt
    });

    await store.acpSessions.upsertSession({
      id: buildAcpSessionId(run.id, node.id),
      runId: run.id,
      checkpointId: checkpoint.id,
      delegationName: delegation.value.name,
      agentRef: delegation.value.agentRef ?? "",
      serviceRef: delegation.value.serviceRef,
      status: "pending",
      outputArtifactIds: [],
      createdAt,
      updatedAt: createdAt
    });

    return {
      type: "checkpoint",
      checkpoint
    };
  }

  if (delegation.value.mode === "host-service") {
    return {
      type: "checkpoint",
      checkpoint: CheckpointSchema.parse({
        id: buildCheckpointId(),
        runId: run.id,
        nodeId: node.id,
        kind: "human_input",
        status: "pending",
        title: `Await host delegation: ${delegation.value.name}`,
        prompt: `Resolve host delegation ${delegation.value.name} to continue the run.`,
        metadata: {
          delegationMode: delegation.value.mode,
          delegationName: delegation.value.name,
          agentRef: delegation.value.agentRef,
          serviceRef: delegation.value.serviceRef
        },
        createdAt: now()
      })
    };
  }

  const runProfileResolution = resolveDelegationRunProfileId({
    delegation: delegation.value,
    runProfiles: platformRuntime.runProfiles
  });

  if (!runProfileResolution.ok) {
    return {
      type: "fail",
      reason: "delegation_error",
      message: runProfileResolution.message
    };
  }

  const runProfileId = runProfileResolution.runProfileId;

  const childRunId = buildSubagentRunId(run.id, node.id);
  const existingChildRun = await store.runs.getRun(childRunId);

  if (!existingChildRun) {
    const childProfile = platformRuntime.runProfiles.get(runProfileId);
    const inputArtifactIds =
      parseInputArtifactIds(node.config.inputArtifactIds) ??
      run.inputArtifactIds;
    const timestamp = now();

    await store.runs.createRun({
      id: childRunId,
      threadId: run.threadId,
      profileId: runProfileId,
      status: "queued",
      parentRunId: run.id,
      inputArtifactIds,
      outputArtifactIds: [],
      budget: childProfile?.defaultBudget ?? run.budget,
      createdAt: timestamp,
      updatedAt: timestamp
    });
    await store.dispatches.enqueueRun(childRunId, timestamp);
  }

  return {
    type: "spawn_subagent",
    childRunId,
    waitForCompletion: delegation.value.awaitCompletion
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

  if (status === "waiting_for_subagent") {
    return "waiting_for_subagent";
  }

  return "waiting_for_checkpoint";
};

const readSync = <T>(value: T | Promise<T>): T => value as T;

export const createRunLoop = ({
  store,
  platformRuntime,
  handlers = {},
  intelligence,
  now = defaultNow,
  buildCheckpointId = createCheckpointIdFactory(),
  workerId = "worker_local"
}: RunLoopOptions) => {
  const resolvePortableBundle = (() => {
    const cache = new Map<string, LoadedPortableAgentBundle>();

    return (run: Run): LoadedPortableAgentBundle | null => {
      const resolution = platformRuntime.resolveRun(run);

      if (!resolution.ok) {
        return null;
      }

      const rootDir = resolution.value.agent.bundle?.rootDir;

      if (!rootDir) {
        return null;
      }

      const cached = cache.get(rootDir);

      if (cached) {
        return cached;
      }

      const bundle = loadPortableAgentBundleFromFs(rootDir);
      cache.set(rootDir, bundle);

      return bundle;
    };
  })();
  const contextAssembler =
    intelligence?.contextAssembler ??
    createBundleBackedContextAssembler({
      store,
      tools: platformRuntime.tools,
      resolveBundle: (input) => resolvePortableBundle(input.run)
    });
  const defaultEvaluatorDriver = createEvaluatorDriver({
    evaluators: platformRuntime.evaluators as Record<string, any>,
    writeArtifact: (artifact) => store.artifacts.writeArtifact(artifact),
    now
  });
  const engine = createWorkflowEngine({
    now,
    handlers: {
      ...createPlatformNodeHandlers({
        ...intelligence,
        writeArtifact: (artifact) => store.artifacts.writeArtifact(artifact),
        now,
        drivers: {
          evaluator: intelligence?.drivers?.evaluator ?? defaultEvaluatorDriver,
          ...intelligence?.drivers
        },
        contextAssembler
      }),
      tool: createToolHandler(
        platformRuntime.tools,
        now,
        buildCheckpointId
      ),
      checkpoint: createCheckpointHandler(now, buildCheckpointId),
      subagent: createSubagentHandler(
        store,
        platformRuntime,
        now,
        buildCheckpointId,
        resolvePortableBundle
      ),
      ...handlers
    }
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
        id: buildRunEventId(runId, nextSequence),
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
    const nextSequence = storedEvents.length + 1;
    const failureEvent: RunEvent = {
      id: buildRunEventId(run.id, nextSequence),
      runId: run.id,
      sequence: nextSequence,
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
    state: WorkflowEngineState
  ): Promise<void> => {
    await store.engineStates.upsertState({
      runId,
      nextNodeId: state.nextNodeId,
      visitedNodeIds: state.visitedNodeIds,
      emittedEventCount: state.events.length,
      spawnedRunIds: state.spawnedRunIds,
      budgetUsage: state.budgetUsage,
      pendingCheckpointId: state.pendingCheckpoint?.id,
      pendingChildRunId: state.pendingSubagentRunId,
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

    if (pendingCheckpoint.kind === "tool_result") {
      const toolName =
        typeof pendingCheckpoint.metadata?.toolName === "string"
          ? (pendingCheckpoint.metadata.toolName as string)
          : pendingCheckpoint.nodeId;
      const artifact = createBrowserToolArtifact({
        runId: result.runId,
        nodeId: pendingCheckpoint.nodeId,
        toolName,
        checkpointId: pendingCheckpoint.id,
        output: result.output,
        createdAt: now()
      });
      const run = readSync(store.runs.getRun(result.runId));

      void readSync(store.artifacts.writeArtifact(artifact));

      if (run) {
        void readSync(
          store.runs.createRun({
            ...run,
            outputArtifactIds: mergeArtifactIds(run.outputArtifactIds, [
              artifact.id
            ]),
            updatedAt: now()
          })
        );
      }
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
    resolution: WorkflowCheckpointResolution;
    emittedEventCount: number;
  } | null> => {
    const storedState = await store.engineStates.getState(run.id);

    if (!storedState || !storedState.pendingCheckpointId) {
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
        kind: "checkpoint",
        checkpointId: pendingCheckpoint.id,
        response: pendingCheckpoint.response
      },
      emittedEventCount: storedState.emittedEventCount
    };
  };

  const rehydrateWaitingSubagentState = async (
    run: Run,
    workflow: WorkflowEngineState["workflow"]
  ): Promise<{
    state: WorkflowEngineState;
    resolution: {
      kind: "subagent";
      childRunId: string;
      status: Run["status"];
      outputArtifactIds: string[];
    };
    emittedEventCount: number;
  } | null> => {
    const storedState = await store.engineStates.getState(run.id);

    if (!storedState || !storedState.pendingChildRunId) {
      return null;
    }

    const childRun = await store.runs.getRun(storedState.pendingChildRunId);

    if (!childRun || !isTerminalRunStatus(childRun.status)) {
      return null;
    }

    return {
      state: {
        run:
          childRun.status === "completed"
            ? {
                ...run,
                inputArtifactIds: mergeArtifactIds(
                  run.inputArtifactIds,
                  childRun.outputArtifactIds
                )
              }
            : run,
        workflow,
        nextNodeId: storedState.nextNodeId,
        visitedNodeIds: storedState.visitedNodeIds,
        events: await store.events.listRunEvents(run.id),
        spawnedRunIds: storedState.spawnedRunIds,
        budgetUsage: storedState.budgetUsage,
        pendingSubagentRunId: childRun.id
      },
      resolution: {
        kind: "subagent",
        childRunId: childRun.id,
        status: childRun.status,
        outputArtifactIds: childRun.outputArtifactIds
      },
      emittedEventCount: storedState.emittedEventCount
    };
  };

  const persistResultState = async (
    runId: string,
    result: WorkflowExecutionResult
  ): Promise<void> => {
    if (
      (result.status === "waiting_for_checkpoint" ||
        result.status === "waiting_for_subagent") &&
      result.state
    ) {
      if (result.pendingCheckpoint) {
        await store.checkpoints.upsertCheckpoint(result.pendingCheckpoint);
      }

      await persistWaitingState(runId, result.state);
      return;
    }

    await store.engineStates.deleteState(runId);
  };

  const enqueueParentRunIfReady = async (run: Run): Promise<void> => {
    if (!run.parentRunId || !isTerminalRunStatus(run.status)) {
      return;
    }

    const parentRun = await store.runs.getRun(run.parentRunId);

    if (!parentRun || parentRun.status !== "waiting_for_subagent") {
      return;
    }

    const parentState = await store.engineStates.getState(parentRun.id);

    if (!parentState || parentState.pendingChildRunId !== run.id) {
      return;
    }

    await store.dispatches.enqueueRun(parentRun.id, now());
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
        if (isTerminalRunStatus(run.status)) {
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
            resolution: resumedState.resolution
          });

          await persistExecutionEvents(
            run.id,
            result.events,
            resumedState.emittedEventCount
          );
          const updatedRun = await persistRunStatus(
            resumedState.state.run,
            mapExecutionStatusToRunStatus(result.status)
          );
          await persistResultState(run.id, result);
          await enqueueParentRunIfReady(updatedRun);

          return result;
        }

        if (run.status === "waiting_for_subagent") {
          const resumedState = await rehydrateWaitingSubagentState(
            run,
            resolution.value.workflow
          );

          if (!resumedState) {
            return null;
          }

          const result = await engine.resume({
            state: resumedState.state,
            resolution: resumedState.resolution
          });

          await persistExecutionEvents(
            run.id,
            result.events,
            resumedState.emittedEventCount
          );
          const updatedRun = await persistRunStatus(
            resumedState.state.run,
            mapExecutionStatusToRunStatus(result.status)
          );
          await persistResultState(run.id, result);
          await enqueueParentRunIfReady(updatedRun);

          return result;
        }

        const result = await engine.execute({
          run,
          workflow: resolution.value.workflow
        });

        await persistExecutionEvents(run.id, result.events);
        const updatedRun = await persistRunStatus(
          run,
          mapExecutionStatusToRunStatus(result.status)
        );
        await persistResultState(run.id, result);
        await enqueueParentRunIfReady(updatedRun);

        return result;
      } finally {
        await store.dispatches.completeDispatch(dispatch.id);
      }
    }
  };
};

import type {
  Checkpoint,
  Run,
  RunEvent,
  WorkflowDefinition,
  WorkflowNode
} from "@geohelper/agent-protocol";

import {
  consumeBudgetForNodeKind,
  createBudgetUsage,
  type WorkflowBudgetUsage
} from "./budget";
import {
  type NodeHandlerMap,
  runNode,
  type WorkflowCheckpointResolution
} from "./node-runner";
import type { WorkflowEngineStatus } from "./status-machine";

const defaultNow = (): string => new Date().toISOString();

const buildEvent = (
  runId: string,
  sequence: number,
  type: string,
  payload: Record<string, unknown>,
  now: () => string
): RunEvent => ({
  id: `event_${sequence}`,
  runId,
  sequence,
  type,
  payload,
  createdAt: now()
});

const appendEvent = (
  events: RunEvent[],
  runId: string,
  type: string,
  payload: Record<string, unknown>,
  now: () => string
): RunEvent[] => [
  ...events,
  buildEvent(runId, events.length + 1, type, payload, now)
];

const findNode = (
  workflow: WorkflowDefinition,
  nodeId: string
): WorkflowNode | null =>
  workflow.nodes.find((node) => node.id === nodeId) ?? null;

const firstNextNodeId = (node: WorkflowNode): string | null => node.next[0] ?? null;

export interface WorkflowEngineState {
  run: Run;
  workflow: WorkflowDefinition;
  nextNodeId: string | null;
  visitedNodeIds: string[];
  events: RunEvent[];
  spawnedRunIds: string[];
  budgetUsage: WorkflowBudgetUsage;
  pendingCheckpoint?: Checkpoint;
}

export interface WorkflowExecutionResult {
  status: WorkflowEngineStatus;
  visitedNodeIds: string[];
  events: RunEvent[];
  spawnedRunIds: string[];
  pendingCheckpoint?: Checkpoint;
  failureReason?:
    | "model_budget_exhausted"
    | "tool_budget_exhausted"
    | "missing_node"
    | "missing_profile"
    | "missing_workflow";
  state?: WorkflowEngineState;
}

export interface WorkflowExecutionInput {
  run: Run;
  workflow: WorkflowDefinition;
}

export interface WorkflowResumeInput {
  state: WorkflowEngineState;
  resolution: WorkflowCheckpointResolution;
}

export interface WorkflowEngineDeps {
  handlers: NodeHandlerMap;
  now?: () => string;
}

const continueExecution = async (input: {
  deps: WorkflowEngineDeps;
  run: Run;
  workflow: WorkflowDefinition;
  nextNodeId: string | null;
  visitedNodeIds: string[];
  events: RunEvent[];
  spawnedRunIds: string[];
  budgetUsage: WorkflowBudgetUsage;
}): Promise<WorkflowExecutionResult> => {
  const now = input.deps.now ?? defaultNow;
  let currentNodeId = input.nextNodeId;
  let visitedNodeIds = [...input.visitedNodeIds];
  let events = [...input.events];
  let spawnedRunIds = [...input.spawnedRunIds];
  let budgetUsage = input.budgetUsage;

  while (currentNodeId) {
    const node = findNode(input.workflow, currentNodeId);
    if (!node) {
      events = appendEvent(events, input.run.id, "run.failed", {
        reason: "missing_node",
        nodeId: currentNodeId
      }, now);
      return {
        status: "failed",
        visitedNodeIds,
        events,
        spawnedRunIds,
        failureReason: "missing_node"
      };
    }

    const budget = consumeBudgetForNodeKind(input.run, node.kind, budgetUsage);
    if (!budget.ok) {
      events = appendEvent(events, input.run.id, "run.failed", {
        reason: budget.reason,
        nodeId: node.id
      }, now);
      return {
        status: "failed",
        visitedNodeIds,
        events,
        spawnedRunIds,
        failureReason: budget.reason
      };
    }

    budgetUsage = budget.usage;
    visitedNodeIds = [...visitedNodeIds, node.id];
    events = appendEvent(events, input.run.id, "node.started", {
      nodeId: node.id,
      kind: node.kind
    }, now);

    const result = await runNode(input.deps.handlers, {
      run: input.run,
      workflow: input.workflow,
      node,
      visitedNodeIds,
      budgetUsage
    });

    events = appendEvent(events, input.run.id, "node.completed", {
      nodeId: node.id,
      resultType: result.type
    }, now);

    if (result.type === "complete") {
      events = appendEvent(events, input.run.id, "run.completed", {}, now);
      return {
        status: "completed",
        visitedNodeIds,
        events,
        spawnedRunIds
      };
    }

    if (result.type === "checkpoint") {
      events = appendEvent(events, input.run.id, "checkpoint.waiting", {
        checkpointId: result.checkpoint.id,
        nodeId: node.id
      }, now);
      return {
        status: "waiting_for_checkpoint",
        visitedNodeIds,
        events,
        spawnedRunIds,
        pendingCheckpoint: result.checkpoint,
        state: {
          run: input.run,
          workflow: input.workflow,
          nextNodeId: firstNextNodeId(node),
          visitedNodeIds,
          events,
          spawnedRunIds,
          budgetUsage,
          pendingCheckpoint: result.checkpoint
        }
      };
    }

    if (result.type === "spawn_subagent") {
      spawnedRunIds = [...spawnedRunIds, result.childRunId];
      events = appendEvent(events, input.run.id, "subagent.spawned", {
        childRunId: result.childRunId,
        nodeId: node.id
      }, now);
      currentNodeId = firstNextNodeId(node);
      continue;
    }

    if (result.type === "route") {
      currentNodeId = result.nextNodeId;
      continue;
    }

    currentNodeId = firstNextNodeId(node);
  }

  events = appendEvent(events, input.run.id, "run.completed", {}, now);
  return {
    status: "completed",
    visitedNodeIds,
    events,
    spawnedRunIds
  };
};

export const createWorkflowEngine = (deps: WorkflowEngineDeps) => ({
  execute: (input: WorkflowExecutionInput): Promise<WorkflowExecutionResult> =>
    continueExecution({
      deps,
      run: input.run,
      workflow: input.workflow,
      nextNodeId: input.workflow.entryNodeId,
      visitedNodeIds: [],
      events: [],
      spawnedRunIds: [],
      budgetUsage: createBudgetUsage()
    }),
  resume: async (input: WorkflowResumeInput): Promise<WorkflowExecutionResult> => {
    const now = deps.now ?? defaultNow;
    const pendingCheckpoint = input.state.pendingCheckpoint;
    let events = [...input.state.events];

    if (!pendingCheckpoint || pendingCheckpoint.id !== input.resolution.checkpointId) {
      events = appendEvent(events, input.state.run.id, "run.failed", {
        reason: "missing_node",
        checkpointId: input.resolution.checkpointId
      }, now);
      return {
        status: "failed",
        visitedNodeIds: input.state.visitedNodeIds,
        events,
        spawnedRunIds: input.state.spawnedRunIds,
        failureReason: "missing_node"
      };
    }

    events = appendEvent(events, input.state.run.id, "checkpoint.resolved", {
      checkpointId: input.resolution.checkpointId,
      response: input.resolution.response
    }, now);

    return continueExecution({
      deps,
      run: input.state.run,
      workflow: input.state.workflow,
      nextNodeId: input.state.nextNodeId,
      visitedNodeIds: input.state.visitedNodeIds,
      events,
      spawnedRunIds: input.state.spawnedRunIds,
      budgetUsage: input.state.budgetUsage
    });
  }
});

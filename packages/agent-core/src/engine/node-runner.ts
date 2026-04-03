import type {
  Checkpoint,
  Run,
  WorkflowDefinition,
  WorkflowNode,
  WorkflowNodeKind
} from "@geohelper/agent-protocol";

import type { WorkflowBudgetUsage } from "./budget";

export type NodeHandlerResult =
  | {
      type: "continue";
    }
  | {
      type: "route";
      nextNodeId: string;
    }
  | {
      type: "checkpoint";
      checkpoint: Checkpoint;
    }
  | {
      type: "spawn_subagent";
      childRunId: string;
    }
  | {
      type: "complete";
    };

export interface WorkflowCheckpointResolution {
  checkpointId: string;
  response: unknown;
}

export interface NodeHandlerContext {
  run: Run;
  workflow: WorkflowDefinition;
  node: WorkflowNode;
  visitedNodeIds: string[];
  budgetUsage: WorkflowBudgetUsage;
  resolution?: WorkflowCheckpointResolution;
}

export type NodeHandler = (
  input: NodeHandlerContext
) => NodeHandlerResult | Promise<NodeHandlerResult>;

export type NodeHandlerMap = Partial<Record<WorkflowNodeKind, NodeHandler>>;

export const runNode = async (
  handlers: NodeHandlerMap,
  input: NodeHandlerContext
): Promise<NodeHandlerResult> => {
  const handler = handlers[input.node.kind];
  if (!handler) {
    return {
      type: "continue"
    };
  }

  return handler(input);
};

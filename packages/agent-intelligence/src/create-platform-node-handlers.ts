import {
  type ContextAssembler,
  createContextAssembler} from "@geohelper/agent-context";
import type {
  NodeHandler,
  NodeHandlerContext,
  NodeHandlerMap
} from "@geohelper/agent-core";

import { createEvaluatorDriver } from "./node-drivers/evaluator-driver";
import { createModelDriver } from "./node-drivers/model-driver";
import { createPlannerDriver } from "./node-drivers/planner-driver";
import { createSynthesizerDriver } from "./node-drivers/synthesizer-driver";
import type { IntelligenceNodeDriver, PlatformNodeDrivers } from "./node-drivers/types";

export interface PlatformNodeHandlerOptions {
  contextAssembler?: ContextAssembler;
  drivers?: PlatformNodeDrivers;
  getWorkspaceId?: (input: NodeHandlerContext) => string | undefined;
}

const defaultGetWorkspaceId = (input: NodeHandlerContext): string | undefined =>
  typeof input.node.config.workspaceId === "string"
    ? input.node.config.workspaceId
    : undefined;

const createNodeHandler = (input: {
  driver: IntelligenceNodeDriver;
  contextAssembler: ContextAssembler;
  getWorkspaceId: (input: NodeHandlerContext) => string | undefined;
}): NodeHandler => {
  return async (nodeInput) => {
    const context = await input.contextAssembler.assemble({
      run: nodeInput.run,
      nodeId: nodeInput.node.id,
      threadId: nodeInput.run.threadId,
      workspaceId: input.getWorkspaceId(nodeInput)
    });

    return input.driver.execute({
      ...nodeInput,
      context
    });
  };
};

export const createPlatformNodeHandlers = ({
  contextAssembler = createContextAssembler(),
  drivers = {},
  getWorkspaceId = defaultGetWorkspaceId
}: PlatformNodeHandlerOptions = {}): NodeHandlerMap => ({
  planner: createNodeHandler({
    driver: drivers.planner ?? createPlannerDriver(),
    contextAssembler,
    getWorkspaceId
  }),
  model: createNodeHandler({
    driver: drivers.model ?? createModelDriver(),
    contextAssembler,
    getWorkspaceId
  }),
  evaluator: createNodeHandler({
    driver: drivers.evaluator ?? createEvaluatorDriver(),
    contextAssembler,
    getWorkspaceId
  }),
  synthesizer: createNodeHandler({
    driver: drivers.synthesizer ?? createSynthesizerDriver(),
    contextAssembler,
    getWorkspaceId
  })
});

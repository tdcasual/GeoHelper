import {
  type ContextAssembler,
  createContextAssembler} from "@geohelper/agent-context";
import type {
  NodeHandler,
  NodeHandlerContext,
  NodeHandlerMap
} from "@geohelper/agent-core";
import type { Artifact } from "@geohelper/agent-protocol";

import { createEvaluatorDriver } from "./node-drivers/evaluator-driver";
import { createModelDriver } from "./node-drivers/model-driver";
import { createPlannerDriver } from "./node-drivers/planner-driver";
import { createSynthesizerDriver } from "./node-drivers/synthesizer-driver";
import type { IntelligenceNodeDriver, PlatformNodeDrivers } from "./node-drivers/types";

export interface PlatformNodeHandlerOptions {
  contextAssembler?: ContextAssembler;
  drivers?: PlatformNodeDrivers;
  getWorkspaceId?: (input: NodeHandlerContext) => string | undefined;
  writeArtifact?: (artifact: Artifact) => Promise<void> | void;
  now?: () => string;
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
  getWorkspaceId = defaultGetWorkspaceId,
  writeArtifact,
  now
}: PlatformNodeHandlerOptions = {}): NodeHandlerMap => ({
  planner: createNodeHandler({
    driver: drivers.planner ?? createPlannerDriver({
      writeArtifact,
      now
    }),
    contextAssembler,
    getWorkspaceId
  }),
  model: createNodeHandler({
    driver: drivers.model ?? createModelDriver({
      writeArtifact,
      now
    }),
    contextAssembler,
    getWorkspaceId
  }),
  evaluator: createNodeHandler({
    driver: drivers.evaluator ?? createEvaluatorDriver({
      writeArtifact,
      now
    }),
    contextAssembler,
    getWorkspaceId
  }),
  synthesizer: createNodeHandler({
    driver: drivers.synthesizer ?? createSynthesizerDriver({
      writeArtifact,
      now
    }),
    contextAssembler,
    getWorkspaceId
  })
});

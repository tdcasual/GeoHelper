import type { PlatformAgentDefinition } from "@geohelper/agent-protocol";
import { createBundleBackedPlatformAgentDefinition } from "@geohelper/agent-sdk";

import { loadGeometryBundle } from "../bundle";

export interface GeometryAgentDefinition extends PlatformAgentDefinition {}

export const createGeometrySolverAgentDefinition =
  (): GeometryAgentDefinition => {
    const bundle = loadGeometryBundle();

    return createBundleBackedPlatformAgentDefinition<GeometryAgentDefinition>({
      bundle,
      workflowId: bundle.workflow.id,
      toolNames: bundle.tools.map((tool) => tool.name),
      evaluatorNames: bundle.evaluators.map((evaluator) => evaluator.name)
    });
  };

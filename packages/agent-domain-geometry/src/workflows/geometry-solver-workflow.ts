import type { WorkflowDefinition } from "@geohelper/agent-protocol";

import { loadGeometryBundle } from "../bundle";

export const createGeometrySolverWorkflow = (): WorkflowDefinition =>
  loadGeometryBundle().workflow;

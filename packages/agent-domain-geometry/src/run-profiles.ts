import {
  type PlatformRunProfile
} from "@geohelper/agent-protocol";
import { createRunProfilesFromBundle } from "@geohelper/agent-sdk";

import {
  createGeometrySolverAgentDefinition,
  type GeometryAgentDefinition
} from "./agents/geometry-solver";
import { loadGeometryBundle } from "./bundle";

export const createGeometryRunProfiles = (
  geometrySolver: GeometryAgentDefinition = createGeometrySolverAgentDefinition()
): Record<string, PlatformRunProfile> => {
  const bundle = loadGeometryBundle();

  return createRunProfilesFromBundle({
    bundle,
    agent: geometrySolver,
    defaultWorkflowId: bundle.workflow.id
  });
};

export const createGeometryRunProfileMap = (
  geometrySolver: GeometryAgentDefinition = createGeometrySolverAgentDefinition()
): Map<string, PlatformRunProfile> =>
  new Map(
    Object.values(createGeometryRunProfiles(geometrySolver)).map((profile) => [
      profile.id,
      profile
    ])
  );

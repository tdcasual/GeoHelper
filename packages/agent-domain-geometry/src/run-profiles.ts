import {
  type PlatformRunProfile,
  PlatformRunProfileSchema
} from "@geohelper/agent-protocol";

import {
  createGeometrySolverAgentDefinition,
  type GeometryAgentDefinition
} from "./agents/geometry-solver";

const buildPlatformRunProfile = (
  profile: PlatformRunProfile
): PlatformRunProfile => PlatformRunProfileSchema.parse(profile);

export const createGeometryRunProfiles = (
  geometrySolver: GeometryAgentDefinition = createGeometrySolverAgentDefinition()
): Record<string, PlatformRunProfile> => {
  const standardProfile = buildPlatformRunProfile({
    id: "platform_geometry_standard",
    name: "几何解题",
    description: "标准几何解题链路，保留完整的规划、工具和课堂就绪预算。",
    agentId: geometrySolver.id,
    workflowId: geometrySolver.workflowId,
    defaultBudget: {
      ...geometrySolver.defaultBudget
    }
  });

  const quickDraftProfile = buildPlatformRunProfile({
    id: "platform_geometry_quick_draft",
    name: "几何快速草稿",
    description: "使用更紧的预算快速产出一版草稿，适合先看方向再细化。",
    agentId: geometrySolver.id,
    workflowId: geometrySolver.workflowId,
    defaultBudget: {
      maxModelCalls: 3,
      maxToolCalls: 4,
      maxDurationMs: 60_000
    }
  });

  return {
    [standardProfile.id]: standardProfile,
    [quickDraftProfile.id]: quickDraftProfile
  };
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

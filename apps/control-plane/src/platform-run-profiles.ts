import {
  type PlatformRunProfile,
  PlatformRunProfileSchema} from "@geohelper/agent-protocol";

const STANDARD_GEOMETRY_PROFILE: PlatformRunProfile = PlatformRunProfileSchema.parse({
  id: "platform_geometry_standard",
  name: "几何解题",
  description: "标准几何解题链路，保留完整的规划、工具和课堂就绪预算。",
  agentId: "geometry_solver",
  workflowId: "wf_geometry_solver",
  defaultBudget: {
    maxModelCalls: 6,
    maxToolCalls: 8,
    maxDurationMs: 120_000
  }
});

const QUICK_DRAFT_GEOMETRY_PROFILE: PlatformRunProfile = PlatformRunProfileSchema.parse({
  id: "platform_geometry_quick_draft",
  name: "几何快速草稿",
  description: "使用更紧的预算快速产出一版草稿，适合先看方向再细化。",
  agentId: "geometry_solver",
  workflowId: "wf_geometry_solver",
  defaultBudget: {
    maxModelCalls: 3,
    maxToolCalls: 4,
    maxDurationMs: 60_000
  }
});

export const createDefaultControlPlaneRunProfiles = (): Map<
  string,
  PlatformRunProfile
> =>
  new Map(
    [STANDARD_GEOMETRY_PROFILE, QUICK_DRAFT_GEOMETRY_PROFILE].map((profile) => [
      profile.id,
      profile
    ])
  );

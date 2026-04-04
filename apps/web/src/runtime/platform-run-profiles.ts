import type { RunBudget } from "@geohelper/agent-protocol";

export interface PlatformRunProfile {
  id: string;
  name: string;
  description: string;
  agentId: string;
  workflowId: string;
  defaultBudget: RunBudget;
}

const STANDARD_GEOMETRY_BUDGET: RunBudget = {
  maxModelCalls: 6,
  maxToolCalls: 8,
  maxDurationMs: 120_000
};

const QUICK_DRAFT_GEOMETRY_BUDGET: RunBudget = {
  maxModelCalls: 3,
  maxToolCalls: 4,
  maxDurationMs: 60_000
};

export const platformRunProfiles: PlatformRunProfile[] = [
  {
    id: "platform_geometry_standard",
    name: "几何解题",
    description: "标准几何解题链路，保留完整的规划、工具和课堂就绪预算。",
    agentId: "geometry_solver",
    workflowId: "wf_geometry_solver",
    defaultBudget: STANDARD_GEOMETRY_BUDGET
  },
  {
    id: "platform_geometry_quick_draft",
    name: "几何快速草稿",
    description: "使用更紧的预算快速产出一版草稿，适合先看方向再细化。",
    agentId: "geometry_solver",
    workflowId: "wf_geometry_solver",
    defaultBudget: QUICK_DRAFT_GEOMETRY_BUDGET
  }
];

export const DEFAULT_PLATFORM_RUN_PROFILE_ID = platformRunProfiles[0].id;

export const getPlatformRunProfile = (
  profileId: string = DEFAULT_PLATFORM_RUN_PROFILE_ID
): PlatformRunProfile =>
  platformRunProfiles.find((profile) => profile.id === profileId) ??
  platformRunProfiles[0];

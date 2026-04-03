import type { RunBudget } from "@geohelper/agent-protocol";

export interface GeometryAgentDefinition {
  id: string;
  name: string;
  description: string;
  workflowId: string;
  toolNames: string[];
  evaluatorNames: string[];
  defaultBudget: RunBudget;
}

const defaultBudget: RunBudget = {
  maxModelCalls: 6,
  maxToolCalls: 8,
  maxDurationMs: 120_000
};

export const createGeometrySolverAgentDefinition =
  (): GeometryAgentDefinition => ({
    id: "geometry_solver",
    name: "Geometry Solver",
    description:
      "Plans geometry constructions, emits browser-ready command batches, and gates outputs for classroom readiness.",
    workflowId: "wf_geometry_solver",
    toolNames: ["scene.read_state", "scene.apply_command_batch"],
    evaluatorNames: ["teacher_readiness"],
    defaultBudget
  });

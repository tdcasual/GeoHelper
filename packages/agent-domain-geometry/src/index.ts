import type { WorkflowDefinition } from "@geohelper/agent-protocol";
import type { AnyToolDefinition } from "@geohelper/agent-tools";

import {
  createGeometrySolverAgentDefinition,
  type GeometryAgentDefinition
} from "./agents/geometry-solver";
import {
  createTeacherReadinessEvaluator,
  type GeometryEvaluator
} from "./evals/teacher-readiness";
import { createSceneApplyCommandBatchTool } from "./tools/scene-apply-command-batch";
import { createSceneReadStateTool } from "./tools/scene-read-state";
import { createGeometrySolverWorkflow } from "./workflows/geometry-solver-workflow";

export interface GeometryDomainPackage {
  agents: Record<string, GeometryAgentDefinition>;
  workflows: Record<string, WorkflowDefinition>;
  tools: Record<string, AnyToolDefinition>;
  evaluators: Record<string, GeometryEvaluator<any, any>>;
}

export const createGeometryDomainPackage = (): GeometryDomainPackage => {
  const geometrySolver = createGeometrySolverAgentDefinition();
  const workflow = createGeometrySolverWorkflow();
  const sceneReadState = createSceneReadStateTool();
  const sceneApplyCommandBatch = createSceneApplyCommandBatchTool();
  const teacherReadiness = createTeacherReadinessEvaluator();

  return {
    agents: {
      [geometrySolver.id]: geometrySolver
    },
    workflows: {
      [workflow.id]: workflow
    },
    tools: {
      [sceneReadState.name]: sceneReadState,
      [sceneApplyCommandBatch.name]: sceneApplyCommandBatch
    },
    evaluators: {
      [teacherReadiness.name]: teacherReadiness
    }
  };
};

export * from "./agents/geometry-solver";
export * from "./evals/teacher-readiness";
export * from "./tools/scene-apply-command-batch";
export * from "./tools/scene-read-state";
export * from "./workflows/geometry-solver-workflow";

export const packageName = "@geohelper/agent-domain-geometry";

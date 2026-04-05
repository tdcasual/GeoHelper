import type { PlatformBootstrap } from "@geohelper/agent-protocol";
import type { AnyToolDefinition } from "@geohelper/agent-tools";

import {
  createGeometrySolverAgentDefinition,
  type GeometryAgentDefinition
} from "./agents/geometry-solver";
import {
  createTeacherReadinessEvaluator,
  type GeometryEvaluator
} from "./evals/teacher-readiness";
import { createGeometryRunProfileMap, createGeometryRunProfiles } from "./run-profiles";
import { createSceneApplyCommandBatchTool } from "./tools/scene-apply-command-batch";
import { createSceneReadStateTool } from "./tools/scene-read-state";
import { createGeometrySolverWorkflow } from "./workflows/geometry-solver-workflow";

export type GeometryPlatformBootstrap = PlatformBootstrap<
  GeometryAgentDefinition,
  AnyToolDefinition,
  GeometryEvaluator<any, any>
>;

export const createGeometryPlatformBootstrap = (): GeometryPlatformBootstrap => {
  const geometrySolver = createGeometrySolverAgentDefinition();
  const runProfiles = createGeometryRunProfiles(geometrySolver);
  const runProfileMap = createGeometryRunProfileMap(geometrySolver);
  const workflow = createGeometrySolverWorkflow();
  const sceneReadState = createSceneReadStateTool();
  const sceneApplyCommandBatch = createSceneApplyCommandBatchTool();
  const teacherReadiness = createTeacherReadinessEvaluator();

  return {
    agents: {
      [geometrySolver.id]: geometrySolver
    },
    runProfiles,
    runProfileMap,
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

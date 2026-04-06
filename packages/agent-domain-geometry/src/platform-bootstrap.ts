import type { PlatformBootstrap } from "@geohelper/agent-protocol";
import {
  createPlatformBootstrap,
  type DomainPackage
} from "@geohelper/agent-sdk";
import type { AnyToolDefinition } from "@geohelper/agent-tools";

import {
  createGeometrySolverAgentDefinition,
  type GeometryAgentDefinition
} from "./agents/geometry-solver";
import {
  createTeacherReadinessEvaluator,
  type GeometryEvaluator
} from "./evals/teacher-readiness";
import { createGeometryRunProfiles } from "./run-profiles";
import { createSceneApplyCommandBatchTool } from "./tools/scene-apply-command-batch";
import { createSceneReadStateTool } from "./tools/scene-read-state";
import { createGeometrySolverWorkflow } from "./workflows/geometry-solver-workflow";

export type GeometryPlatformBootstrap = PlatformBootstrap<
  GeometryAgentDefinition,
  AnyToolDefinition,
  GeometryEvaluator<any, any>
>;

export type GeometryDomainPackage = DomainPackage<
  GeometryAgentDefinition,
  AnyToolDefinition,
  GeometryEvaluator<any, any>
>;

export const createGeometryDomainPackage = (): GeometryDomainPackage => {
  const geometrySolver = createGeometrySolverAgentDefinition();
  const runProfiles = createGeometryRunProfiles(geometrySolver);
  const workflow = createGeometrySolverWorkflow();
  const sceneReadState = createSceneReadStateTool();
  const sceneApplyCommandBatch = createSceneApplyCommandBatchTool();
  const teacherReadiness = createTeacherReadinessEvaluator();

  return {
    id: "geometry",
    agents: {
      [geometrySolver.id]: geometrySolver
    },
    runProfiles,
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

export const createGeometryPlatformBootstrap = (): GeometryPlatformBootstrap =>
  createPlatformBootstrap({
    domainPackages: [createGeometryDomainPackage()]
  });

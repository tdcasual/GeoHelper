import { createGeohelperGeometryHostBindings } from "@geohelper/agent-host-geohelper";
import type { PlatformBootstrap } from "@geohelper/agent-protocol";
import {
  bindToolManifestByHostCapability,
  createBundleDomainPackage,
  createPlatformBootstrap,
  type DomainPackage
} from "@geohelper/agent-sdk";
import type { AnyToolDefinition } from "@geohelper/agent-tools";

import { type GeometryReviewerAgentDefinition } from "./agents/geometry-reviewer";
import {
  type GeometryAgentDefinition
} from "./agents/geometry-solver";
import { loadGeometryBundle } from "./bundle";
import { loadGeometryReviewerBundle } from "./bundle";
import {
  createTeacherReadinessEvaluator,
  type GeometryEvaluator
} from "./evals/teacher-readiness";
import { createSceneApplyCommandBatchTool } from "./tools/scene-apply-command-batch";
import { createSceneReadStateTool } from "./tools/scene-read-state";

export type GeometryPlatformBootstrap = PlatformBootstrap<
  GeometryAgentDefinition | GeometryReviewerAgentDefinition,
  AnyToolDefinition,
  GeometryEvaluator<any, any>
>;

export type GeometryDomainPackage = DomainPackage<
  GeometryAgentDefinition | GeometryReviewerAgentDefinition,
  AnyToolDefinition,
  GeometryEvaluator<any, any>
>;

const geometryHostBindings = createGeohelperGeometryHostBindings({
  createSceneReadStateTool,
  createSceneApplyCommandBatchTool
});

export const createGeometryDomainPackage = (): GeometryDomainPackage =>
  createBundleDomainPackage<
    GeometryAgentDefinition,
    AnyToolDefinition,
    GeometryEvaluator<any, any>
  >({
    id: "geometry",
    bundle: loadGeometryBundle(),
    bindTool: ({ bundle, manifest }) =>
      bindToolManifestByHostCapability({
        bundle,
        manifest,
        registry: geometryHostBindings
      }),
    bindEvaluator: ({ manifest }) => {
      if (manifest.name === "teacher_readiness") {
        return createTeacherReadinessEvaluator();
      }

      throw new Error(
        `Unsupported geometry evaluator manifest: ${manifest.name}`
      );
    }
  });

export const createGeometryReviewerDomainPackage = (): GeometryDomainPackage =>
  createBundleDomainPackage<
    GeometryReviewerAgentDefinition,
    AnyToolDefinition,
    GeometryEvaluator<any, any>
  >({
    id: "geometry-review",
    bundle: loadGeometryReviewerBundle(),
    bindTool: ({ manifest }) => {
      throw new Error(
        `Unsupported reviewer tool manifest: ${manifest.name}`
      );
    },
    bindEvaluator: ({ manifest }) => {
      throw new Error(
        `Unsupported reviewer evaluator manifest: ${manifest.name}`
      );
    }
  });

export const createGeometryPlatformBootstrap = (): GeometryPlatformBootstrap =>
  createPlatformBootstrap({
    domainPackages: [
      createGeometryDomainPackage(),
      createGeometryReviewerDomainPackage()
    ]
  });

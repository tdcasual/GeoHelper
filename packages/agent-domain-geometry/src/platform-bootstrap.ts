import type { PortableToolManifest } from "@geohelper/agent-bundle";
import type { PlatformBootstrap } from "@geohelper/agent-protocol";
import {
  createBundleDomainPackage,
  createPlatformBootstrap,
  type DomainPackage
} from "@geohelper/agent-sdk";
import type { AnyToolDefinition, ToolDefinition } from "@geohelper/agent-tools";

import {
  type GeometryAgentDefinition
} from "./agents/geometry-solver";
import { loadGeometryBundle } from "./bundle";
import {
  createTeacherReadinessEvaluator,
  type GeometryEvaluator
} from "./evals/teacher-readiness";
import { createSceneApplyCommandBatchTool } from "./tools/scene-apply-command-batch";
import { createSceneReadStateTool } from "./tools/scene-read-state";

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

const toRuntimeToolKind = (
  kind: PortableToolManifest["kind"]
): AnyToolDefinition["kind"] => {
  if (kind === "browser") {
    return "browser_tool";
  }

  if (kind === "server") {
    return "server_tool";
  }

  if (kind === "worker") {
    return "worker_tool";
  }

  return "external_tool";
};

const applyPortableToolManifest = <TInput, TOutput>(
  definition: ToolDefinition<TInput, TOutput>,
  manifest: PortableToolManifest
): ToolDefinition<TInput, TOutput> => ({
  ...definition,
  name: manifest.name,
  kind: toRuntimeToolKind(manifest.kind),
  permissions: [...manifest.permissions],
  retryable: manifest.retryable,
  timeoutMs: manifest.timeoutMs ?? definition.timeoutMs
});

export const createGeometryDomainPackage = (): GeometryDomainPackage => {
  return createBundleDomainPackage<
    GeometryAgentDefinition,
    AnyToolDefinition,
    GeometryEvaluator<any, any>
  >({
    id: "geometry",
    bundle: loadGeometryBundle(),
    bindTool: ({ manifest }) => {
      if (manifest.name === "scene.read_state") {
        return applyPortableToolManifest(
          createSceneReadStateTool(),
          manifest
        );
      }

      if (manifest.name === "scene.apply_command_batch") {
        return applyPortableToolManifest(
          createSceneApplyCommandBatchTool(),
          manifest
        );
      }

      throw new Error(`Unsupported geometry tool manifest: ${manifest.name}`);
    },
    bindEvaluator: ({ manifest }) => {
      if (manifest.name === "teacher_readiness") {
        return createTeacherReadinessEvaluator();
      }

      throw new Error(
        `Unsupported geometry evaluator manifest: ${manifest.name}`
      );
    }
  });
};

export const createGeometryPlatformBootstrap = (): GeometryPlatformBootstrap =>
  createPlatformBootstrap({
    domainPackages: [createGeometryDomainPackage()]
  });

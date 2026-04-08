import type { PortableToolManifest } from "@geohelper/agent-bundle";
import {
  createHostCapabilityBindingRegistry,
  type HostCapabilityBindingRegistry
} from "@geohelper/agent-sdk";
import type { AnyToolDefinition, ToolDefinition } from "@geohelper/agent-tools";

export interface GeohelperGeometryHostBindingFactories {
  createSceneReadStateTool: () => AnyToolDefinition;
  createSceneApplyCommandBatchTool: () => AnyToolDefinition;
}

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

export const createGeohelperGeometryHostBindings = (
  factories: GeohelperGeometryHostBindingFactories
): HostCapabilityBindingRegistry<AnyToolDefinition> =>
  createHostCapabilityBindingRegistry({
    "workspace.scene.read": ({ manifest }) =>
      applyPortableToolManifest(
        factories.createSceneReadStateTool(),
        manifest
      ),
    "workspace.scene.write": ({ manifest }) =>
      applyPortableToolManifest(
        factories.createSceneApplyCommandBatchTool(),
        manifest
      )
  });

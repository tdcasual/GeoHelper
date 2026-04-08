import { type PortableToolManifest } from "@geohelper/agent-bundle";
import { createGeohelperGeometryHostBindings } from "@geohelper/agent-host-geohelper";
import { bindToolManifestByHostCapability } from "@geohelper/agent-sdk";
import { describe, expect, it } from "vitest";

import { createGeometryDomainPackage } from "../src";
import { loadGeometryBundle } from "../src/bundle";
import { createSceneApplyCommandBatchTool } from "../src/tools/scene-apply-command-batch";
import { createSceneReadStateTool } from "../src/tools/scene-read-state";

const geometryBundle = loadGeometryBundle();

const createBindings = () =>
  createGeohelperGeometryHostBindings({
    createSceneReadStateTool,
    createSceneApplyCommandBatchTool
  });

const getToolManifest = (toolName: string): PortableToolManifest =>
  geometryBundle.tools.find((tool) => tool.name === toolName)!;

describe("geometry host capability binding", () => {
  it("binds runtime tools from host capability instead of manifest name", () => {
    const tool = bindToolManifestByHostCapability({
      bundle: geometryBundle,
      manifest: {
        ...getToolManifest("scene.read_state"),
        name: "scene.read_state.alias"
      },
      registry: createBindings()
    });

    expect(tool).toMatchObject({
      name: "scene.read_state.alias",
      kind: "browser_tool",
      permissions: ["scene:read"],
      retryable: true
    });
  });

  it("fails with a readable error when the manifest omits host capability", () => {
    expect(() =>
      bindToolManifestByHostCapability({
        bundle: geometryBundle,
        manifest: {
          ...getToolManifest("scene.read_state"),
          hostCapability: undefined
        },
        registry: createBindings()
      })
    ).toThrowError(
      "Portable tool manifest scene.read_state is missing hostCapability"
    );
  });

  it("fails with a readable error when the host capability has no binding", () => {
    expect(() =>
      bindToolManifestByHostCapability({
        bundle: geometryBundle,
        manifest: {
          ...getToolManifest("scene.read_state"),
          hostCapability: "workspace.scene.delete"
        },
        registry: createBindings()
      })
    ).toThrowError(
      "Missing host capability binding: workspace.scene.delete for tool scene.read_state"
    );
  });

  it("builds the geometry domain package through host capability bindings", () => {
    const domain = createGeometryDomainPackage();

    expect(domain.tools["scene.read_state"]).toMatchObject({
      name: "scene.read_state",
      kind: "browser_tool"
    });
    expect(domain.tools["scene.apply_command_batch"]).toMatchObject({
      name: "scene.apply_command_batch",
      kind: "browser_tool"
    });
  });
});

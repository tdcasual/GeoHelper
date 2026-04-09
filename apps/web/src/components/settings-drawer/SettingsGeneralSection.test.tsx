import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { createPlatformRunProfileCatalogState } from "../../state/platform-run-profile-catalog";
import { SettingsGeneralSection } from "./SettingsGeneralSection";

describe("SettingsGeneralSection", () => {
  it("renders portable bundle audit summaries from the control plane", () => {
    const markup = renderToStaticMarkup(
      createElement(SettingsGeneralSection, {
        currentMode: "official",
        defaultMode: "official",
        defaultRuntimeProfileId: "runtime_gateway",
        defaultPlatformAgentProfileId: "platform_geometry_standard",
        runtimeProfiles: [
          {
            id: "runtime_gateway",
            name: "Gateway",
            target: "gateway",
            gatewayBaseUrl: "https://gateway.example.com",
            controlPlaneBaseUrl: "https://control-plane.example.com",
            updatedAt: 1
          }
        ],
        platformRunProfileCatalog: createPlatformRunProfileCatalogState({
          source: "control_plane",
          status: "ready",
          profiles: [
            {
              id: "platform_geometry_standard",
              name: "几何解题",
              description: "标准几何解题链路",
              agentId: "geometry_solver",
              workflowId: "wf_geometry_solver",
              defaultBudget: {
                maxModelCalls: 6,
                maxToolCalls: 8,
                maxDurationMs: 120000
              }
            }
          ]
        }),
        platformBundleCatalog: {
          bundles: [
            {
              agentId: "geometry_solver",
              bundleId: "geometry_solver",
              rootDir: "/repo/agents/geometry-solver",
              schemaVersion: "2",
              hostRequirements: ["workspace.scene.read", "workspace.scene.write"],
              workspaceBootstrapFiles: ["workspace/AGENTS.md"],
              promptAssetPaths: ["prompts/planner.md"],
              openClawCompatibility: {
                bundleId: "geometry_solver",
                schemaVersion: "2",
                recommendedImportMode: "portable-with-host-bindings",
                requiredOpenClawCapabilities: [
                  "workspace.scene.read",
                  "workspace.scene.write"
                ],
                fullyPortableTools: ["scene.read_state"],
                hostBoundTools: ["scene.apply_command_batch"],
                nativeSubagentDelegations: [],
                acpAgentDelegations: [],
                hostServiceDelegations: [],
                degradedBehaviors: [],
                notes: [],
                rehearsedExtractionCandidate: false,
                extractionBlockers: ["workspace.scene.read", "workspace.scene.write"]
              },
              audit: {
                rehearsedExtractionCandidate: false,
                extractionBlockers: ["workspace.scene.read", "workspace.scene.write"],
                verifyImport: null
              }
            },
            {
              agentId: "geometry_reviewer",
              bundleId: "geometry_reviewer",
              rootDir: "/repo/agents/geometry-reviewer",
              schemaVersion: "2",
              hostRequirements: [],
              workspaceBootstrapFiles: ["workspace/AGENTS.md"],
              promptAssetPaths: ["prompts/planner.md"],
              openClawCompatibility: {
                bundleId: "geometry_reviewer",
                schemaVersion: "2",
                recommendedImportMode: "portable",
                requiredOpenClawCapabilities: [],
                fullyPortableTools: [],
                hostBoundTools: [],
                nativeSubagentDelegations: [],
                acpAgentDelegations: [],
                hostServiceDelegations: [],
                degradedBehaviors: [],
                notes: [],
                rehearsedExtractionCandidate: true,
                extractionBlockers: []
              },
              audit: {
                rehearsedExtractionCandidate: true,
                extractionBlockers: [],
                verifyImport: {
                  bundleId: "geometry_reviewer",
                  cleanExternalMoveReady: true,
                  extractionBlockers: []
                }
              }
            }
          ],
          source: "control_plane",
          status: "ready",
          error: null,
          lastFetchedAt: "2026-04-09T00:00:00.000Z"
        },
        selectedRuntimeId: "runtime_gateway",
        runtimeDraft: {
          id: "runtime_gateway",
          name: "Gateway",
          target: "gateway",
          gatewayBaseUrl: "https://gateway.example.com",
          controlPlaneBaseUrl: "https://control-plane.example.com",
          providerBaseUrl: ""
        },
        savingRuntime: false,
        setDefaultMode: vi.fn(),
        setDefaultRuntimeProfile: vi.fn(),
        setDefaultPlatformAgentProfile: vi.fn(),
        setSelectedRuntimeId: vi.fn(),
        setRuntimeDraft: vi.fn(),
        setSavingRuntime: vi.fn(),
        upsertRuntimeProfile: vi.fn(() => "runtime_gateway"),
        refreshPlatformRunProfiles: vi.fn(async () => {}),
        onApplyMode: vi.fn()
      })
    );

    expect(markup).toContain("Portable Bundles");
    expect(markup).toContain("Gateway 地址");
    expect(markup).toContain("Control Plane 地址");
    expect(markup).toContain("geometry_solver");
    expect(markup).toContain("portable-with-host-bindings");
    expect(markup).toContain("scene.apply_command_batch");
    expect(markup).toContain("release audit: host-review-needed");
    expect(markup).toContain("rehearsal candidate: no");
    expect(markup).toContain("verify import: not captured");
    expect(markup).toContain("extraction blockers: workspace.scene.read, workspace.scene.write");
    expect(markup).toContain("geometry_reviewer");
    expect(markup).toContain("portable");
    expect(markup).toContain("release audit: portable-ready");
    expect(markup).toContain("rehearsal candidate: yes");
    expect(markup).toContain("verify import: passed");
  });
});

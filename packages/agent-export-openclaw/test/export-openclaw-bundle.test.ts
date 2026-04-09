import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadPortableAgentBundleFromFs } from "@geohelper/agent-bundle";
import { describe, expect, it } from "vitest";

import { exportOpenClawBundleToFs, smokeImportOpenClawWorkspace } from "../src";

const geometryBundleDir = path.resolve(
  fileURLToPath(new URL("../../../agents/geometry-solver", import.meta.url))
);
const repoRoot = path.resolve(
  fileURLToPath(new URL("../../..", import.meta.url))
);
const exportScriptPath = path.join(
  repoRoot,
  "scripts/agents/export-openclaw-bundle.mjs"
);
const smokeScriptPath = path.join(
  repoRoot,
  "scripts/agents/smoke-openclaw-export.mjs"
);
const tsxPath = path.join(repoRoot, "node_modules/.bin/tsx");

describe("openclaw bundle exporter", () => {
  it("exports the geometry bundle into an OpenClaw-friendly directory", () => {
    const bundle = loadPortableAgentBundleFromFs(geometryBundleDir);
    const outputDir = mkdtempSync(
      path.join(os.tmpdir(), "geohelper-openclaw-export-")
    );

    try {
      const result = exportOpenClawBundleToFs({
        bundle,
        outputDir
      });

      const exportedManifest = JSON.parse(
        readFileSync(path.join(outputDir, "agent.json"), "utf8")
      ) as {
        id: string;
      };
      const exportedReport = JSON.parse(
        readFileSync(path.join(outputDir, "export-report.json"), "utf8")
      ) as {
        recommendedImportMode: string;
        hostBoundTools: string[];
      };
      const exportedWorkspace = readFileSync(
        path.join(outputDir, "workspace/AGENTS.md"),
        "utf8"
      );
      const smoke = smokeImportOpenClawWorkspace({
        workspaceDir: outputDir
      });

      expect(result.report.bundleId).toBe("geometry_solver");
      expect(exportedManifest.id).toBe("geometry_solver");
      expect(exportedWorkspace).toContain("Geometry Solver Agent");
      expect(exportedReport.recommendedImportMode).toBe(
        "portable-with-host-bindings"
      );
      expect(exportedReport.hostBoundTools).toContain(
        "scene.apply_command_batch"
      );
      expect(smoke.bundleId).toBe("geometry_solver");
      expect(smoke.workflowId).toBe("wf_geometry_solver");
      expect(smoke.entrypointPrompts).toEqual([
        "prompts/planner.md",
        "prompts/executor.md",
        "prompts/synthesizer.md"
      ]);
      expect(smoke.workspaceBootstrapFiles).toContain("workspace/AGENTS.md");
      expect(smoke.exportedToolNames).toContain("scene.apply_command_batch");
      expect(smoke.exportedEvaluatorNames).toContain("teacher_readiness");
      expect(smoke.thinAdapter.requiresHostBindings).toBe(true);
      expect(smoke.thinAdapter.hostBoundTools).toContain(
        "scene.apply_command_batch"
      );
    } finally {
      rmSync(outputDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("exports a named bundle from the repo script and emits export-report.json", () => {
    const outputDir = mkdtempSync(
      path.join(os.tmpdir(), "geohelper-openclaw-script-export-")
    );

    try {
      const run = spawnSync(
        tsxPath,
        [exportScriptPath, "geometry-solver", outputDir],
        {
          cwd: repoRoot,
          encoding: "utf8"
        }
      );

      expect(run.status).toBe(0);

      const exportedManifest = JSON.parse(
        readFileSync(path.join(outputDir, "agent.json"), "utf8")
      ) as {
        id: string;
      };
      const exportedReport = JSON.parse(
        readFileSync(path.join(outputDir, "export-report.json"), "utf8")
      ) as {
        bundleId: string;
      };

      expect(exportedManifest.id).toBe("geometry_solver");
      expect(exportedReport.bundleId).toBe("geometry_solver");
    } finally {
      rmSync(outputDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("runs an export plus smoke-import proof from the repo script", () => {
    const outputDir = mkdtempSync(
      path.join(os.tmpdir(), "geohelper-openclaw-smoke-export-")
    );

    try {
      const run = spawnSync(
        tsxPath,
        [smokeScriptPath, "geometry-solver", outputDir],
        {
          cwd: repoRoot,
          encoding: "utf8"
        }
      );

      expect(run.status).toBe(0);

      const payload = JSON.parse(run.stdout) as {
        bundleId: string;
        outputDir: string;
        smoke: {
          workflowId: string;
          thinAdapter: {
            requiresHostBindings: boolean;
            hostBoundTools: string[];
          };
        };
      };

      expect(payload.bundleId).toBe("geometry_solver");
      expect(payload.outputDir).toBe(outputDir);
      expect(payload.smoke.workflowId).toBe("wf_geometry_solver");
      expect(payload.smoke.thinAdapter.requiresHostBindings).toBe(true);
      expect(payload.smoke.thinAdapter.hostBoundTools).toContain(
        "scene.apply_command_batch"
      );
    } finally {
      rmSync(outputDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("supports inline smoke verification from the export script for the reviewer bundle", () => {
    const outputDir = mkdtempSync(
      path.join(os.tmpdir(), "geohelper-openclaw-reviewer-export-")
    );

    try {
      const run = spawnSync(
        tsxPath,
        [exportScriptPath, "geometry-reviewer", outputDir, "--verify-import"],
        {
          cwd: repoRoot,
          encoding: "utf8"
        }
      );

      expect(run.status).toBe(0);

      const payload = JSON.parse(run.stdout) as {
        bundleId: string;
        outputDir: string;
        smoke?: {
          bundleId: string;
          workflowId: string;
          thinAdapter: {
            requiresHostBindings: boolean;
            recommendedImportMode: string;
          };
        };
      };

      expect(payload).toEqual({
        bundleId: "geometry_reviewer",
        outputDir,
        reportPath: path.join(outputDir, "export-report.json"),
        smoke: expect.objectContaining({
          bundleId: "geometry_reviewer",
          workflowId: "wf_geometry_reviewer",
          thinAdapter: expect.objectContaining({
            requiresHostBindings: false,
            recommendedImportMode: "portable"
          })
        })
      });
    } finally {
      rmSync(outputDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("reports delegation portability requirements for exported bundles", () => {
    const sourceDir = mkdtempSync(
      path.join(os.tmpdir(), "geohelper-openclaw-delegation-source-")
    );
    const outputDir = mkdtempSync(
      path.join(os.tmpdir(), "geohelper-openclaw-delegation-export-")
    );

    try {
      cpSync(geometryBundleDir, sourceDir, {
        recursive: true
      });
      writeFileSync(
        path.join(sourceDir, "delegations/subagents.json"),
        JSON.stringify(
          {
            delegations: [
              {
                name: "portable_reviewer",
                mode: "native-subagent",
                agentRef: "geometry-reviewer",
                awaitCompletion: true
              },
              {
                name: "external_research",
                mode: "acp-agent",
                agentRef: "openclaw.geometry-reviewer",
                awaitCompletion: true
              },
              {
                name: "host_geometry_review",
                mode: "host-service",
                serviceRef: "host.geometry-review",
                awaitCompletion: true
              }
            ]
          },
          null,
          2
        )
      );

      const bundle = loadPortableAgentBundleFromFs(sourceDir);
      const result = exportOpenClawBundleToFs({
        bundle,
        outputDir
      });
      const smokeResult = smokeImportOpenClawWorkspace({
        workspaceDir: outputDir
      });

      expect(result.report.recommendedImportMode).toBe(
        "portable-with-host-bindings"
      );
      expect(result.report.nativeSubagentDelegations).toEqual([
        {
          name: "portable_reviewer",
          agentRef: "geometry-reviewer"
        }
      ]);
      expect(result.report.acpAgentDelegations).toEqual([
        {
          name: "external_research",
          agentRef: "openclaw.geometry-reviewer"
        }
      ]);
      expect(result.report.hostServiceDelegations).toEqual([
        {
          name: "host_geometry_review",
          serviceRef: "host.geometry-review"
        }
      ]);
      expect(result.report.degradedBehaviors).toEqual(
        expect.arrayContaining([
          expect.stringContaining("host_geometry_review")
        ])
      );
      expect(result.report.notes).toEqual(
        expect.arrayContaining([
          expect.stringContaining("ACP agent delegations")
        ])
      );
      expect(smokeResult.thinAdapter.acpAgentDelegations).toEqual([
        {
          name: "external_research",
          agentRef: "openclaw.geometry-reviewer"
        }
      ]);
      expect(smokeResult.thinAdapter.hostServiceDelegations).toEqual([
        {
          name: "host_geometry_review",
          serviceRef: "host.geometry-review"
        }
      ]);
    } finally {
      rmSync(sourceDir, {
        recursive: true,
        force: true
      });
      rmSync(outputDir, {
        recursive: true,
        force: true
      });
    }
  });
});

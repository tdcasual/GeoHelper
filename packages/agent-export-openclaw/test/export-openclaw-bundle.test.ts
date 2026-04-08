import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
});

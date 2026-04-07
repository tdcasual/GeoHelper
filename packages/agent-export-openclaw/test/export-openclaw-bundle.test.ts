import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadPortableAgentBundleFromFs } from "@geohelper/agent-bundle";
import { describe, expect, it } from "vitest";

import { exportOpenClawBundleToFs } from "../src";

const geometryBundleDir = path.resolve(
  fileURLToPath(new URL("../../../agents/geometry-solver", import.meta.url))
);

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

      expect(result.report.bundleId).toBe("geometry_solver");
      expect(exportedManifest.id).toBe("geometry_solver");
      expect(exportedWorkspace).toContain("Geometry Solver Agent");
      expect(exportedReport.recommendedImportMode).toBe(
        "portable-with-host-bindings"
      );
      expect(exportedReport.hostBoundTools).toContain(
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

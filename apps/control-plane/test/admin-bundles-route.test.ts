import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";

describe("control-plane admin bundle routes", () => {
  it("lists registered portable bundles", async () => {
    const app = buildServer();

    const res = await app.inject({
      method: "GET",
      url: "/admin/bundles"
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({
      bundles: expect.arrayContaining([
        expect.objectContaining({
          agentId: "geometry_solver",
          bundleId: "geometry_solver",
          rootDir: expect.stringContaining("/agents/geometry-solver"),
          hostRequirements: ["workspace.scene.read", "workspace.scene.write"]
        }),
        expect.objectContaining({
          agentId: "geometry_reviewer",
          bundleId: "geometry_reviewer",
          rootDir: expect.stringContaining("/agents/geometry-reviewer"),
          hostRequirements: []
        })
      ])
    });
  });

  it("exports a registered bundle through the admin route", async () => {
    const outputDir = mkdtempSync(
      path.join(os.tmpdir(), "geohelper-admin-bundle-export-")
    );
    const app = buildServer();

    try {
      const res = await app.inject({
        method: "POST",
        url: "/admin/bundles/geometry_solver/export-openclaw",
        payload: {
          outputDir
        }
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload)).toEqual({
        export: expect.objectContaining({
          agentId: "geometry_solver",
          bundleId: "geometry_solver",
          outputDir
        })
      });

      const report = JSON.parse(
        readFileSync(path.join(outputDir, "export-report.json"), "utf8")
      ) as {
        bundleId: string;
        recommendedImportMode: string;
      };

      expect(report).toEqual(
        expect.objectContaining({
          bundleId: "geometry_solver",
          recommendedImportMode: "portable-with-host-bindings"
        })
      );
    } finally {
      rmSync(outputDir, {
        recursive: true,
        force: true
      });
    }
  });
});

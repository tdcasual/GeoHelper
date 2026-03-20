import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("legacy compile check runner", () => {
  it("exposes a dry-run plan for external consumer evidence collection", () => {
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.["ops:legacy-compile-check"]).toBeDefined();

    const run = spawnSync(
      "node",
      ["scripts/ops/check-legacy-compile-consumers.mjs", "--dry-run"],
      {
        encoding: "utf8"
      }
    );

    expect(run.status).toBe(0);
    const payload = JSON.parse(run.stdout.trim()) as {
      dry_run: boolean;
      gateway_url: string | null;
      observation_window_days: number;
      steps: Array<Record<string, unknown>>;
    };

    expect(payload).toEqual({
      dry_run: true,
      gateway_url: null,
      observation_window_days: 7,
      steps: [
        {
          name: "read_compile_events",
          method: "GET",
          path: "/admin/compile-events?limit=200"
        },
        {
          name: "group_by_path",
          paths: ["/api/v1/chat/compile", "/api/v2/agent/runs"]
        },
        {
          name: "report_legacy_hits",
          fields: ["recordedAt", "traceId", "mode", "finalStatus", "path"]
        }
      ]
    });
  });

  it("writes an artifact summary with legacy hit evidence from admin compile events", () => {
    const tmpRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "geohelper-legacy-compile-check-")
    );
    const artifactRoot = path.join(tmpRoot, "artifacts");
    const stamp = "2026-03-19T08-10-00Z";

    const run = spawnSync(
      "node",
      ["scripts/ops/check-legacy-compile-consumers.mjs"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          OPS_OUTPUT_ROOT: artifactRoot,
          OPS_ARTIFACT_STAMP: stamp,
          LEGACY_COMPILE_CHECK_MOCK_EVENTS_JSON: JSON.stringify({
            events: [
              {
                recordedAt: "2026-03-19T08:00:00.000Z",
                traceId: "tr_v1_1",
                requestId: "req-1",
                finalStatus: "success",
                mode: "byok",
                path: "/api/v1/chat/compile"
              },
              {
                recordedAt: "2026-03-19T08:05:00.000Z",
                traceId: "tr_v2_1",
                requestId: "req-2",
                finalStatus: "success",
                mode: "byok",
                path: "/api/v2/agent/runs"
              },
              {
                recordedAt: "2026-03-19T08:06:00.000Z",
                traceId: "tr_v1_2",
                requestId: "req-3",
                finalStatus: "repair",
                mode: "official",
                path: "/api/v1/chat/compile"
              }
            ]
          })
        }
      }
    );

    expect(run.status).toBe(0);

    const payload = JSON.parse(run.stdout.trim()) as {
      dry_run: boolean;
      observation_window_days: number;
      summary: {
        total_events: number;
        legacy_hit_count: number;
        agent_run_hit_count: number;
        legacy_paths_present: boolean;
      };
      legacy_hits: Array<Record<string, unknown>>;
      artifact: string;
    };

    const outputDir = path.join(artifactRoot, stamp);
    expect(payload.dry_run).toBe(false);
    expect(payload.observation_window_days).toBe(7);
    expect(payload.summary).toEqual({
      total_events: 3,
      legacy_hit_count: 2,
      agent_run_hit_count: 1,
      legacy_paths_present: true
    });
    expect(payload.legacy_hits).toEqual([
      {
        recordedAt: "2026-03-19T08:06:00.000Z",
        traceId: "tr_v1_2",
        requestId: "req-3",
        finalStatus: "repair",
        mode: "official",
        path: "/api/v1/chat/compile"
      },
      {
        recordedAt: "2026-03-19T08:00:00.000Z",
        traceId: "tr_v1_1",
        requestId: "req-1",
        finalStatus: "success",
        mode: "byok",
        path: "/api/v1/chat/compile"
      }
    ]);
    expect(payload.artifact).toBe(path.join(outputDir, "legacy-compile-check.json"));
    expect(fs.existsSync(payload.artifact)).toBe(true);
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { runReleaseCandidateLiveChecks } from "../../scripts/ops/run-release-candidate-live-checks.mjs";

const createStdoutBuffer = () => {
  let output = "";
  return {
    stdout: {
      write(chunk: string) {
        output += chunk;
        return true;
      }
    },
    read: () => output
  };
};

describe("release-candidate live checks runner", () => {
  it("exposes the package script and dry-run orchestration plan", async () => {
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.["ops:release-candidate:live"]).toBeDefined();

    const buffer = createStdoutBuffer();
    const code = await runReleaseCandidateLiveChecks({
      argv: ["--dry-run"],
      env: {
        ...process.env,
        GATEWAY_URL: "https://gateway.example.com",
        CONTROL_PLANE_URL: "https://control-plane.example.com"
      },
      stdout: buffer.stdout as unknown as typeof process.stdout
    });

    expect(code).toBe(0);
    expect(JSON.parse(buffer.read())).toEqual({
      dry_run: true,
      gateway_url: "https://gateway.example.com",
      control_plane_url: "https://control-plane.example.com",
      bundle_id: "geometry_reviewer",
      phases: [
        {
          name: "gateway_runtime",
          command: "pnpm smoke:gateway-runtime"
        },
        {
          name: "backup_restore",
          command: "pnpm smoke:gateway-backup-restore"
        },
        {
          name: "platform_run",
          command: "pnpm smoke:platform-run-remote"
        },
        {
          name: "scheduled_verify",
          command: "pnpm ops:gateway:scheduled"
        },
        {
          name: "bundle_audit",
          command: "POST /admin/bundles/geometry_reviewer/export-openclaw",
          verifyImport: true
        }
      ]
    });
  });

  it("writes a release-candidate summary artifact with all step outputs", async () => {
    const tmpRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "geohelper-release-candidate-live-")
    );
    const artifactRoot = path.join(tmpRoot, "ops-output");
    const stamp = "2026-04-09T09-00-00Z";
    const outputDir = path.join(artifactRoot, stamp);
    const buffer = createStdoutBuffer();

    const code = await runReleaseCandidateLiveChecks({
      env: {
        ...process.env,
        OPS_OUTPUT_ROOT: artifactRoot,
        OPS_ARTIFACT_STAMP: stamp,
        GATEWAY_URL: "https://gateway.example.com",
        CONTROL_PLANE_URL: "https://control-plane.example.com",
        RELEASE_CANDIDATE_MOCK_GATEWAY_RUNTIME_JSON: JSON.stringify({
          dry_run: false,
          gateway_url: "https://gateway.example.com",
          checks: [{ name: "GET /api/v1/health", ok: true }]
        }),
        RELEASE_CANDIDATE_MOCK_BACKUP_RESTORE_JSON: JSON.stringify({
          dry_run: false,
          gateway_url: "https://gateway.example.com",
          restore_drill: {
            stored_at: "2026-04-09T09:00:00.000Z"
          }
        }),
        RELEASE_CANDIDATE_MOCK_PLATFORM_RUN_JSON: JSON.stringify({
          dry_run: false,
          gateway_url: "https://gateway.example.com",
          control_plane_url: "https://control-plane.example.com",
          checks: [
            {
              name: "GET /api/v3/runs/:runId/stream",
              ok: true,
              run_id: "run_platform_remote_1"
            }
          ]
        }),
        RELEASE_CANDIDATE_MOCK_SCHEDULED_VERIFY_JSON: JSON.stringify({
          dry_run: false,
          status: "ok",
          verify: {
            output_dir: outputDir,
            status: "ok",
            failure_reasons: []
          },
          published_artifacts: {
            summary:
              "https://artifacts.example.com/ops/staging/2026-04-09T09-00-00Z/summary.json"
          },
          notify: null
        }),
        RELEASE_CANDIDATE_MOCK_BUNDLE_AUDIT_JSON: JSON.stringify({
          export: {
            agentId: "geometry_reviewer",
            bundleId: "geometry_reviewer",
            outputDir: path.join(outputDir, "openclaw", "geometry_reviewer")
          },
          audit: {
            bundleId: "geometry_reviewer",
            rehearsedExtractionCandidate: true,
            extractionBlockers: [],
            verifyImport: {
              bundleId: "geometry_reviewer",
              cleanExternalMoveReady: true,
              extractionBlockers: []
            }
          }
        })
      },
      stdout: buffer.stdout as unknown as typeof process.stdout
    });

    expect(code).toBe(0);

    const payload = JSON.parse(buffer.read()) as {
      status: string;
      output_dir: string;
      summary_artifact: string;
    };

    expect(payload).toEqual({
      status: "ok",
      output_dir: outputDir,
      summary_artifact: "release-candidate-summary.json"
    });

    const summary = JSON.parse(
      fs.readFileSync(
        path.join(outputDir, "release-candidate-summary.json"),
        "utf8"
      )
    ) as {
      status: string;
      bundle_id: string;
      published_artifacts: Record<string, string> | null;
      gatewayRuntime: { status: string };
      backupRestore: { status: string };
      platformRun: { status: string };
      scheduledVerify: { status: string };
      bundleAudit: {
        status: string;
        result: {
          audit: {
            rehearsedExtractionCandidate: boolean;
          };
        };
      };
    };

    expect(summary.status).toBe("ok");
    expect(summary.bundle_id).toBe("geometry_reviewer");
    expect(summary.gatewayRuntime.status).toBe("ok");
    expect(summary.backupRestore.status).toBe("ok");
    expect(summary.platformRun.status).toBe("ok");
    expect(summary.scheduledVerify.status).toBe("ok");
    expect(summary.bundleAudit.status).toBe("ok");
    expect(summary.bundleAudit.result.audit.rehearsedExtractionCandidate).toBe(
      true
    );
    expect(summary.published_artifacts).toEqual({
      summary:
        "https://artifacts.example.com/ops/staging/2026-04-09T09-00-00Z/summary.json"
    });
    expect(fs.existsSync(path.join(outputDir, "bundle-audit.json"))).toBe(true);
  });
});

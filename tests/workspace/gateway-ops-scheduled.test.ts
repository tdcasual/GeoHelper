import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("scheduled gateway ops wrapper", () => {
  it("exposes a scheduled runner script and dry-run execution plan", () => {
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.["ops:gateway:scheduled"]).toBeDefined();

    const tmpRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "geohelper-ops-scheduled-dry-run-")
    );
    const artifactRoot = path.join(tmpRoot, "artifacts");

    const run = spawnSync(
      "node",
      ["scripts/ops/run-scheduled-gateway-verify.mjs", "--dry-run"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          OPS_OUTPUT_ROOT: artifactRoot,
          OPS_RUN_LABEL: "nightly-2026-03-12",
          OPS_DEPLOYMENT: "staging"
        }
      }
    );

    expect(run.status).toBe(0);
    const payload = JSON.parse(run.stdout.trim()) as {
      dry_run: boolean;
      run_label: string;
      deployment: string;
      phases: Array<Record<string, unknown>>;
    };

    expect(payload).toEqual({
      dry_run: true,
      run_label: "nightly-2026-03-12",
      deployment: "staging",
      phases: [
        {
          name: "verify",
          command: "pnpm ops:gateway:verify"
        },
        {
          name: "publish_artifacts",
          enabled: false
        },
        {
          name: "notify",
          enabled: false
        }
      ]
    });
    expect(fs.existsSync(artifactRoot)).toBe(false);
  });


  it("publishes local artifacts to a mock object store when enabled", () => {
    const tmpRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "geohelper-ops-scheduled-publish-")
    );
    const artifactRoot = path.join(tmpRoot, "artifacts");
    const stamp = "2026-03-12T07-05-00Z";

    const run = spawnSync(
      "node",
      ["scripts/ops/run-scheduled-gateway-verify.mjs"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          OPS_OUTPUT_ROOT: artifactRoot,
          OPS_ARTIFACT_STAMP: stamp,
          OPS_USE_DRY_RUN_SUBCOMMANDS: "1",
          OPS_PUBLISH_ARTIFACTS: "1",
          OPS_USE_MOCK_ARTIFACT_PUBLISH: "1",
          OPS_ARTIFACT_PUBLIC_BASE_URL: "https://artifacts.example.com",
          OPS_ARTIFACT_PREFIX: "ops/staging",
          OPS_RUN_LABEL: "nightly-2026-03-12",
          OPS_DEPLOYMENT: "staging"
        }
      }
    );

    expect(run.status).toBe(0);
    const payload = JSON.parse(run.stdout.trim()) as {
      status: string;
      verify: { output_dir: string };
      published_artifacts: Record<string, string> | null;
    };

    expect(payload.status).toBe("ok");
    expect(payload.verify.output_dir).toBe(path.join(artifactRoot, stamp));
    expect(payload.published_artifacts).toEqual({
      manifest: "https://artifacts.example.com/ops/staging/2026-03-12T07-05-00Z/manifest.json",
      smoke: "https://artifacts.example.com/ops/staging/2026-03-12T07-05-00Z/smoke.json",
      benchmark: "https://artifacts.example.com/ops/staging/2026-03-12T07-05-00Z/benchmark.json",
      summary: "https://artifacts.example.com/ops/staging/2026-03-12T07-05-00Z/summary.json"
    });
  });

  it("sends a compact failure summary to a mock notify webhook", () => {
    const tmpRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "geohelper-ops-scheduled-notify-fail-")
    );
    const artifactRoot = path.join(tmpRoot, "artifacts");
    const stamp = "2026-03-12T07-10-00Z";

    const run = spawnSync(
      "node",
      ["scripts/ops/run-scheduled-gateway-verify.mjs"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          OPS_OUTPUT_ROOT: artifactRoot,
          OPS_ARTIFACT_STAMP: stamp,
          OPS_USE_MOCK_RESULTS: "1",
          OPS_MOCK_SMOKE_JSON: JSON.stringify({
            dry_run: false,
            checks: [{ name: "GET /api/v1/health", ok: false }]
          }),
          OPS_MOCK_BENCHMARK_JSON: JSON.stringify({
            dry_run: false,
            success_rate: 0.5,
            by_domain: {
              "2d": { p95_latency_ms: 2400 }
            }
          }),
          OPS_BENCH_MIN_SUCCESS_RATE: "0.95",
          OPS_BENCH_MAX_P95_MS: "1200",
          OPS_PUBLISH_ARTIFACTS: "1",
          OPS_USE_MOCK_ARTIFACT_PUBLISH: "1",
          OPS_ARTIFACT_PUBLIC_BASE_URL: "https://artifacts.example.com",
          OPS_ARTIFACT_PREFIX: "ops/staging",
          OPS_NOTIFY_WEBHOOK_URL: "https://hooks.example.com/ops",
          OPS_USE_MOCK_NOTIFY: "1",
          OPS_RUN_LABEL: "nightly-2026-03-12",
          OPS_DEPLOYMENT: "staging"
        }
      }
    );

    expect(run.status).toBe(1);
    const payload = JSON.parse(run.stdout.trim()) as {
      status: string;
      notify: {
        delivered: boolean;
        payload: {
          run_label: string;
          deployment: string;
          status: string;
          failure_reasons: string[];
          published_artifacts: Record<string, string>;
        };
      } | null;
    };

    expect(payload.status).toBe("failed");
    expect(payload.notify).toEqual({
      delivered: true,
      payload: {
        run_label: "nightly-2026-03-12",
        deployment: "staging",
        status: "failed",
        failure_reasons: [
          "gateway_smoke_failed",
          "benchmark_success_rate_below_threshold",
          "benchmark_p95_latency_above_threshold"
        ],
        published_artifacts: {
          manifest: "https://artifacts.example.com/ops/staging/2026-03-12T07-10-00Z/manifest.json",
          smoke: "https://artifacts.example.com/ops/staging/2026-03-12T07-10-00Z/smoke.json",
          benchmark: "https://artifacts.example.com/ops/staging/2026-03-12T07-10-00Z/benchmark.json",
          summary: "https://artifacts.example.com/ops/staging/2026-03-12T07-10-00Z/summary.json"
        }
      }
    });
  });

  it("sends a success heartbeat summary when notify is configured", () => {
    const tmpRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "geohelper-ops-scheduled-notify-ok-")
    );
    const artifactRoot = path.join(tmpRoot, "artifacts");
    const stamp = "2026-03-12T07-11-00Z";

    const run = spawnSync(
      "node",
      ["scripts/ops/run-scheduled-gateway-verify.mjs"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          OPS_OUTPUT_ROOT: artifactRoot,
          OPS_ARTIFACT_STAMP: stamp,
          OPS_USE_DRY_RUN_SUBCOMMANDS: "1",
          OPS_NOTIFY_WEBHOOK_URL: "https://hooks.example.com/ops",
          OPS_USE_MOCK_NOTIFY: "1",
          OPS_RUN_LABEL: "post-deploy-2026-03-12",
          OPS_DEPLOYMENT: "prod"
        }
      }
    );

    expect(run.status).toBe(0);
    const payload = JSON.parse(run.stdout.trim()) as {
      status: string;
      notify: {
        delivered: boolean;
        payload: {
          run_label: string;
          deployment: string;
          status: string;
          failure_reasons: string[];
        };
      } | null;
    };

    expect(payload.status).toBe("ok");
    expect(payload.notify).toEqual({
      delivered: true,
      payload: {
        run_label: "post-deploy-2026-03-12",
        deployment: "prod",
        status: "ok",
        failure_reasons: []
      }
    });
  });

});

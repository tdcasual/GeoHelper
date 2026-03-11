import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("gateway ops runner", () => {
  it("exposes ops runner script and dry-run plan output", () => {
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.["ops:gateway:verify"]).toBeDefined();

    const tmpRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "geohelper-ops-runner-dry-run-")
    );
    const artifactRoot = path.join(tmpRoot, "artifacts");

    const run = spawnSync(
      "node",
      ["scripts/ops/run-gateway-ops-checks.mjs", "--dry-run"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          OPS_OUTPUT_ROOT: artifactRoot
        }
      }
    );

    expect(run.status).toBe(0);
    const payload = JSON.parse(run.stdout.trim()) as {
      dry_run: boolean;
      output_dir: string | null;
      steps: Array<{
        name: string;
        command: string;
      }>;
    };

    expect(payload).toEqual({
      dry_run: true,
      output_dir: null,
      steps: [
        {
          name: "gateway_smoke",
          command: "pnpm smoke:gateway-runtime -- --dry-run"
        },
        {
          name: "quality_benchmark",
          command: "pnpm bench:quality -- --dry-run"
        }
      ]
    });
    expect(fs.existsSync(artifactRoot)).toBe(false);
  });

  it("writes smoke and benchmark artifacts with a manifest", () => {
    const tmpRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "geohelper-ops-runner-live-")
    );
    const artifactRoot = path.join(tmpRoot, "ops-output");
    const stamp = "2026-03-11T15-30-00Z";

    const run = spawnSync(
      "node",
      ["scripts/ops/run-gateway-ops-checks.mjs"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          OPS_OUTPUT_ROOT: artifactRoot,
          OPS_ARTIFACT_STAMP: stamp,
          OPS_USE_DRY_RUN_SUBCOMMANDS: "1"
        }
      }
    );

    expect(run.status).toBe(0);
    const payload = JSON.parse(run.stdout.trim()) as {
      dry_run: boolean;
      output_dir: string;
    };
    const outputDir = path.join(artifactRoot, stamp);

    expect(payload.dry_run).toBe(false);
    expect(payload.output_dir).toBe(outputDir);
    expect(fs.existsSync(path.join(outputDir, "manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "smoke.json"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "benchmark.json"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "summary.json"))).toBe(true);

    const manifest = JSON.parse(
      fs.readFileSync(path.join(outputDir, "manifest.json"), "utf8")
    ) as {
      status: string;
      artifacts: Record<string, string>;
    };
    expect(manifest).toEqual({
      status: "ok",
      artifacts: {
        smoke: "smoke.json",
        benchmark: "benchmark.json",
        summary: "summary.json"
      }
    });
  });


  it("fails the summary when smoke or benchmark thresholds are violated", () => {
    const tmpRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "geohelper-ops-runner-thresholds-")
    );
    const artifactRoot = path.join(tmpRoot, "ops-output");
    const stamp = "2026-03-11T15-40-00Z";

    const run = spawnSync(
      "node",
      ["scripts/ops/run-gateway-ops-checks.mjs"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          OPS_OUTPUT_ROOT: artifactRoot,
          OPS_ARTIFACT_STAMP: stamp,
          OPS_USE_DRY_RUN_SUBCOMMANDS: "1",
          OPS_USE_MOCK_RESULTS: "1",
          OPS_MOCK_SMOKE_JSON: JSON.stringify({
            dry_run: false,
            checks: [
              { name: "GET /api/v1/health", ok: false },
              { name: "GET /api/v1/ready", ok: true }
            ]
          }),
          OPS_MOCK_BENCHMARK_JSON: JSON.stringify({
            dry_run: false,
            success_rate: 0.5,
            by_domain: {
              "2d": { p95_latency_ms: 2400 },
              "3d": { p95_latency_ms: 900 },
              "cas": { p95_latency_ms: 800 },
              "probability": { p95_latency_ms: 700 }
            }
          }),
          OPS_BENCH_MIN_SUCCESS_RATE: "0.95",
          OPS_BENCH_MAX_P95_MS: "1200"
        }
      }
    );

    expect(run.status).toBe(1);
    const payload = JSON.parse(run.stdout.trim()) as {
      status: string;
      failure_reasons: string[];
    };

    expect(payload.status).toBe("failed");
    expect(payload.failure_reasons).toEqual([
      "gateway_smoke_failed",
      "benchmark_success_rate_below_threshold",
      "benchmark_p95_latency_above_threshold"
    ]);
  });

});

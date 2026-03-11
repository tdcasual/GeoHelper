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
});

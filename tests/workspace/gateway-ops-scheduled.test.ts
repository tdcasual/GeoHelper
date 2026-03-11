import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
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
});

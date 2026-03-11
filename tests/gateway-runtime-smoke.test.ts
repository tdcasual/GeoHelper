import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("gateway runtime smoke script", () => {
  it("exposes a dry-run plan with ordered gateway checks", () => {
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.["smoke:gateway-runtime"]).toBeDefined();

    const run = spawnSync(
      "node",
      ["scripts/smoke/gateway-runtime.mjs", "--dry-run"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PRESET_TOKEN: "preset-token",
          ADMIN_METRICS_TOKEN: "admin-token"
        }
      }
    );

    expect(run.status).toBe(0);
    const payload = JSON.parse(run.stdout.trim()) as {
      dry_run: boolean;
      checks: Array<{ name: string }>;
    };

    expect(payload.dry_run).toBe(true);
    expect(payload.checks.map((check) => check.name)).toEqual([
      "GET /api/v1/health",
      "GET /api/v1/ready",
      "POST /api/v1/auth/token/login",
      "POST /api/v1/auth/token/revoke",
      "POST /api/v1/chat/compile",
      "GET /admin/metrics"
    ]);
  });
});

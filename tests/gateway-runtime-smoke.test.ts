import { spawnSync } from "node:child_process";
import fs from "node:fs";

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
      checks: Array<{ name: string; method: string; path: string }>;
    };

    expect(payload.dry_run).toBe(true);
    expect(payload.checks).toEqual([
      {
        name: "GET /api/v1/health",
        method: "GET",
        path: "/api/v1/health"
      },
      {
        name: "GET /api/v1/ready",
        method: "GET",
        path: "/api/v1/ready"
      },
      {
        name: "GET /admin/version",
        method: "GET",
        path: "/admin/version"
      },
      {
        name: "POST /api/v1/auth/token/login",
        method: "POST",
        path: "/api/v1/auth/token/login"
      },
      {
        name: "POST /api/v1/auth/token/revoke",
        method: "POST",
        path: "/api/v1/auth/token/revoke"
      },
      {
        name: "POST /api/v1/chat/compile",
        method: "POST",
        path: "/api/v1/chat/compile"
      },
      {
        name: "GET /admin/compile-events",
        method: "GET",
        path: "/admin/compile-events?limit=10"
      },
      {
        name: "GET /admin/metrics",
        method: "GET",
        path: "/admin/metrics"
      }
    ]);
  });
});

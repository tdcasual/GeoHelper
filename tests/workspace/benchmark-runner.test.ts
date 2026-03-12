import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("quality benchmark runner", () => {
  it("exposes bench script and supports dry run summary output", () => {
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.["bench:quality"]).toBeDefined();

    const run = spawnSync(
      "node",
      ["scripts/bench/run-quality-benchmark.mjs", "--dry-run"],
      {
        encoding: "utf8"
      }
    );

    expect(run.status).toBe(0);
    const payload = JSON.parse(run.stdout.trim()) as {
      dry_run: boolean;
      total_cases: number;
      by_domain: Record<string, number>;
      capability_gates: {
        gateway_attachments: string;
        vision_smoke_required_when_enabled: boolean;
      };
    };

    expect(payload.dry_run).toBe(true);
    expect(payload.capability_gates).toEqual({
      gateway_attachments: "explicit_flag",
      vision_smoke_required_when_enabled: true
    });
    expect(payload.total_cases).toBe(80);
    expect(payload.by_domain["2d"]).toBe(20);
    expect(payload.by_domain["3d"]).toBe(20);
    expect(payload.by_domain.cas).toBe(20);
    expect(payload.by_domain.probability).toBe(20);
  });
});

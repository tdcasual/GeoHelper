import { spawnSync } from "node:child_process";
import fs from "node:fs";

import { describe, expect, it } from "vitest";

describe("test runner noise controls", () => {
  it(
    "uses projects-based vitest config and keeps targeted test runs warning-free",
    { timeout: 15_000 },
    () => {
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    const rootVitestConfig = fs.readFileSync("vitest.config.ts", "utf8");

    expect(packageJson.scripts?.test).toContain("--localstorage-file=");
    expect(packageJson.scripts?.test).toContain("mktemp");
    expect(rootVitestConfig).toContain("projects");
    expect(fs.existsSync("vitest.workspace.ts")).toBe(false);

    const run = spawnSync(
      "pnpm",
      [
        "test",
        "--",
        "--run",
        "--project",
        "@geohelper/web",
        "apps/web/src/state/ui-store.test.ts"
      ],
      {
        encoding: "utf8"
      }
    );

    expect(run.status).toBe(0);
    const output = `${run.stdout}\n${run.stderr}`;
    expect(output).not.toContain("The workspace file is deprecated");
    expect(output).not.toContain("--localstorage-file was provided without a valid path");
    }
  );
});

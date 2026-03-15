import fs from "node:fs";

import { describe, expect, it } from "vitest";

describe("quality gates", () => {
  it("defines lint and dependency boundary checks in repo and CI", () => {
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    const ciWorkflow = fs.readFileSync(".github/workflows/ci-quality.yml", "utf8");
    const eslintConfig = fs.readFileSync("eslint.config.mjs", "utf8");
    const depCruiseConfig = fs.readFileSync(".dependency-cruiser.cjs", "utf8");
    const dependencyRules = fs.readFileSync(
      "docs/architecture/dependency-rules.md",
      "utf8"
    );

    expect(packageJson.scripts?.lint).toBe("eslint .");
    expect(packageJson.scripts?.["lint:fix"]).toBe("eslint . --fix");
    expect(packageJson.scripts?.["deps:check"]).toBe(
      "depcruise apps/web/src apps/gateway/src --config .dependency-cruiser.cjs"
    );

    expect(ciWorkflow).toContain("Run architecture verification");
    expect(ciWorkflow).toContain("pnpm verify:architecture");
    expect(ciWorkflow).toContain("pnpm lint");
    expect(ciWorkflow).toContain("pnpm deps:check");

    expect(eslintConfig).toContain("@typescript-eslint");
    expect(eslintConfig).toContain("no-unused-vars");
    expect(eslintConfig).toContain("simple-import-sort");
    expect(eslintConfig).toContain("apps/web/public/vendor/**");
    expect(eslintConfig).toContain("**/dist/**");
    expect(eslintConfig).toContain("**/coverage/**");
    expect(fs.existsSync(".eslintignore")).toBe(false);

    expect(depCruiseConfig).toContain("packages/protocol");
    expect(depCruiseConfig).toContain("apps/web/src");
    expect(depCruiseConfig).toContain("apps/gateway/src");
    expect(depCruiseConfig).toContain("forbidden");

    expect(dependencyRules).toContain("shared contract");
    expect(dependencyRules).toContain("apps/web/src must not import apps/gateway/src");
    expect(dependencyRules).toContain("apps/gateway/src must not import apps/web/src");
    expect(dependencyRules).toContain("packages/protocol must not import apps/");
  });
});

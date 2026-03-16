import fs from "node:fs";

import { describe, expect, it } from "vitest";

describe("architecture verify script", () => {
  it("provides a single verification entrypoint and allows documented baseline warnings", async () => {
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    const verifyScript = fs.readFileSync(
      "scripts/quality/verify-architecture.sh",
      "utf8"
    );
    const ciWorkflow = fs.readFileSync(".github/workflows/ci-quality.yml", "utf8");
    const betaChecklist = fs.readFileSync("docs/BETA_CHECKLIST.md", "utf8");
    const baseline = fs.readFileSync(
      "docs/architecture/maintainability-baseline.md",
      "utf8"
    );
    const dependencyRules = fs.readFileSync(
      "docs/architecture/dependency-rules.md",
      "utf8"
    );

    const warningModule = await import("../../scripts/quality/check-build-warnings.mjs");
    const warnings = [
      "dynamic import will not move module into another chunk",
      "(!) /Users/example/worktrees/maintainability-wave1/apps/web/src/storage/backup.ts is dynamically imported by /Users/example/worktrees/maintainability-wave1/apps/web/src/storage/remote-sync.ts but also statically imported by /Users/example/worktrees/maintainability-wave1/apps/web/src/components/SettingsDrawer.tsx, dynamic import will not move module into another chunk.",
      "some brand new warning"
    ];

    expect(
      warningModule.filterDocumentedBaselineWarnings({
        warnings,
        baselineContent: baseline
      })
    ).toEqual(["some brand new warning"]);

    expect(packageJson.scripts?.["verify:architecture"]).toBe(
      "bash scripts/quality/verify-architecture.sh"
    );
    expect(verifyScript).toContain("pnpm lint");
    expect(verifyScript).toContain("pnpm deps:check");
    expect(verifyScript).toContain("pnpm typecheck");
    expect(verifyScript).toContain("pnpm test -- --run");
    expect(verifyScript).toContain("pnpm build:web");
    expect(verifyScript).toContain("pnpm quality:build-warnings");

    expect(ciWorkflow).toContain("Run architecture verification");
    expect(ciWorkflow).toContain("pnpm verify:architecture");

    expect(betaChecklist).toContain("pnpm lint");
    expect(betaChecklist).toContain("pnpm deps:check");
    expect(betaChecklist).toContain("pnpm verify:architecture");
    expect(baseline).toContain("No actionable build warnings detected");
    expect(baseline).toContain("Resolved warning signature");
    expect(baseline).not.toContain("The current web build emits an actionable Vite warning");
    expect(dependencyRules).toContain("`components/` 不直接导入 `storage/backup.ts`");
    expect(dependencyRules).toContain("shell components 通过 controller hooks 间接访问 runtime side effects");
    expect(dependencyRules).toContain("`state/*-store.ts` 优先依赖 `*-persistence.ts` 和 `*-resolver.ts`");
  });
});

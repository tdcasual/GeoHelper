import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("architecture budgets", () => {
  it("defines maintainability budgets, hotspot scanning, and build warning detection", async () => {
    const reportModule = await import("../../scripts/quality/report-hotspots.mjs");
    const warningModule = await import("../../scripts/quality/check-build-warnings.mjs");

    expect(reportModule.classifyFile("apps/web/src/components/SettingsDrawer.tsx")).toBe(
      "component"
    );
    expect(reportModule.classifyFile("apps/web/src/state/settings-store.ts")).toBe(
      "store"
    );
    expect(reportModule.classifyFile("apps/web/src/styles.css")).toBe("style");
    expect(reportModule.classifyFile("packages/protocol/src/schema.ts")).toBe("other");

    const budgets = reportModule.loadBudgetConfig();
    expect(budgets.maxComponentLines).toBe(500);
    expect(budgets.maxStoreLines).toBe(600);
    expect(budgets.maxStyleLines).toBe(700);
    expect(budgets.requiredHotspots).toEqual(
      expect.arrayContaining([
        "apps/web/src/components/SettingsDrawer.tsx",
        "apps/web/src/components/WorkspaceShell.tsx",
        "apps/web/src/state/settings-store.ts",
        "apps/web/src/state/chat-store.ts",
        "apps/web/src/styles.css"
      ])
    );

    const hotspots = reportModule.collectHotspots({
      cwd: process.cwd(),
      budgets
    });
    const hotspotPaths = hotspots.map((item: { filePath: string }) => item.filePath);
    expect(hotspotPaths).toEqual(
      expect.arrayContaining([
        "apps/web/src/components/SettingsDrawer.tsx",
        "apps/web/src/components/WorkspaceShell.tsx",
        "apps/web/src/state/settings-store.ts",
        "apps/web/src/state/chat-store.ts",
        "apps/web/src/styles.css"
      ])
    );

    const settingsDrawer = hotspots.find(
      (item: { filePath: string }) =>
        item.filePath === "apps/web/src/components/SettingsDrawer.tsx"
    );
    expect(settingsDrawer?.lineCount).toBeGreaterThan(budgets.maxComponentLines);

    expect(
      warningModule.containsActionableBuildWarning(
        "[plugin vite:reporter] apps/web/src/storage/backup.ts is dynamically imported by remote-sync.ts but also statically imported by SettingsDrawer.tsx, dynamic import will not move module into another chunk."
      )
    ).toBe(true);
    expect(
      warningModule.containsActionableBuildWarning(
        "vite v7.3.1 building client environment for production..."
      )
    ).toBe(false);

    const baselinePath = path.join(
      process.cwd(),
      "docs/architecture/maintainability-baseline.md"
    );
    const baseline = fs.readFileSync(baselinePath, "utf8");
    expect(baseline).toContain("SettingsDrawer.tsx");
    expect(baseline).toContain("WorkspaceShell.tsx");
    expect(baseline).toContain("settings-store.ts");
    expect(baseline).toContain("chat-store.ts");
    expect(baseline).toContain("styles.css");
    expect(baseline).toContain("maxComponentLines");
    expect(baseline).toContain("maxStoreLines");
    expect(baseline).toContain("maxStyleLines");
    expect(baseline).toContain("dynamic import will not move module into another chunk");
  });
});

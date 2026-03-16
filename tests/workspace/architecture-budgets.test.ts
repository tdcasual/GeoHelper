import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const countLines = (filePath: string) =>
  fs.readFileSync(filePath, "utf8").split(/\r?\n/).length;

describe("architecture budgets", () => {
  it("defines maintainability budgets, hotspot scanning, and build warning detection", async () => {
    const reportModule = await import("../../scripts/quality/report-hotspots.mjs");
    const warningModule = await import("../../scripts/quality/check-build-warnings.mjs");

    expect(reportModule.classifyFile("apps/web/src/components/SettingsDrawer.tsx")).toBe(
      "component"
    );
    expect(
      reportModule.classifyFile(
        "apps/web/src/components/settings-remote-backup.test.ts"
      )
    ).toBe("test");
    expect(reportModule.classifyFile("apps/web/src/state/settings-store.ts")).toBe(
      "store"
    );
    expect(reportModule.classifyFile("apps/web/src/styles.css")).toBe("style");
    expect(reportModule.classifyFile("packages/protocol/src/schema.ts")).toBe("other");

    const budgets = reportModule.loadBudgetConfig();
    expect(budgets.maxComponentLines).toBe(500);
    expect(budgets.maxStoreLines).toBe(600);
    expect(budgets.maxStyleLines).toBe(700);
    expect(budgets.maxTestLines).toBe(600);
    expect(budgets.requiredHotspots).toEqual([]);

    expect(
      reportModule.resolveBudgetCategory("apps/web/src/storage/backup.test.ts", "test")
    ).toBe("test");
    expect(
      reportModule.resolveBudgetCategory(
        "apps/web/src/runtime/gateway-client.test.ts",
        "test"
      )
    ).toBe("test");
    expect(
      reportModule.resolveBudgetCategory("apps/gateway/test/admin-backups.test.ts", "test")
    ).toBe("test");
    expect(
      reportModule.resolveBudgetCategory("tests/e2e/settings-drawer.spec.ts", "test")
    ).toBe("test");

    const hotspots = reportModule.collectHotspots({
      cwd: process.cwd(),
      budgets
    });
    const hotspotPaths = hotspots.map((item: { filePath: string }) => item.filePath);
    expect(hotspotPaths).not.toContain("apps/web/src/components/SettingsDrawer.tsx");
    expect(hotspotPaths).not.toContain("apps/web/src/components/WorkspaceShell.tsx");
    expect(hotspotPaths).not.toContain("apps/web/src/state/chat-store.ts");
    expect(hotspotPaths).not.toContain(
      "apps/web/src/components/settings-drawer/SettingsDataSection.tsx"
    );
    expect(hotspotPaths).not.toContain("apps/web/src/components/CanvasPanel.tsx");
    expect(hotspotPaths).not.toContain("apps/web/src/state/settings-store.ts");
    expect(hotspotPaths).not.toContain("apps/web/src/styles.css");
    expect(hotspotPaths).not.toContain(
      "apps/web/src/components/settings-remote-backup.test.ts"
    );
    expect(hotspotPaths).not.toContain("apps/web/src/state/settings-store.test.ts");
    const includeTestHotspots = reportModule.collectHotspots({
      cwd: process.cwd(),
      budgets,
      includeTests: true
    });
    const includeTestHotspotPaths = includeTestHotspots.map(
      (item: { filePath: string }) => item.filePath
    );
    expect(includeTestHotspotPaths).not.toContain("tests/e2e/settings-drawer.spec.ts");
    expect(includeTestHotspotPaths).not.toContain("tests/e2e/settings-drawer.general.spec.ts");
    expect(includeTestHotspotPaths).not.toContain("tests/e2e/settings-drawer.backup.spec.ts");
    expect(includeTestHotspotPaths).not.toContain("tests/e2e/settings-drawer.rollback.spec.ts");
    expect(includeTestHotspotPaths).not.toContain(
      "tests/e2e/settings-drawer.remote-sync.spec.ts"
    );
    expect(includeTestHotspotPaths).not.toContain(
      "tests/e2e/settings-drawer.remote-import.spec.ts"
    );
    expect(includeTestHotspotPaths).not.toContain(
      "tests/e2e/settings-drawer.remote-history.spec.ts"
    );
    expect(includeTestHotspotPaths).not.toContain(
      "tests/e2e/settings-drawer.remote-protection.spec.ts"
    );
    expect(includeTestHotspotPaths).not.toContain("tests/e2e/fullscreen-toggle.spec.ts");
    expect(includeTestHotspotPaths).not.toContain("tests/e2e/fullscreen-toggle.desktop.spec.ts");
    expect(includeTestHotspotPaths).not.toContain(
      "tests/e2e/fullscreen-toggle.mobile-layout.spec.ts"
    );
    expect(includeTestHotspotPaths).not.toContain(
      "tests/e2e/fullscreen-toggle.mobile-chat.spec.ts"
    );
    expect(includeTestHotspotPaths).not.toContain("apps/gateway/test/admin-backups.test.ts");
    expect(includeTestHotspotPaths).not.toContain("apps/web/src/state/settings-store.test.ts");
    expect(includeTestHotspotPaths).not.toContain(
      "apps/web/src/state/settings-store.runtime.test.ts"
    );
    expect(includeTestHotspotPaths).not.toContain("apps/web/src/storage/backup.test.ts");
    expect(includeTestHotspotPaths).not.toContain(
      "apps/web/src/storage/backup.import.test.ts"
    );
    expect(includeTestHotspotPaths).not.toContain(
      "apps/web/src/runtime/gateway-client.test.ts"
    );
    expect(includeTestHotspotPaths).not.toContain(
      "apps/web/src/runtime/gateway-client.history.test.ts"
    );
    expect(includeTestHotspotPaths).not.toContain(
      "apps/gateway/test/redis-backup-store.test.ts"
    );
    expect(reportModule.renderHotspotReport({ cwd: process.cwd(), budgets })).toContain(
      "No over-budget files detected."
    );
    const includeTestReport = reportModule.renderHotspotReport({
      cwd: process.cwd(),
      budgets,
      includeTests: true
    });
    expect(includeTestReport).not.toContain("tests/e2e/settings-drawer.spec.ts");
    expect(includeTestReport).not.toContain("tests/e2e/fullscreen-toggle.spec.ts");
    expect(includeTestReport).toContain("No over-budget files detected.");
    expect(countLines("apps/web/src/components/SettingsDrawer.tsx")).toBeLessThan(
      500
    );
    expect(countLines("apps/web/src/components/WorkspaceShell.tsx")).toBeLessThan(
      500
    );
    expect(countLines("apps/web/src/state/settings-store.ts")).toBeLessThan(750);
    expect(countLines("apps/web/src/state/chat-store.ts")).toBeLessThan(500);
    expect(
      countLines("apps/web/src/components/settings-drawer/SettingsDataSection.tsx")
    ).toBeLessThan(400);
    expect(countLines("apps/web/src/components/CanvasPanel.tsx")).toBeLessThan(400);
    expect(countLines("apps/web/src/styles.css")).toBeLessThan(120);
    expect(countLines("apps/web/src/storage/backup.ts")).toBeLessThan(450);
    expect(countLines("apps/web/src/storage/remote-sync.ts")).toBeLessThan(320);
    expect(countLines("apps/web/src/state/settings-store.test.ts")).toBeLessThan(260);
    expect(countLines("apps/web/src/storage/backup.test.ts")).toBeLessThan(260);
    expect(countLines("apps/web/src/runtime/gateway-client.test.ts")).toBeLessThan(
      260
    );
    expect(countLines("apps/gateway/test/admin-backups.test.ts")).toBeLessThan(260);
    expect(countLines("apps/gateway/test/redis-backup-store.test.ts")).toBeLessThan(
      260
    );
    expect(countLines("tests/e2e/settings-drawer.spec.ts")).toBeLessThan(260);
    expect(countLines("tests/e2e/settings-drawer.general.spec.ts")).toBeLessThan(600);
    expect(countLines("tests/e2e/settings-drawer.backup.spec.ts")).toBeLessThan(600);
    expect(countLines("tests/e2e/settings-drawer.rollback.spec.ts")).toBeLessThan(600);
    expect(countLines("tests/e2e/settings-drawer.remote-sync.spec.ts")).toBeLessThan(600);
    expect(countLines("tests/e2e/settings-drawer.remote-import.spec.ts")).toBeLessThan(600);
    expect(countLines("tests/e2e/settings-drawer.remote-history.spec.ts")).toBeLessThan(600);
    expect(countLines("tests/e2e/settings-drawer.remote-protection.spec.ts")).toBeLessThan(
      600
    );
    expect(countLines("tests/e2e/fullscreen-toggle.spec.ts")).toBeLessThan(260);
    expect(countLines("tests/e2e/fullscreen-toggle.desktop.spec.ts")).toBeLessThan(600);
    expect(countLines("tests/e2e/fullscreen-toggle.mobile-layout.spec.ts")).toBeLessThan(
      600
    );
    expect(countLines("tests/e2e/fullscreen-toggle.mobile-chat.spec.ts")).toBeLessThan(600);

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
    expect(baseline).toContain("SettingsDataSection.tsx");
    expect(baseline).toContain("CanvasPanel.tsx");
    expect(baseline).toContain("styles.css");
    expect(baseline).toContain("maxComponentLines");
    expect(baseline).toContain("maxStoreLines");
    expect(baseline).toContain("maxStyleLines");
    expect(baseline).toContain("maxTestLines");
    expect(baseline).toContain("No active production hotspots over budget");
    expect(baseline).not.toContain(
      "Current include-tests hotspots:\n\n- `tests/e2e/settings-drawer.spec.ts`"
    );
    expect(baseline).toContain("No active include-tests hotspots over budget");
    expect(baseline).toContain("SettingsDrawer.tsx < 500");
    expect(baseline).toContain("SettingsDataSection.tsx < 400");
    expect(baseline).toContain("WorkspaceShell.tsx < 500");
    expect(baseline).toContain("CanvasPanel.tsx < 400");
    expect(baseline).toContain("settings-store.ts < 750");
    expect(baseline).toContain("styles.css < 120");
    expect(baseline).toContain("chat-store.ts < 500");
    expect(baseline).toContain("backup.ts < 450");
    expect(baseline).toContain("remote-sync.ts < 320");
    expect(baseline).toContain("settings-store.test.ts < 260");
    expect(baseline).toContain("backup.test.ts < 260");
    expect(baseline).toContain("gateway-client.test.ts < 260");
    expect(baseline).toContain("admin-backups.test.ts < 260");
    expect(baseline).toContain("redis-backup-store.test.ts < 260");
    expect(baseline).toContain("settings-drawer.spec.ts < 260");
    expect(baseline).toContain("fullscreen-toggle.spec.ts < 260");
    expect(baseline).toContain("dynamic import will not move module into another chunk");
  });
});

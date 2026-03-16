import { describe, expect, it } from "vitest";

describe("hotspot reporting", () => {
  it("excludes test files from default hotspot collection", async () => {
    const reportModule = await import("../../scripts/quality/report-hotspots.mjs");
    const hotspots = reportModule.collectHotspots({ cwd: process.cwd() });
    const hotspotPaths = hotspots.map((item: { filePath: string }) => item.filePath);

    expect(hotspotPaths).not.toContain(
      "apps/web/src/components/settings-remote-backup.test.ts"
    );
    expect(hotspotPaths).not.toContain(
      "apps/web/src/state/settings-store.test.ts"
    );
  });

  it("classifies test files separately and only reports still-over-budget test hotspots when requested", async () => {
    const reportModule = await import("../../scripts/quality/report-hotspots.mjs");

    expect(
      reportModule.classifyFile(
        "apps/web/src/components/settings-remote-backup.test.ts"
      )
    ).toBe("test");
    expect(
      reportModule.resolveBudgetCategory("apps/web/src/state/settings-store.test.ts", "test")
    ).toBe("test");

    const hotspots = reportModule.collectHotspots({
      cwd: process.cwd(),
      includeTests: true
    });
    const hotspotPaths = hotspots.map((item: { filePath: string }) => item.filePath);

    expect(hotspotPaths).not.toContain("tests/e2e/fullscreen-toggle.spec.ts");
    expect(hotspotPaths).not.toContain("tests/e2e/settings-drawer.spec.ts");
    expect(hotspotPaths).not.toContain("tests/e2e/settings-drawer.remote-sync.spec.ts");
    expect(hotspotPaths).not.toContain("tests/e2e/fullscreen-toggle.desktop.spec.ts");
    expect(hotspotPaths).not.toContain("apps/web/src/state/settings-store.test.ts");
  });
});

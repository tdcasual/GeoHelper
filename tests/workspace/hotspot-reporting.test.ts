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

  it("classifies test files separately and includes over-budget test hotspots only when requested", async () => {
    const reportModule = await import("../../scripts/quality/report-hotspots.mjs");

    expect(
      reportModule.classifyFile(
        "apps/web/src/components/settings-remote-backup.test.ts"
      )
    ).toBe("test");

    const hotspots = reportModule.collectHotspots({
      cwd: process.cwd(),
      includeTests: true
    });
    const hotspotPaths = hotspots.map((item: { filePath: string }) => item.filePath);

    expect(hotspotPaths).toContain("apps/web/src/state/settings-store.test.ts");
  });
});

import fs from "node:fs";

import { describe, expect, it } from "vitest";

describe("beta checklist docs", () => {
  it("includes environment, rollback, known limits, and on-call sections", () => {
    const txt = fs.readFileSync("docs/BETA_CHECKLIST.md", "utf8");
    expect(txt).toContain("## Environment Variables");
    expect(txt).toContain("## Rollback Plan");
    expect(txt).toContain("## Known Limits");
    expect(txt).toContain("## On-call & Contacts");
    expect(txt).toContain("GATEWAY_ENABLE_ATTACHMENTS");
    expect(txt).toContain("vision smoke failures block promotion");
    expect(txt).toContain("direct runtime and gateway runtime can legitimately differ in vision support");
    expect(txt).toContain("lightweight cloud sync remains snapshot-based");
    expect(txt).toContain("no SQL or full cloud history backend is required");
    expect(txt).toContain("startup freshness checks are metadata-only");
    expect(txt).toContain("delayed upload is opt-in and never auto-restores");
    expect(txt).toContain("browser sync defaults to guarded writes");
    expect(txt).toContain("force overwrite requires an explicit danger action");
    expect(txt).toContain("unconditional admin latest write remains operator-only");
    expect(txt).toContain("selected historical snapshots can be fetched by `snapshot_id`");
    expect(txt).toContain("blocked/conflict sync states should be resolved");
    expect(txt).toContain("BACKUP_MAX_HISTORY");
    expect(txt).toContain("BACKUP_MAX_PROTECTED");
    expect(txt).toContain("protected snapshots do not auto-expire");
    expect(txt).toContain("ordinary retained history and protected retained snapshots are bounded separately");
    expect(txt).toContain("new protect requests fail explicitly when protected capacity is full");
    expect(txt).toContain("manual metadata operation");
    expect(txt).toContain("does not imply import or restore");
    expect(txt).toContain("Release-Candidate Shared-Staging Evidence");
    expect(txt).toContain("pnpm smoke:platform-run-remote");
    expect(txt).toContain("release-candidate-summary.json");
    expect(txt).toContain("GATEWAY_URL");
    expect(txt).toContain("CONTROL_PLANE_URL");
    expect(txt).toContain("PRESET_TOKEN");
    expect(txt).toContain("ADMIN_METRICS_TOKEN");
    expect(txt).toContain("shared-staging");
  });
});

import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("deploy docs", () => {
  it("documents geogebra self-hosted vendor sync before web build", () => {
    const txt = fs.readFileSync("docs/deploy/edgeone.md", "utf8");
    const readme = fs.readFileSync("README.md", "utf8");
    expect(txt).toContain("pnpm geogebra:sync");
    expect(txt).toContain("latest");
    expect(txt).toContain("fallback");
    expect(txt).toContain("vendor/geogebra/manifest.json");
    expect(txt).toContain("auto-publishes the gateway image to GHCR");
    expect(txt).toContain("successful `main` CI");
    expect(txt).toContain("runtime deployment remains manual");
    expect(txt).toContain("ghcr.io/<owner>/geohelper-gateway:staging");
    expect(txt).toContain("ghcr.io/<owner>/geohelper-gateway:sha-<shortsha>");
    expect(txt).toContain("GATEWAY_ENABLE_ATTACHMENTS");
    expect(txt).toContain("attachments_enabled");
    expect(txt).toContain("lightweight cloud sync");
    expect(txt).toContain("snapshot-based");
    expect(txt).toContain("metadata-only startup freshness checks");
    expect(txt).toContain("delayed upload");
    expect(txt).toContain("never auto-restores");
    expect(txt).toContain("browser sync defaults to guarded writes");
    expect(txt).toContain("force overwrite requires an explicit danger action");
    expect(txt).toContain("unconditional admin latest write remains available for operator/manual recovery");
    expect(txt).toContain("selected historical snapshots can be fetched by `snapshot_id`");
    expect(txt).toContain("/admin/backups/history/<snapshot-id>");
    expect(txt).toContain("BACKUP_MAX_HISTORY");
    expect(txt).toContain("BACKUP_MAX_PROTECTED");
    expect(txt).toContain("protected snapshots do not auto-expire");
    expect(txt).toContain("ordinary retained history and protected retained snapshots are bounded separately");
    expect(txt).toContain("new protect requests fail explicitly when protected capacity is full");
    expect(txt).toContain("/admin/backups/history/<snapshot-id>/protect");
    expect(readme).toContain("GitHub Actions auto-publishes the gateway image to GHCR");
    expect(readme).toContain("gateway runtime deployment remains manual");
  });
});

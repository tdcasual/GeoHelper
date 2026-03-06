import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("geogebra deploy automation", () => {
  it("runs the self-hosted GeoGebra build pipeline in deployment scripts", () => {
    const edgeoneDeploy = fs.readFileSync("scripts/deploy/edgeone-deploy.sh", "utf8");
    const stagingUp = fs.readFileSync("scripts/deploy/staging-up.sh", "utf8");
    const ciWorkflow = fs.readFileSync(".github/workflows/ci-quality.yml", "utf8");

    expect(edgeoneDeploy).toContain("pnpm build:web");
    expect(stagingUp).toContain("pnpm build:web");
    expect(ciWorkflow).toContain("pnpm build:web");
  });
});

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

  it("publishes the gateway image to ghcr after successful main-branch ci", () => {
    const gatewayImageWorkflow = fs.readFileSync(
      ".github/workflows/gateway-image.yml",
      "utf8"
    );

    expect(gatewayImageWorkflow).toContain("workflow_run:");
    expect(gatewayImageWorkflow).toContain("CI Quality Gate");
    expect(gatewayImageWorkflow).toContain("branches:");
    expect(gatewayImageWorkflow).toContain("main");
    expect(gatewayImageWorkflow).toContain("conclusion == 'success'");
    expect(gatewayImageWorkflow).toContain("event == 'push'");
    expect(gatewayImageWorkflow).toContain("docker/login-action");
    expect(gatewayImageWorkflow).toContain("docker/build-push-action");
    expect(gatewayImageWorkflow).toContain("ghcr.io");
    expect(gatewayImageWorkflow).toContain("geohelper-gateway");
    expect(gatewayImageWorkflow).toContain(":staging");
    expect(gatewayImageWorkflow).toContain(":sha-");
    expect(gatewayImageWorkflow).toContain("build-contexts: |");
    expect(gatewayImageWorkflow).toContain("repo=.");
    expect(gatewayImageWorkflow).toContain("GEOHELPER_BUILD_SHA");
    expect(gatewayImageWorkflow).toContain("GEOHELPER_BUILD_TIME");
  });

  it("keeps the ci workflow pnpm version aligned with packageManager", () => {
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      packageManager?: string;
    };
    const ciWorkflow = fs.readFileSync(".github/workflows/ci-quality.yml", "utf8");
    const setupPnpmBlock = ciWorkflow.match(
      /- name: Setup pnpm[\s\S]*?uses: pnpm\/action-setup@v4[\s\S]*?with:\n([\s\S]*?)\n\s*- name:/
    );

    expect(packageJson.packageManager).toBeDefined();
    expect(setupPnpmBlock?.[1]).toBeDefined();
    expect(setupPnpmBlock?.[1]).not.toMatch(/^\s+version:/m);
  });
});

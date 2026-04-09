import fs from "node:fs";

import { describe, expect, it } from "vitest";

describe("control-plane image release contract", () => {
  it("exposes a root build script for the control-plane image", () => {
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["docker:control-plane:build"]).toBeDefined();
  });

  it("publishes the control-plane image from a dedicated workflow", () => {
    const workflowPath = ".github/workflows/control-plane-image.yml";

    expect(fs.existsSync(workflowPath)).toBe(true);

    const workflow = fs.readFileSync(workflowPath, "utf8");
    expect(workflow).toContain("workflow_run:");
    expect(workflow).toContain("CI Quality Gate");
    expect(workflow).toContain("branches:");
    expect(workflow).toContain("main");
    expect(workflow).toContain("conclusion == 'success'");
    expect(workflow).toContain("event == 'push'");
    expect(workflow).toContain("docker/login-action");
    expect(workflow).toContain("docker/build-push-action");
    expect(workflow).toContain("ghcr.io");
    expect(workflow).toContain("geohelper-control-plane");
    expect(workflow).toContain(":staging");
    expect(workflow).toContain(":sha-");
  });

  it("documents the control-plane image and tag strategy for deploys", () => {
    const readme = fs.readFileSync("README.md", "utf8");
    const deployDoc = fs.readFileSync("docs/deploy/edgeone.md", "utf8");
    const betaChecklist = fs.readFileSync("docs/BETA_CHECKLIST.md", "utf8");

    expect(readme).toContain("docker:control-plane:build");
    expect(readme).toContain("geohelper-control-plane");

    expect(deployDoc).toContain("ghcr.io/<owner>/geohelper-control-plane:staging");
    expect(deployDoc).toContain(
      "ghcr.io/<owner>/geohelper-control-plane:sha-<shortsha>"
    );
    expect(deployDoc).toContain("control-plane runtime deployment remains manual");

    expect(betaChecklist).toContain("geohelper-control-plane:staging");
    expect(betaChecklist).toContain("geohelper-control-plane:sha-<shortsha>");
  });
});

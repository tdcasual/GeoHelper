import fs from "node:fs";

import { describe, expect, it } from "vitest";

describe("live model chain smoke script", () => {
  it("validates the platform run snapshot instead of legacy compile fields", () => {
    const script = fs.readFileSync("scripts/smoke/live-model-chain.sh", "utf8");

    expect(script).toContain("/api/v3/threads");
    expect(script).toContain("/api/v3/runs/");
    expect(script).toContain("r.run_snapshot.run.id");
    expect(script).toContain("r.run_snapshot.artifacts");
    expect(script).toContain("r.run_snapshot.events");
    expect(script).toContain('"profileId":"platform_geometry_standard"');
    expect(script).not.toContain("/api/v2/agent/runs");
    expect(script).not.toContain("r.agent_run");
    expect(script).not.toContain('"agentId":"geometry_solver"');
    expect(script).not.toContain('"workflowId":"wf_geometry_solver"');
  });

  it("removes the legacy compile stack from the workspace entrypoints", () => {
    const removedPaths = [
      "apps/gateway/src/routes/agent-runs.ts",
      "apps/web/src/runtime/direct-client.ts",
      "apps/web/src/runtime/gateway-client.ts",
      "apps/web/src/runtime/orchestrator.ts",
      "apps/web/src/state/agent-run-store.ts",
      "packages/protocol/src/agent-run.ts"
    ];

    removedPaths.forEach((path) => {
      expect(fs.existsSync(path), `${path} should be deleted`).toBe(false);
    });

    const gatewayServer = fs.readFileSync("apps/gateway/src/server.ts", "utf8");
    const runtimeService = fs.readFileSync(
      "apps/web/src/runtime/runtime-service.ts",
      "utf8"
    );
    const chatStore = fs.readFileSync("apps/web/src/state/chat-store.ts", "utf8");
    const protocolIndex = fs.readFileSync("packages/protocol/src/index.ts", "utf8");
    const readme = fs.readFileSync("README.md", "utf8");
    const contract = fs.readFileSync("docs/api/m0-m1-contract.md", "utf8");

    expect(gatewayServer).not.toContain("registerAgentRunsRoute");
    expect(runtimeService).not.toContain("./direct-client");
    expect(runtimeService).not.toContain("./gateway-client");
    expect(runtimeService).not.toContain("./orchestrator");
    expect(runtimeService).not.toContain("compileWithRuntime");
    expect(chatStore).not.toContain("AgentRunEnvelope");
    expect(chatStore).not.toContain("compileWithRuntime");
    expect(chatStore).not.toContain("agent-run-store");
    expect(protocolIndex).not.toContain("./agent-run");
    expect(readme).not.toContain("/api/v2/agent/runs");
    expect(contract).not.toContain("/api/v2/agent/runs");
  });
});

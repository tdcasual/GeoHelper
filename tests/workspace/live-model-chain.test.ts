import fs from "node:fs";

import { describe, expect, it } from "vitest";

describe("live model chain smoke script", () => {
  it("validates the v2 agent run envelope instead of legacy compile fields", () => {
    const script = fs.readFileSync("scripts/smoke/live-model-chain.sh", "utf8");

    expect(script).toContain("/api/v2/agent/runs");
    expect(script).toContain("r.agent_run.run.id");
    expect(script).toContain("r.agent_run.draft?.commandBatchDraft?.commands");
    expect(script).toContain("r.agent_run.telemetry?.stages");
    expect(script).not.toContain("r.agent_steps");
  });
});

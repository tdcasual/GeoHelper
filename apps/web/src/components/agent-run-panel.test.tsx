import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { createAgentRunEnvelopeFixture } from "../test-utils/agent-run-fixture";
import { AgentRunPanel } from "./agent-run-panel";

describe("AgentRunPanel", () => {
  it("renders review history, preflight evidence, and stage timeline", () => {
    const markup = renderToStaticMarkup(
      <AgentRunPanel
        agentRun={createAgentRunEnvelopeFixture({
          run: {
            id: "run_1",
            iterationCount: 2
          }
        })}
      />
    );

    expect(markup).toContain("run_1");
    expect(markup).toContain("2 次迭代");
    expect(markup).toContain("preflight passed");
    expect(markup).toContain("author");
    expect(markup).toContain("geometry-reviewer");
  });
});

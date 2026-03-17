import { describe, expect, it } from "vitest";

import { createAgentRunEnvelopeFixture } from "../test-utils/agent-run-fixture";
import { createAgentRunStore } from "./agent-run-store";

describe("createAgentRunStore", () => {
  it("stores the latest run by id and links it to a message", () => {
    const store = createAgentRunStore();
    const agentRun = createAgentRunEnvelopeFixture({
      run: {
        id: "run_1"
      },
      teacherPacket: {
        summary: ["已生成草案"]
      }
    });

    store.getState().upsertRun(agentRun);
    store.getState().linkMessageToRun("msg_1", agentRun.run.id);

    expect(store.getState().runsById.run_1?.teacherPacket.summary[0]).toBe(
      "已生成草案"
    );
    expect(store.getState().getRunForMessage("msg_1")?.run.id).toBe("run_1");
  });
});

import { createMemoryAgentStore } from "@geohelper/agent-store";
import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";

describe("control-plane admin eval routes", () => {
  it("lists failed evaluation artifacts across runs", async () => {
    const store = createMemoryAgentStore();

    await store.runs.createRun({
      id: "run_eval_failed",
      threadId: "thread_1",
      profileId: "platform_geometry_standard",
      status: "completed",
      inputArtifactIds: [],
      outputArtifactIds: ["artifact_eval_failed"],
      budget: {
        maxModelCalls: 6,
        maxToolCalls: 8,
        maxDurationMs: 120000
      },
      createdAt: "2026-04-05T00:00:00.000Z",
      updatedAt: "2026-04-05T00:01:00.000Z"
    });
    await store.runs.createRun({
      id: "run_eval_ready",
      threadId: "thread_2",
      profileId: "platform_geometry_standard",
      status: "completed",
      inputArtifactIds: [],
      outputArtifactIds: ["artifact_eval_ready"],
      budget: {
        maxModelCalls: 6,
        maxToolCalls: 8,
        maxDurationMs: 120000
      },
      createdAt: "2026-04-05T00:02:00.000Z",
      updatedAt: "2026-04-05T00:03:00.000Z"
    });

    await store.artifacts.writeArtifact({
      id: "artifact_eval_failed",
      runId: "run_eval_failed",
      kind: "evaluation",
      contentType: "application/json",
      storage: "inline",
      inlineData: {
        evaluator: "teacher_readiness",
        ready: false,
        score: 0.45,
        warnings: ["missing_teaching_outline"]
      },
      metadata: {
        source: "teacher_readiness"
      },
      createdAt: "2026-04-05T00:00:30.000Z"
    });
    await store.artifacts.writeArtifact({
      id: "artifact_eval_ready",
      runId: "run_eval_ready",
      kind: "evaluation",
      contentType: "application/json",
      storage: "inline",
      inlineData: {
        evaluator: "teacher_readiness",
        ready: true,
        score: 0.92,
        warnings: []
      },
      metadata: {
        source: "teacher_readiness"
      },
      createdAt: "2026-04-05T00:02:30.000Z"
    });

    const app = buildServer({
      store
    });

    const res = await app.inject({
      method: "GET",
      url: "/admin/evals/failures"
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({
      evalFailures: [
        {
          evaluator: "teacher_readiness",
          run: expect.objectContaining({
            id: "run_eval_failed"
          }),
          artifact: expect.objectContaining({
            id: "artifact_eval_failed",
            kind: "evaluation",
            inlineData: expect.objectContaining({
              ready: false,
              score: 0.45
            })
          })
        }
      ]
    });
  });
});

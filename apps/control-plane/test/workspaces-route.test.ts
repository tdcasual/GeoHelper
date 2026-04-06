import { createMemoryAgentStore } from "@geohelper/agent-store";
import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";

describe("control-plane workspace routes", () => {
  it("lists workspace memory entries with optional key filtering", async () => {
    const store = createMemoryAgentStore();

    await store.memory.writeMemoryEntry({
      id: "memory_workspace_1",
      scope: "workspace",
      scopeId: "workspace_alpha",
      key: "teacher_preferences",
      value: {
        tone: "guided"
      },
      sourceRunId: "run_1",
      sourceArtifactId: "artifact_1",
      createdAt: "2026-04-05T00:00:00.000Z"
    });
    await store.memory.writeMemoryEntry({
      id: "memory_workspace_2",
      scope: "workspace",
      scopeId: "workspace_alpha",
      key: "lesson_objective",
      value: {
        topic: "triangle_proofs"
      },
      sourceRunId: "run_1",
      createdAt: "2026-04-05T00:01:00.000Z"
    });
    await store.memory.writeMemoryEntry({
      id: "memory_thread_1",
      scope: "thread",
      scopeId: "workspace_alpha",
      key: "teacher_preferences",
      value: {
        tone: "direct"
      },
      sourceRunId: "run_2",
      createdAt: "2026-04-05T00:02:00.000Z"
    });

    const app = buildServer({
      store
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v3/workspaces/workspace_alpha/memory?key=teacher_preferences"
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({
      memoryEntries: [
        expect.objectContaining({
          id: "memory_workspace_1",
          scope: "workspace",
          scopeId: "workspace_alpha",
          key: "teacher_preferences",
          value: {
            tone: "guided"
          }
        })
      ]
    });
  });
});

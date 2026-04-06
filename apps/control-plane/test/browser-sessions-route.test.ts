import { createMemoryAgentStore } from "@geohelper/agent-store";
import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";

describe("control-plane browser session routes", () => {
  it("records canvas evidence as a run artifact", async () => {
    const store = createMemoryAgentStore();

    await store.runs.createRun({
      id: "run_1",
      threadId: "thread_1",
      profileId: "platform_geometry_standard",
      status: "running",
      inputArtifactIds: [],
      outputArtifactIds: [],
      budget: {
        maxModelCalls: 6,
        maxToolCalls: 8,
        maxDurationMs: 120000
      },
      createdAt: "2026-04-04T00:00:00.000Z",
      updatedAt: "2026-04-04T00:00:00.000Z"
    });
    await store.browserSessions.createSession({
      id: "browser_session_1",
      runId: "run_1",
      allowedToolNames: ["scene.capture_snapshot"],
      createdAt: "2026-04-04T00:00:00.000Z"
    });

    const app = buildServer({
      store,
      now: () => "2026-04-04T00:01:00.000Z"
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v3/browser-sessions/browser_session_1/canvas-evidence",
      payload: {
        contentType: "application/json",
        storage: "inline",
        inlineData: {
          snapshot: "scene_1"
        },
        metadata: {
          source: "browser"
        }
      }
    });

    expect(res.statusCode).toBe(201);
    const payload = JSON.parse(res.payload) as {
      artifact: {
        id: string;
        runId: string;
        kind: string;
        contentType: string;
        storage: string;
        inlineData?: {
          snapshot: string;
        };
        metadata: Record<string, unknown>;
        createdAt: string;
      };
    };

    expect(payload.artifact).toEqual({
      id: expect.any(String),
      runId: "run_1",
      kind: "canvas_evidence",
      contentType: "application/json",
      storage: "inline",
      inlineData: {
        snapshot: "scene_1"
      },
      metadata: {
        source: "browser",
        sessionId: "browser_session_1"
      },
      createdAt: "2026-04-04T00:01:00.000Z"
    });
    expect(await store.artifacts.getArtifact(payload.artifact.id)).toEqual(
      payload.artifact
    );
    expect(await store.events.listRunEvents("run_1")).toEqual([
      expect.objectContaining({
        type: "canvas_evidence.recorded",
        payload: {
          artifactId: payload.artifact.id,
          sessionId: "browser_session_1"
        }
      })
    ]);
  });

  it("returns 404 when the browser session does not exist", async () => {
    const app = buildServer();

    const res = await app.inject({
      method: "POST",
      url: "/api/v3/browser-sessions/browser_session_missing/canvas-evidence",
      payload: {
        contentType: "application/json",
        storage: "inline",
        inlineData: {
          snapshot: "scene_missing"
        }
      }
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.payload)).toEqual({
      error: "browser_session_not_found"
    });
  });
});

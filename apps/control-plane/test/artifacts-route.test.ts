import { createMemoryAgentStore } from "@geohelper/agent-store";
import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";

describe("control-plane artifact routes", () => {
  it("gets an artifact by id", async () => {
    const store = createMemoryAgentStore();

    await store.artifacts.writeArtifact({
      id: "artifact_1",
      runId: "run_1",
      kind: "response",
      contentType: "application/json",
      storage: "inline",
      metadata: {
        source: "control-plane"
      },
      inlineData: {
        title: "几何结果"
      },
      createdAt: "2026-04-04T00:00:00.000Z"
    });

    const app = buildServer({
      store
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v3/artifacts/artifact_1"
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({
      artifact: expect.objectContaining({
        id: "artifact_1",
        kind: "response",
        contentType: "application/json"
      })
    });
  });

  it("returns 404 when an artifact does not exist", async () => {
    const app = buildServer();

    const res = await app.inject({
      method: "GET",
      url: "/api/v3/artifacts/artifact_missing"
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.payload)).toEqual({
      error: "artifact_not_found"
    });
  });
});

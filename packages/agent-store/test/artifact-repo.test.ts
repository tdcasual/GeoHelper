import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createMemoryAgentStore, createSqliteAgentStore } from "../src";

describe("artifact repo", () => {
  it("gets artifacts by id across memory and sqlite stores", async () => {
    const memoryStore = createMemoryAgentStore();

    await memoryStore.artifacts.writeArtifact({
      id: "artifact_memory_1",
      runId: "run_memory_1",
      kind: "response",
      contentType: "application/json",
      storage: "inline",
      metadata: {
        source: "memory"
      },
      inlineData: {
        title: "几何结果"
      },
      createdAt: "2026-04-04T00:00:00.000Z"
    });

    expect(await memoryStore.artifacts.getArtifact("artifact_memory_1")).toEqual(
      expect.objectContaining({
        id: "artifact_memory_1",
        kind: "response"
      })
    );
    expect(await memoryStore.artifacts.getArtifact("artifact_missing")).toBeNull();

    const tempDir = mkdtempSync(path.join(tmpdir(), "geohelper-agent-store-"));
    const databasePath = path.join(tempDir, "agent-store.sqlite");

    try {
      const sqliteStore = createSqliteAgentStore({
        path: databasePath
      });

      await sqliteStore.runs.createRun({
        id: "run_sqlite_1",
        threadId: "thread_sqlite_1",
        profileId: "platform_geometry_standard",
        status: "completed",
        inputArtifactIds: [],
        outputArtifactIds: ["artifact_sqlite_1"],
        budget: {
          maxModelCalls: 4,
          maxToolCalls: 8,
          maxDurationMs: 60_000
        },
        createdAt: "2026-04-05T00:00:00.000Z",
        updatedAt: "2026-04-05T00:00:00.000Z"
      });

      await sqliteStore.artifacts.writeArtifact({
        id: "artifact_sqlite_1",
        runId: "run_sqlite_1",
        kind: "draft",
        contentType: "application/json",
        storage: "inline",
        metadata: {
          source: "sqlite"
        },
        inlineData: {
          title: "SQLite 草案"
        },
        createdAt: "2026-04-05T00:00:00.000Z"
      });

      const reopened = createSqliteAgentStore({
        path: databasePath
      });

      expect(await reopened.artifacts.getArtifact("artifact_sqlite_1")).toEqual(
        expect.objectContaining({
          id: "artifact_sqlite_1",
          kind: "draft"
        })
      );
      expect(await reopened.artifacts.getArtifact("artifact_missing")).toBeNull();
    } finally {
      rmSync(tempDir, {
        recursive: true,
        force: true
      });
    }
  });
});

import { describe, expect, it } from "vitest";

import { createMemoryAgentStore } from "@geohelper/agent-store";

import { createMemoryRetriever, createMemoryWriter } from "../src";

describe("agent memory layer", () => {
  it("retrieves thread memory entries for a thread scope", async () => {
    const store = createMemoryAgentStore();

    await store.memory.writeMemoryEntry({
      id: "memory_thread_1",
      scope: "thread",
      scopeId: "thread_1",
      key: "teacher_preference",
      value: {
        tone: "concise"
      },
      sourceRunId: "run_1",
      sourceArtifactId: "artifact_1",
      createdAt: "2026-04-04T00:00:00.000Z"
    });

    await store.memory.writeMemoryEntry({
      id: "memory_thread_2",
      scope: "thread",
      scopeId: "thread_2",
      key: "teacher_preference",
      value: {
        tone: "detailed"
      },
      sourceRunId: "run_2",
      sourceArtifactId: "artifact_2",
      createdAt: "2026-04-04T00:01:00.000Z"
    });

    await store.memory.writeMemoryEntry({
      id: "memory_workspace_1",
      scope: "workspace",
      scopeId: "workspace_1",
      key: "scene_context",
      value: {
        chapter: "triangles"
      },
      sourceRunId: "run_3",
      sourceArtifactId: "artifact_3",
      createdAt: "2026-04-04T00:02:00.000Z"
    });

    const retriever = createMemoryRetriever({
      memoryRepo: store.memory
    });

    const entries = await retriever.forThread("thread_1");

    expect(entries.map((entry) => entry.id)).toEqual(["memory_thread_1"]);
  });

  it("retrieves workspace memory entries for a workspace scope", async () => {
    const store = createMemoryAgentStore();

    await store.memory.writeMemoryEntry({
      id: "memory_workspace_1",
      scope: "workspace",
      scopeId: "workspace_1",
      key: "scene_context",
      value: {
        topic: "angle_bisector"
      },
      sourceRunId: "run_1",
      sourceArtifactId: "artifact_1",
      createdAt: "2026-04-04T00:00:00.000Z"
    });

    await store.memory.writeMemoryEntry({
      id: "memory_workspace_2",
      scope: "workspace",
      scopeId: "workspace_2",
      key: "scene_context",
      value: {
        topic: "parallel_lines"
      },
      sourceRunId: "run_2",
      sourceArtifactId: "artifact_2",
      createdAt: "2026-04-04T00:01:00.000Z"
    });

    const retriever = createMemoryRetriever({
      memoryRepo: store.memory
    });

    const entries = await retriever.forWorkspace("workspace_2");

    expect(entries.map((entry) => entry.id)).toEqual(["memory_workspace_2"]);
  });

  it("deduplicates explicit memory writes with the same scope, key, and value", async () => {
    const store = createMemoryAgentStore();
    const writer = createMemoryWriter({
      memoryRepo: store.memory
    });

    const firstWrite = await writer.write({
      id: "memory_1",
      scope: "thread",
      scopeId: "thread_1",
      key: "teacher_preference",
      value: {
        tone: "concise"
      },
      sourceRunId: "run_1",
      sourceArtifactId: "artifact_1",
      createdAt: "2026-04-04T00:00:00.000Z"
    });

    const secondWrite = await writer.write({
      id: "memory_2",
      scope: "thread",
      scopeId: "thread_1",
      key: "teacher_preference",
      value: {
        tone: "concise"
      },
      sourceRunId: "run_2",
      sourceArtifactId: "artifact_2",
      createdAt: "2026-04-04T00:01:00.000Z"
    });

    const entries = await store.memory.listMemoryEntries({
      scope: "thread",
      scopeId: "thread_1"
    });

    expect(firstWrite.status).toBe("written");
    expect(secondWrite.status).toBe("deduplicated");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe("memory_1");
  });

  it("writes traceable memory entries with source artifact attribution", async () => {
    const store = createMemoryAgentStore();
    const writer = createMemoryWriter({
      memoryRepo: store.memory
    });

    const result = await writer.write({
      id: "memory_1",
      scope: "workspace",
      scopeId: "workspace_1",
      key: "imported_template",
      value: {
        title: "中点构造模板"
      },
      sourceRunId: "run_1",
      sourceArtifactId: "artifact_template_1",
      createdAt: "2026-04-04T00:00:00.000Z"
    });

    expect(result.entry.sourceRunId).toBe("run_1");
    expect(result.entry.sourceArtifactId).toBe("artifact_template_1");
  });
});

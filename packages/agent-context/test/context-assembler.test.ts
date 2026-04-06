import type { Run } from "@geohelper/agent-protocol";
import { createMemoryAgentStore } from "@geohelper/agent-store";
import { describe, expect, it } from "vitest";

import {
  createContextAssembler,
  createStoreBackedContextAssembler
} from "../src";

const createRun = (overrides: Partial<Run> = {}): Run => ({
  id: "run_context",
  threadId: "thread_context",
  profileId: "profile_context",
  status: "queued",
  inputArtifactIds: [],
  outputArtifactIds: [],
  budget: {
    maxModelCalls: 6,
    maxToolCalls: 8,
    maxDurationMs: 120000
  },
  createdAt: "2026-04-06T00:00:00.000Z",
  updatedAt: "2026-04-06T00:00:00.000Z",
  ...overrides
});

describe("context assembler", () => {
  it("assembles a deterministic context packet from loader functions", async () => {
    const assembler = createContextAssembler({
      loadSystem: async () => "system-guidance",
      loadInstructions: async () => ["use tools carefully"],
      loadConversation: async () => [
        {
          role: "user",
          content: "construct triangle ABC"
        }
      ],
      loadArtifacts: async () => [
        {
          id: "artifact_plan",
          runId: "run_context",
          kind: "plan",
          contentType: "application/json",
          storage: "inline",
          inlineData: {
            steps: ["read scene", "plan"]
          },
          metadata: {},
          createdAt: "2026-04-06T00:00:00.000Z"
        }
      ],
      loadMemories: async () => [
        {
          id: "memory_1",
          scope: "thread",
          scopeId: "thread_context",
          key: "teacher_preference",
          value: "Teacher prefers concise explanations.",
          sourceRunId: "run_previous",
          createdAt: "2026-04-05T00:00:00.000Z"
        }
      ],
      loadWorkspace: async () => ({
        sceneVersion: 4
      }),
      loadToolCatalog: async () => [
        {
          name: "scene.read_state",
          kind: "browser_tool",
          permissions: ["scene:read"],
          retryable: true
        }
      ]
    });

    await expect(
      assembler.assemble({
        run: createRun(),
        nodeId: "node_plan",
        threadId: "thread_context",
        workspaceId: "workspace_1"
      })
    ).resolves.toEqual({
      system: "system-guidance",
      instructions: ["use tools carefully"],
      conversation: [
        {
          role: "user",
          content: "construct triangle ABC"
        }
      ],
      artifacts: [
        expect.objectContaining({
          id: "artifact_plan"
        })
      ],
      memories: [
        expect.objectContaining({
          id: "memory_1"
        })
      ],
      workspace: {
        sceneVersion: 4
      },
      toolCatalog: [
        expect.objectContaining({
          name: "scene.read_state"
        })
      ]
    });
  });

  it("falls back to empty defaults when no loaders are provided", async () => {
    const assembler = createContextAssembler();

    await expect(
      assembler.assemble({
        run: createRun(),
        nodeId: "node_plan",
        threadId: "thread_context"
      })
    ).resolves.toEqual({
      system: "",
      instructions: [],
      conversation: [],
      artifacts: [],
      memories: [],
      workspace: {},
      toolCatalog: []
    });
  });

  it("loads artifacts memories and tool catalog from the store", async () => {
    const store = createMemoryAgentStore();

    await store.artifacts.writeArtifact({
      id: "artifact_input",
      runId: "run_context",
      kind: "input",
      contentType: "application/json",
      storage: "inline",
      inlineData: {
        prompt: "build a perpendicular bisector"
      },
      metadata: {},
      createdAt: "2026-04-06T00:00:00.000Z"
    });
    await store.memory.writeMemoryEntry({
      id: "memory_thread",
      scope: "thread",
      scopeId: "thread_context",
      key: "teacher_preference",
      value: "Prefer theorem-first answers.",
      createdAt: "2026-04-05T00:00:00.000Z"
    });
    await store.memory.writeMemoryEntry({
      id: "memory_workspace",
      scope: "workspace",
      scopeId: "workspace_1",
      key: "canvas_mode",
      value: "geogebra",
      createdAt: "2026-04-05T00:00:00.000Z"
    });

    const assembler = createStoreBackedContextAssembler({
      store,
      tools: {
        "scene.read_state": {
          name: "scene.read_state",
          kind: "browser_tool",
          permissions: ["scene:read"],
          retryable: true
        }
      }
    });

    await expect(
      assembler.assemble({
        run: createRun({
          inputArtifactIds: ["artifact_input"]
        }),
        nodeId: "node_plan",
        threadId: "thread_context",
        workspaceId: "workspace_1"
      })
    ).resolves.toEqual(
      expect.objectContaining({
        artifacts: [
          expect.objectContaining({
            id: "artifact_input"
          })
        ],
        memories: expect.arrayContaining([
          expect.objectContaining({
            id: "memory_thread"
          }),
          expect.objectContaining({
            id: "memory_workspace"
          })
        ]),
        toolCatalog: [
          expect.objectContaining({
            name: "scene.read_state"
          })
        ]
      })
    );
  });
});

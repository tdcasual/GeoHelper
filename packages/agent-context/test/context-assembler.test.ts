import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadPortableAgentBundleFromFs } from "@geohelper/agent-bundle";
import type { Run } from "@geohelper/agent-protocol";
import { createMemoryAgentStore } from "@geohelper/agent-store";
import { describe, expect, it } from "vitest";

import {
  createBundleBackedContextAssembler,
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

const geometryBundleDir = path.resolve(
  fileURLToPath(new URL("../../../agents/geometry-solver", import.meta.url))
);

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
      ],
      bundle: null
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
      toolCatalog: [],
      bundle: null
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

  it("assembles bundle bootstrap files, prompt assets, and policy-aware context", async () => {
    const store = createMemoryAgentStore();
    const bundle = loadPortableAgentBundleFromFs(geometryBundleDir);

    await store.artifacts.writeArtifact({
      id: "artifact_input_filtered",
      runId: "run_context",
      kind: "input",
      contentType: "application/json",
      storage: "inline",
      inlineData: {
        prompt: "draft"
      },
      metadata: {},
      createdAt: "2026-04-06T00:00:00.000Z"
    });
    await store.artifacts.writeArtifact({
      id: "artifact_response_kept",
      runId: "run_context",
      kind: "response",
      contentType: "application/json",
      storage: "inline",
      inlineData: {
        summary: "kept"
      },
      metadata: {},
      createdAt: "2026-04-06T00:01:00.000Z"
    });
    await store.memory.writeMemoryEntry({
      id: "memory_workspace",
      scope: "workspace",
      scopeId: "workspace_1",
      key: "teacher_preference",
      value: "Prefer concise Chinese summaries.",
      createdAt: "2026-04-05T00:00:00.000Z"
    });
    await store.memory.writeMemoryEntry({
      id: "memory_thread",
      scope: "thread",
      scopeId: "thread_context",
      key: "active_problem",
      value: "triangle midpoint",
      createdAt: "2026-04-05T00:01:00.000Z"
    });

    const assembler = createBundleBackedContextAssembler({
      store,
      tools: {
        "scene.read_state": {
          name: "scene.read_state",
          kind: "browser_tool",
          permissions: ["scene:read"],
          retryable: true
        },
        "scene.apply_command_batch": {
          name: "scene.apply_command_batch",
          kind: "browser_tool",
          permissions: ["scene:write"],
          retryable: false
        }
      },
      resolveBundle: () => bundle,
      loadWorkspace: async () => ({
        sceneVersion: 3
      })
    });

    const packet = await assembler.assemble({
      run: createRun({
        inputArtifactIds: ["artifact_input_filtered"],
        outputArtifactIds: ["artifact_response_kept"]
      }),
      nodeId: "node_plan_geometry",
      threadId: "thread_context",
      workspaceId: "workspace_1"
    });

    expect(packet.system).toContain("Geometry Solver Agent");
    expect(packet.system).toContain("Identity");
    expect(packet.instructions.join("\n")).toContain("Standing Orders");
    expect(packet.instructions.join("\n")).toContain("User Model");
    expect(packet.artifacts.map((artifact) => artifact.id)).toEqual([
      "artifact_response_kept"
    ]);
    expect(packet.memories.map((memory) => memory.id)).toEqual([
      "memory_workspace",
      "memory_thread"
    ]);
    expect(packet.bundle).toMatchObject({
      manifest: {
        id: "geometry_solver"
      },
      prompts: {
        "prompts/planner.md": expect.stringContaining(
          "Plan the geometry construction"
        )
      },
      contextPolicy: {
        artifactKinds: ["tool_result", "response"]
      }
    });
    expect(packet.workspace).toMatchObject({
      sceneVersion: 3,
      bundleId: "geometry_solver",
      hostRequirements: ["workspace.scene.read", "workspace.scene.write"]
    });
  });
});

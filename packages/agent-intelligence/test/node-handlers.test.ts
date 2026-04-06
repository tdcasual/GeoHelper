import { createContextAssembler } from "@geohelper/agent-context";
import type { NodeHandlerContext } from "@geohelper/agent-core";
import type { Run } from "@geohelper/agent-protocol";
import { describe, expect, it, vi } from "vitest";

import {
  createPlatformNodeHandlers
} from "../src";

const createRun = (overrides: Partial<Run> = {}): Run => ({
  id: "run_intelligence",
  threadId: "thread_intelligence",
  profileId: "profile_intelligence",
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

const createHandlerContext = (
  overrides: Partial<NodeHandlerContext> = {}
): NodeHandlerContext => ({
  run: createRun(),
  workflow: {
    id: "wf_test",
    version: 1,
    entryNodeId: "node_plan",
    nodes: []
  },
  node: {
    id: "node_plan",
    kind: "planner",
    name: "Plan",
    config: {},
    next: []
  },
  visitedNodeIds: [],
  budgetUsage: {
    modelCalls: 0,
    toolCalls: 0
  },
  ...overrides
});

describe("platform node handlers", () => {
  it("assembles context before calling planner drivers", async () => {
    const execute = vi.fn(async () => ({
      type: "route" as const,
      nextNodeId: "node_model"
    }));
    const handlers = createPlatformNodeHandlers({
      contextAssembler: createContextAssembler({
        loadSystem: async () => "system"
      }),
      drivers: {
        planner: {
          execute
        }
      }
    });

    const result = await handlers.planner?.(createHandlerContext());

    expect(result).toEqual({
      type: "route",
      nextNodeId: "node_model"
    });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          system: "system"
        }),
        node: expect.objectContaining({
          id: "node_plan"
        })
      })
    );
  });

  it("completes synthesizer nodes by default", async () => {
    const handlers = createPlatformNodeHandlers({
      contextAssembler: createContextAssembler()
    });

    const result = await handlers.synthesizer?.(
      createHandlerContext({
        node: {
          id: "node_finish",
          kind: "synthesizer",
          name: "Finish",
          config: {},
          next: []
        }
      })
    );

    expect(result).toEqual({
      type: "complete"
    });
  });
});

import type { ContextPacket } from "@geohelper/agent-context";
import type { NodeHandlerContext } from "@geohelper/agent-core";
import { ArtifactSchema, type Run } from "@geohelper/agent-protocol";
import { describe, expect, it, vi } from "vitest";

import {
  createModelDriver,
  createPlannerDriver,
  createSynthesizerDriver
} from "../src";

const createRun = (overrides: Partial<Run> = {}): Run => ({
  id: "run_prompt_driver",
  threadId: "thread_prompt_driver",
  profileId: "profile_prompt_driver",
  status: "queued",
  inputArtifactIds: [],
  outputArtifactIds: [],
  budget: {
    maxModelCalls: 6,
    maxToolCalls: 8,
    maxDurationMs: 120000
  },
  createdAt: "2026-04-07T00:00:00.000Z",
  updatedAt: "2026-04-07T00:00:00.000Z",
  ...overrides
});

const createBaseContext = (): NodeHandlerContext => ({
  run: createRun(),
  workflow: {
    id: "wf_prompt_driver",
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
  }
});

const createBundleContext = (): ContextPacket => ({
  system: "system-guidance",
  instructions: ["follow standing orders"],
  conversation: [
    {
      role: "user",
      content: "construct midpoint M on AB"
    }
  ],
  artifacts: [],
  memories: [],
  workspace: {},
  toolCatalog: [],
  bundle: {
    manifest: {
      id: "geometry_solver",
      name: "Geometry Solver",
      description: "bundle",
      entrypoint: {
        plannerPrompt: "prompts/planner.md",
        executorPrompt: "prompts/executor.md",
        synthesizerPrompt: "prompts/synthesizer.md"
      },
      workflow: {
        path: "workflows/geometry-solver.workflow.json"
      },
      schemaVersion: "2",
      workspace: {
        bootstrapFiles: []
      },
      defaultBudget: {
        maxModelCalls: 6,
        maxToolCalls: 8,
        maxDurationMs: 120000
      },
      runProfiles: [],
      tools: [],
      evaluators: [],
      policies: {
        context: "policies/context-policy.json",
        memory: "policies/memory-policy.json",
        approval: "policies/approval-policy.json"
      },
      artifacts: {
        outputContract: "artifacts/output-contract.json"
      },
      hostRequirements: [],
      hostExtensions: {}
    },
    workspaceFiles: {},
    prompts: {
      "prompts/planner.md": "Plan the geometry construction in teacher-facing steps.",
      "prompts/executor.md": "Convert the plan into structured scene actions.",
      "prompts/synthesizer.md": "Summarize the result for the teacher."
    },
    contextPolicy: {
      includeWorkspaceBootstrap: true,
      memoryScopes: ["thread", "workspace"],
      artifactKinds: ["tool_result", "response"],
      maxConversationMessages: 16
    },
    memoryPolicy: {
      writableScopes: ["thread", "workspace"],
      promotionRules: []
    },
    approvalPolicy: {
      defaultMode: "allow-with-policy",
      rules: []
    },
    outputContract: {
      response: {
        requiredSections: ["summary", "next_action"]
      },
      actionProposals: []
    },
    delegationConfig: {
      delegations: []
    }
  }
});

describe("bundle prompt drivers", () => {
  it("writes a plan artifact from the planner prompt", async () => {
    const writeArtifact = vi.fn();
    const driver = createPlannerDriver({
      writeArtifact,
      now: () => "2026-04-07T00:00:00.000Z"
    });
    const input = createBaseContext();

    const result = await driver.execute({
      ...input,
      context: createBundleContext()
    });

    expect(result).toEqual({
      type: "continue"
    });
    expect(writeArtifact).toHaveBeenCalledTimes(1);

    const artifact = ArtifactSchema.parse(writeArtifact.mock.calls[0]?.[0]);

    expect(artifact).toEqual(
      expect.objectContaining({
        kind: "plan",
        runId: "run_prompt_driver",
        metadata: expect.objectContaining({
          nodeId: "node_plan",
          promptPath: "prompts/planner.md"
        })
      })
    );
  });

  it("writes a draft artifact from the executor prompt", async () => {
    const writeArtifact = vi.fn();
    const driver = createModelDriver({
      writeArtifact,
      now: () => "2026-04-07T00:00:00.000Z"
    });

    const result = await driver.execute({
      ...createBaseContext(),
      node: {
        id: "node_model",
        kind: "model",
        name: "Model",
        config: {},
        next: []
      },
      context: createBundleContext()
    });

    expect(result).toEqual({
      type: "continue"
    });
    expect(writeArtifact).toHaveBeenCalledTimes(1);

    const artifact = ArtifactSchema.parse(writeArtifact.mock.calls[0]?.[0]);

    expect(artifact).toEqual(
      expect.objectContaining({
        kind: "draft",
        metadata: expect.objectContaining({
          promptPath: "prompts/executor.md"
        })
      })
    );
  });

  it("writes a response artifact from the synthesizer prompt and completes", async () => {
    const writeArtifact = vi.fn();
    const driver = createSynthesizerDriver({
      writeArtifact,
      now: () => "2026-04-07T00:00:00.000Z"
    });

    const result = await driver.execute({
      ...createBaseContext(),
      node: {
        id: "node_finish",
        kind: "synthesizer",
        name: "Finish",
        config: {},
        next: []
      },
      context: createBundleContext()
    });

    expect(result).toEqual({
      type: "complete"
    });
    expect(writeArtifact).toHaveBeenCalledTimes(1);

    const artifact = ArtifactSchema.parse(writeArtifact.mock.calls[0]?.[0]);

    expect(artifact).toEqual(
      expect.objectContaining({
        kind: "response",
        metadata: expect.objectContaining({
          promptPath: "prompts/synthesizer.md"
        })
      })
    );
  });

  it("fails clearly when the bundle prompt asset is missing", async () => {
    const driver = createPlannerDriver();

    await expect(
      driver.execute({
        ...createBaseContext(),
        context: {
          ...createBundleContext(),
          bundle: {
            ...createBundleContext().bundle!,
            prompts: {}
          }
        }
      })
    ).rejects.toThrowError(
      "Missing planner prompt asset: prompts/planner.md"
    );
  });
});

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  loadPortableAgentBundleFromFs,
  PortableAgentBundleError
} from "../src";

const writeJson = (filePath: string, value: unknown): void => {
  mkdirSync(path.dirname(filePath), {
    recursive: true
  });
  writeFileSync(filePath, JSON.stringify(value, null, 2));
};

const writeText = (filePath: string, value: string): void => {
  mkdirSync(path.dirname(filePath), {
    recursive: true
  });
  writeFileSync(filePath, value);
};

const createFixtureBundle = (): string => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "geohelper-agent-bundle-"));

  writeJson(path.join(dir, "agent.json"), {
    schemaVersion: "2",
    id: "fixture-agent",
    name: "Fixture Agent",
    description: "Test agent bundle",
    entrypoint: {
      plannerPrompt: "prompts/planner.md",
      executorPrompt: "prompts/executor.md",
      synthesizerPrompt: "prompts/synthesizer.md"
    },
    workspace: {
      bootstrapFiles: [
        "workspace/AGENTS.md",
        "workspace/TOOLS.md"
      ]
    },
    workflow: {
      path: "workflows/fixture.workflow.json"
    },
    defaultBudget: {
      maxModelCalls: 3,
      maxToolCalls: 4,
      maxDurationMs: 60000
    },
    runProfiles: [
      {
        id: "fixture_standard",
        name: "Fixture Standard",
        description: "Default run profile"
      }
    ],
    tools: ["tools/example.tool.json"],
    evaluators: ["evaluators/example.eval.json"],
    policies: {
      context: "policies/context-policy.json",
      memory: "policies/memory-policy.json",
      approval: "policies/approval-policy.json"
    },
    artifacts: {
      outputContract: "artifacts/output-contract.json"
    },
    delegation: {
      config: "delegations/subagents.json"
    },
    hostRequirements: ["workspace.scene.read"]
  });
  writeJson(path.join(dir, "workflows/fixture.workflow.json"), {
    id: "wf_fixture",
    version: 1,
    entryNodeId: "node_plan",
    nodes: [
      {
        id: "node_plan",
        kind: "planner",
        name: "Plan",
        config: {},
        next: ["node_finish"]
      },
      {
        id: "node_finish",
        kind: "synthesizer",
        name: "Finish",
        config: {},
        next: []
      }
    ]
  });
  writeJson(path.join(dir, "tools/example.tool.json"), {
    name: "example.tool",
    kind: "browser",
    description: "Read scene",
    permissions: ["scene:read"],
    retryable: true,
    hostCapability: "workspace.scene.read",
    export: {
      openClaw: {
        mode: "plugin",
        preferredTransport: "plugin"
      }
    }
  });
  writeJson(path.join(dir, "evaluators/example.eval.json"), {
    name: "example_eval",
    description: "Evaluate result",
    promptRef: "prompts/evaluator.md",
    inputContract: {
      artifactKinds: ["response"]
    },
    policy: {
      minimumScore: 0.75,
      checkpointOnFailure: true
    }
  });
  writeJson(path.join(dir, "policies/context-policy.json"), {
    includeWorkspaceBootstrap: true,
    memoryScopes: ["thread", "workspace"]
  });
  writeJson(path.join(dir, "policies/memory-policy.json"), {
    writableScopes: ["thread", "workspace"],
    promotionRules: [
      {
        from: "thread",
        to: "workspace",
        when: "teacher_preference_confirmed"
      }
    ]
  });
  writeJson(path.join(dir, "policies/approval-policy.json"), {
    defaultMode: "allow-with-policy",
    rules: [
      {
        action: "scene.write",
        approval: "allow"
      }
    ]
  });
  writeJson(path.join(dir, "artifacts/output-contract.json"), {
    response: {
      requiredSections: ["summary", "actions"]
    },
    actionProposals: [
      {
        kind: "scene_command_batch",
        description: "Apply geometry commands"
      }
    ]
  });
  writeJson(path.join(dir, "delegations/subagents.json"), {
    delegations: [
      {
        name: "reviewer",
        mode: "native-subagent",
        agentRef: "fixture-reviewer",
        awaitCompletion: true
      }
    ]
  });
  writeText(path.join(dir, "workspace/AGENTS.md"), "# Agent Rules");
  writeText(path.join(dir, "workspace/TOOLS.md"), "# Tools");
  writeText(path.join(dir, "prompts/planner.md"), "Plan prompt");
  writeText(path.join(dir, "prompts/executor.md"), "Executor prompt");
  writeText(path.join(dir, "prompts/synthesizer.md"), "Synthesizer prompt");
  writeText(path.join(dir, "prompts/evaluator.md"), "Evaluator prompt");

  return dir;
};

describe("portable agent bundle loader", () => {
  it("loads a file-backed bundle and resolves relative assets", () => {
    const bundleDir = createFixtureBundle();

    try {
      const bundle = loadPortableAgentBundleFromFs(bundleDir);

      expect(bundle.manifest.id).toBe("fixture-agent");
      expect(bundle.workflow.id).toBe("wf_fixture");
      expect(bundle.tools.map((tool) => tool.name)).toEqual(["example.tool"]);
      expect(bundle.evaluators.map((item) => item.name)).toEqual(["example_eval"]);
      expect(bundle.workspaceFiles.map((file) => file.relativePath)).toEqual([
        "workspace/AGENTS.md",
        "workspace/TOOLS.md"
      ]);
      expect(bundle.textAssets["prompts/evaluator.md"]).toBe("Evaluator prompt");
      expect(bundle.delegationConfig?.delegations).toHaveLength(1);
    } finally {
      rmSync(bundleDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("throws a readable error when a required file is missing", () => {
    const bundleDir = createFixtureBundle();
    rmSync(path.join(bundleDir, "workflows/fixture.workflow.json"));

    try {
      expect(() => loadPortableAgentBundleFromFs(bundleDir)).toThrowError(
        new PortableAgentBundleError(
          "Missing workflow definition: workflows/fixture.workflow.json"
        )
      );
    } finally {
      rmSync(bundleDir, {
        recursive: true,
        force: true
      });
    }
  });
});

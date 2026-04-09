import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPlatformRuntimeContext } from "@geohelper/agent-core";
import type { PlatformAgentDefinition } from "@geohelper/agent-protocol";
import { createMemoryAgentStore } from "@geohelper/agent-store";
import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";

type PortableDelegationConfig = {
  delegations: Array<{
    name: string;
    mode: "native-subagent" | "acp-agent" | "host-service";
    agentRef?: string;
    serviceRef?: string;
    awaitCompletion?: boolean;
  }>;
};

type ControlPlaneToolRegistration = {
  name: string;
  kind: string;
  permissions?: string[];
  retryable?: boolean;
};

const geometryBundleDir = path.resolve(
  fileURLToPath(new URL("../../../agents/geometry-solver", import.meta.url))
);
const repoRoot = path.resolve(
  fileURLToPath(new URL("../../..", import.meta.url))
);
const delegationExecutorBridgeScriptPath = path.join(
  repoRoot,
  "scripts/agents/delegation-executor-bridge.mjs"
);

const runBridgeScript = async (
  args: string[]
): Promise<{
  status: number | null;
  stdout: string;
  stderr: string;
}> =>
  new Promise((resolve, reject) => {
    const child = spawn("node", args, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({
        status,
        stdout,
        stderr
      });
    });
  });

const createTestBundleMetadata = (rootDir: string) => ({
  bundleId: "geometry_solver",
  schemaVersion: "2",
  rootDir,
  workspaceBootstrapFiles: [
    "workspace/AGENTS.md",
    "workspace/IDENTITY.md",
    "workspace/USER.md",
    "workspace/TOOLS.md",
    "workspace/MEMORY.md",
    "workspace/STANDING_ORDERS.md"
  ],
  hostRequirements: ["workspace.scene.read", "workspace.scene.write"],
  promptAssetPaths: [
    "prompts/planner.md",
    "prompts/executor.md",
    "prompts/synthesizer.md"
  ]
});

const createDelegationBundleDir = (
  delegationConfig: PortableDelegationConfig
): string => {
  const tempDir = mkdtempSync(
    path.join(os.tmpdir(), "geohelper-control-plane-delegation-bundle-")
  );

  cpSync(geometryBundleDir, tempDir, {
    recursive: true
  });
  writeFileSync(
    path.join(tempDir, "delegations/subagents.json"),
    JSON.stringify(delegationConfig, null, 2)
  );

  return tempDir;
};

const createDelegationPlatformRuntime = (bundleDir: string) =>
  createPlatformRuntimeContext<
    PlatformAgentDefinition,
    ControlPlaneToolRegistration,
    unknown
  >({
    agents: {
      geometry_solver: {
        id: "geometry_solver",
        name: "Geometry Solver",
        description: "Delegation test agent",
        defaultBudget: {
          maxModelCalls: 6,
          maxToolCalls: 8,
          maxDurationMs: 120000
        },
        bundle: createTestBundleMetadata(bundleDir)
      }
    },
    runProfiles: {
      profile_parent: {
        id: "profile_parent",
        name: "Parent profile",
        description: "Delegates externally",
        agentId: "geometry_solver",
        workflowId: "wf_parent",
        defaultBudget: {
          maxModelCalls: 6,
          maxToolCalls: 8,
          maxDurationMs: 120000
        }
      }
    },
    runProfileMap: new Map([
      [
        "profile_parent",
        {
          id: "profile_parent",
          name: "Parent profile",
          description: "Delegates externally",
          agentId: "geometry_solver",
          workflowId: "wf_parent",
          defaultBudget: {
            maxModelCalls: 6,
            maxToolCalls: 8,
            maxDurationMs: 120000
          }
        }
      ]
    ]),
    workflows: {
      wf_parent: {
        id: "wf_parent",
        version: 1,
        entryNodeId: "node_delegate",
        nodes: [
          {
            id: "node_delegate",
            kind: "subagent",
            name: "Delegate externally",
            config: {
              delegation: "teacher_review"
            },
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
      }
    },
    tools: {},
    evaluators: {}
  });

const startDelegationRun = async (app: ReturnType<typeof buildServer>) => {
  await app.inject({
    method: "POST",
    url: "/api/v3/threads",
    payload: {
      title: "Delegation thread"
    }
  });

  return app.inject({
    method: "POST",
    url: "/api/v3/threads/thread_1/runs",
    payload: {
      profileId: "profile_parent",
      inputArtifactIds: []
    }
  });
};

describe("control-plane delegation session routes", () => {
  it("lists pending delegation sessions for external harness pickup", async () => {
    const store = createMemoryAgentStore();
    const bundleDir = createDelegationBundleDir({
      delegations: [
        {
          name: "teacher_review",
          mode: "acp-agent",
          agentRef: "openclaw.geometry-reviewer",
          awaitCompletion: true
        }
      ]
    });

    try {
      const app = buildServer({
        store,
        platformRuntime: createDelegationPlatformRuntime(bundleDir),
        now: () => "2026-04-08T00:00:00.000Z"
      });

      await startDelegationRun(app);

      const res = await app.inject({
        method: "GET",
        url: "/api/v3/delegation-sessions?status=pending"
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload)).toEqual({
        sessions: [
          expect.objectContaining({
            id: "delegation_session_run_1_node_delegate",
            runId: "run_1",
            checkpointId: expect.any(String),
            delegationName: "teacher_review",
            agentRef: "openclaw.geometry-reviewer",
            status: "pending",
            run: expect.objectContaining({
              id: "run_1",
              status: "waiting_for_checkpoint"
            }),
            checkpoint: expect.objectContaining({
              status: "pending",
              prompt: "Resolve agent delegation teacher_review to continue the run."
            })
          })
        ]
      });
    } finally {
      rmSync(bundleDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("lists and claims pending host-service sessions by serviceRef", async () => {
    const store = createMemoryAgentStore();
    const bundleDir = createDelegationBundleDir({
      delegations: [
        {
          name: "teacher_review",
          mode: "host-service",
          serviceRef: "host.geometry-review",
          awaitCompletion: true
        }
      ]
    });

    try {
      const app = buildServer({
        store,
        platformRuntime: createDelegationPlatformRuntime(bundleDir),
        now: () => "2026-04-08T00:00:00.000Z"
      });

      await startDelegationRun(app);

      const listRes = await app.inject({
        method: "GET",
        url: "/api/v3/delegation-sessions?status=pending&serviceRef=host.geometry-review"
      });

      expect(listRes.statusCode).toBe(200);
      expect(JSON.parse(listRes.payload)).toEqual({
        sessions: [
          expect.objectContaining({
            id: "delegation_session_run_1_node_delegate",
            runId: "run_1",
            checkpointId: expect.any(String),
            delegationName: "teacher_review",
            agentRef: "",
            serviceRef: "host.geometry-review",
            status: "pending",
            run: expect.objectContaining({
              id: "run_1",
              status: "waiting_for_checkpoint"
            }),
            checkpoint: expect.objectContaining({
              status: "pending",
              prompt: "Resolve host delegation teacher_review to continue the run."
            })
          })
        ]
      });

      const claimRes = await app.inject({
        method: "POST",
        url: "/api/v3/delegation-sessions/claim",
        payload: {
          executorId: "executor_host_geometry_review",
          serviceRef: "host.geometry-review",
          ttlSeconds: 300
        }
      });

      expect(claimRes.statusCode).toBe(200);
      expect(JSON.parse(claimRes.payload)).toEqual({
        claimed: true,
        session: expect.objectContaining({
          id: "delegation_session_run_1_node_delegate",
          serviceRef: "host.geometry-review",
          claimedBy: "executor_host_geometry_review",
          claimedAt: "2026-04-08T00:00:00.000Z",
          claimExpiresAt: "2026-04-08T00:05:00.000Z"
        })
      });
    } finally {
      rmSync(bundleDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("records agent delegation result artifacts and resumes the parent run", async () => {
    const store = createMemoryAgentStore();
    const bundleDir = createDelegationBundleDir({
      delegations: [
        {
          name: "teacher_review",
          mode: "acp-agent",
          agentRef: "openclaw.geometry-reviewer",
          awaitCompletion: true
        }
      ]
    });

    try {
      const app = buildServer({
        store,
        platformRuntime: createDelegationPlatformRuntime(bundleDir),
        now: () => "2026-04-08T00:00:00.000Z"
      });

      await startDelegationRun(app);

      const res = await app.inject({
        method: "POST",
        url: "/api/v3/delegation-sessions/delegation_session_run_1_node_delegate/result",
        payload: {
          status: "completed",
          result: {
            summary: "Draft reviewed"
          },
          artifacts: [
            {
              kind: "evaluation",
              contentType: "application/json",
              storage: "inline",
              inlineData: {
                verdict: "approved"
              },
              metadata: {
                rubric: "geometry-review"
              }
            }
          ]
        }
      });

      expect(res.statusCode).toBe(202);
      expect(JSON.parse(res.payload)).toEqual({
        accepted: true,
        session: expect.objectContaining({
          id: "delegation_session_run_1_node_delegate",
          status: "completed",
          outputArtifactIds: ["artifact_delegation_session_run_1_node_delegate_1"]
        })
      });

      expect(await store.delegationSessions.getSession("delegation_session_run_1_node_delegate")).toEqual(
        expect.objectContaining({
          status: "completed",
          outputArtifactIds: ["artifact_delegation_session_run_1_node_delegate_1"]
        })
      );
      expect(await store.runs.getRun("run_1")).toEqual(
        expect.objectContaining({
          status: "completed",
          inputArtifactIds: ["artifact_delegation_session_run_1_node_delegate_1"],
          outputArtifactIds: ["artifact_response_run_1_node_finish"]
        })
      );
      expect(await store.artifacts.getArtifact("artifact_delegation_session_run_1_node_delegate_1")).toEqual(
        expect.objectContaining({
          runId: "run_1",
          kind: "evaluation",
          metadata: expect.objectContaining({
            sessionId: "delegation_session_run_1_node_delegate",
            delegationName: "teacher_review",
            agentRef: "openclaw.geometry-reviewer"
          })
        })
      );
      expect((await store.events.listRunEvents("run_1")).map((event) => event.type)).toContain(
        "delegation.result.recorded"
      );
    } finally {
      rmSync(bundleDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("records host-service result artifacts with serviceRef metadata and resumes the parent run", async () => {
    const store = createMemoryAgentStore();
    const bundleDir = createDelegationBundleDir({
      delegations: [
        {
          name: "teacher_review",
          mode: "host-service",
          serviceRef: "host.geometry-review",
          awaitCompletion: true
        }
      ]
    });

    try {
      const app = buildServer({
        store,
        platformRuntime: createDelegationPlatformRuntime(bundleDir),
        now: () => "2026-04-08T00:00:00.000Z"
      });

      await startDelegationRun(app);

      const res = await app.inject({
        method: "POST",
        url: "/api/v3/delegation-sessions/delegation_session_run_1_node_delegate/result",
        payload: {
          status: "completed",
          result: {
            summary: "Host review complete"
          },
          artifacts: [
            {
              kind: "evaluation",
              contentType: "application/json",
              storage: "inline",
              inlineData: {
                verdict: "approved"
              },
              metadata: {
                rubric: "geometry-review"
              }
            }
          ]
        }
      });

      expect(res.statusCode).toBe(202);
      expect(await store.runs.getRun("run_1")).toEqual(
        expect.objectContaining({
          status: "completed",
          inputArtifactIds: ["artifact_delegation_session_run_1_node_delegate_1"],
          outputArtifactIds: ["artifact_response_run_1_node_finish"]
        })
      );
      expect(await store.artifacts.getArtifact("artifact_delegation_session_run_1_node_delegate_1")).toEqual(
        expect.objectContaining({
          runId: "run_1",
          kind: "evaluation",
          metadata: expect.objectContaining({
            sessionId: "delegation_session_run_1_node_delegate",
            delegationName: "teacher_review",
            serviceRef: "host.geometry-review"
          })
        })
      );
    } finally {
      rmSync(bundleDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("marks the parent run failed when a delegation session reports failure", async () => {
    const store = createMemoryAgentStore();
    const bundleDir = createDelegationBundleDir({
      delegations: [
        {
          name: "teacher_review",
          mode: "acp-agent",
          agentRef: "openclaw.geometry-reviewer",
          awaitCompletion: true
        }
      ]
    });

    try {
      const app = buildServer({
        store,
        platformRuntime: createDelegationPlatformRuntime(bundleDir),
        now: () => "2026-04-08T00:00:00.000Z"
      });

      await startDelegationRun(app);

      const res = await app.inject({
        method: "POST",
        url: "/api/v3/delegation-sessions/delegation_session_run_1_node_delegate/result",
        payload: {
          status: "failed",
          result: {
            message: "Upstream agent delegation failed"
          },
          artifacts: []
        }
      });

      expect(res.statusCode).toBe(202);
      expect(await store.delegationSessions.getSession("delegation_session_run_1_node_delegate")).toEqual(
        expect.objectContaining({
          status: "failed",
          outputArtifactIds: []
        })
      );
      expect(await store.runs.getRun("run_1")).toEqual(
        expect.objectContaining({
          status: "failed"
        })
      );
      expect((await store.events.listRunEvents("run_1")).map((event) => event.type)).toEqual(
        expect.arrayContaining(["delegation.result.recorded", "run.failed"])
      );
    } finally {
      rmSync(bundleDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("claims, heartbeats, and releases delegation sessions for an external executor", async () => {
    const store = createMemoryAgentStore();
    const bundleDir = createDelegationBundleDir({
      delegations: [
        {
          name: "teacher_review",
          mode: "acp-agent",
          agentRef: "openclaw.geometry-reviewer",
          awaitCompletion: true
        }
      ]
    });
    let currentTime = "2026-04-08T00:00:00.000Z";

    try {
      const app = buildServer({
        store,
        platformRuntime: createDelegationPlatformRuntime(bundleDir),
        now: () => currentTime
      });

      await startDelegationRun(app);

      const claimRes = await app.inject({
        method: "POST",
        url: "/api/v3/delegation-sessions/claim",
        payload: {
          executorId: "executor_geometry_reviewer",
          agentRef: "openclaw.geometry-reviewer",
          ttlSeconds: 300
        }
      });

      expect(claimRes.statusCode).toBe(200);
      expect(JSON.parse(claimRes.payload)).toEqual({
        claimed: true,
        session: expect.objectContaining({
          id: "delegation_session_run_1_node_delegate",
          claimedBy: "executor_geometry_reviewer",
          claimedAt: "2026-04-08T00:00:00.000Z",
          claimExpiresAt: "2026-04-08T00:05:00.000Z"
        })
      });

      const secondClaim = await app.inject({
        method: "POST",
        url: "/api/v3/delegation-sessions/claim",
        payload: {
          executorId: "executor_other",
          agentRef: "openclaw.geometry-reviewer",
          ttlSeconds: 300
        }
      });

      expect(secondClaim.statusCode).toBe(200);
      expect(JSON.parse(secondClaim.payload)).toEqual({
        claimed: false,
        session: null
      });

      currentTime = "2026-04-08T00:01:00.000Z";
      const heartbeatRes = await app.inject({
        method: "POST",
        url: "/api/v3/delegation-sessions/delegation_session_run_1_node_delegate/heartbeat",
        payload: {
          executorId: "executor_geometry_reviewer",
          ttlSeconds: 300
        }
      });

      expect(heartbeatRes.statusCode).toBe(200);
      expect(JSON.parse(heartbeatRes.payload)).toEqual({
        session: expect.objectContaining({
          id: "delegation_session_run_1_node_delegate",
          claimedBy: "executor_geometry_reviewer",
          claimExpiresAt: "2026-04-08T00:06:00.000Z"
        })
      });

      currentTime = "2026-04-08T00:02:00.000Z";
      const releaseRes = await app.inject({
        method: "POST",
        url: "/api/v3/delegation-sessions/delegation_session_run_1_node_delegate/release",
        payload: {
          executorId: "executor_geometry_reviewer"
        }
      });

      expect(releaseRes.statusCode).toBe(200);
      expect(JSON.parse(releaseRes.payload)).toEqual({
        session: expect.objectContaining({
          id: "delegation_session_run_1_node_delegate",
          claimedBy: null,
          claimedAt: null,
          claimExpiresAt: null
        })
      });
    } finally {
      rmSync(bundleDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("rejects delegation result submission from a non-owner while a claim is active", async () => {
    const store = createMemoryAgentStore();
    const bundleDir = createDelegationBundleDir({
      delegations: [
        {
          name: "teacher_review",
          mode: "acp-agent",
          agentRef: "openclaw.geometry-reviewer",
          awaitCompletion: true
        }
      ]
    });

    try {
      const app = buildServer({
        store,
        platformRuntime: createDelegationPlatformRuntime(bundleDir),
        now: () => "2026-04-08T00:00:00.000Z"
      });

      await startDelegationRun(app);
      await app.inject({
        method: "POST",
        url: "/api/v3/delegation-sessions/claim",
        payload: {
          executorId: "executor_geometry_reviewer",
          agentRef: "openclaw.geometry-reviewer",
          ttlSeconds: 300
        }
      });

      const mismatchRes = await app.inject({
        method: "POST",
        url: "/api/v3/delegation-sessions/delegation_session_run_1_node_delegate/result",
        payload: {
          executorId: "executor_other",
          status: "completed",
          result: {
            summary: "Draft reviewed"
          },
          artifacts: []
        }
      });

      expect(mismatchRes.statusCode).toBe(409);
      expect(JSON.parse(mismatchRes.payload)).toEqual({
        error: "delegation_session_claim_mismatch"
      });
    } finally {
      rmSync(bundleDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("drives claim, heartbeat, and release through the delegation executor bridge script", async () => {
    const store = createMemoryAgentStore();
    const bundleDir = createDelegationBundleDir({
      delegations: [
        {
          name: "teacher_review",
          mode: "acp-agent",
          agentRef: "openclaw.geometry-reviewer",
          awaitCompletion: true
        }
      ]
    });

    try {
      const app = buildServer({
        store,
        platformRuntime: createDelegationPlatformRuntime(bundleDir),
        now: () => "2026-04-08T00:00:00.000Z"
      });
      const baseUrl = await app.listen({
        host: "127.0.0.1",
        port: 0
      });

      try {
        await startDelegationRun(app);

        const claimRun = await runBridgeScript([
          delegationExecutorBridgeScriptPath,
          "claim-next",
          baseUrl,
          "executor_geometry_reviewer",
          "--agent-ref",
          "openclaw.geometry-reviewer"
        ]);

        expect(claimRun.status).toBe(0);
        expect(JSON.parse(claimRun.stdout)).toEqual({
          claimed: true,
          session: expect.objectContaining({
            id: "delegation_session_run_1_node_delegate",
            claimedBy: "executor_geometry_reviewer"
          })
        });

        const heartbeatRun = await runBridgeScript([
          delegationExecutorBridgeScriptPath,
          "heartbeat",
          baseUrl,
          "delegation_session_run_1_node_delegate",
          "executor_geometry_reviewer",
          "--ttl-seconds",
          "120"
        ]);

        expect(heartbeatRun.status).toBe(0);
        expect(JSON.parse(heartbeatRun.stdout)).toEqual({
          session: expect.objectContaining({
            id: "delegation_session_run_1_node_delegate",
            claimedBy: "executor_geometry_reviewer"
          })
        });

        const releaseRun = await runBridgeScript([
          delegationExecutorBridgeScriptPath,
          "release",
          baseUrl,
          "delegation_session_run_1_node_delegate",
          "executor_geometry_reviewer"
        ]);

        expect(releaseRun.status).toBe(0);
        expect(JSON.parse(releaseRun.stdout)).toEqual({
          session: expect.objectContaining({
            id: "delegation_session_run_1_node_delegate",
            claimedBy: null
          })
        });
      } finally {
        await app.close();
      }
    } finally {
      rmSync(bundleDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("submits a delegation result through the executor bridge script", async () => {
    const store = createMemoryAgentStore();
    const bundleDir = createDelegationBundleDir({
      delegations: [
        {
          name: "teacher_review",
          mode: "acp-agent",
          agentRef: "openclaw.geometry-reviewer",
          awaitCompletion: true
        }
      ]
    });

    try {
      const app = buildServer({
        store,
        platformRuntime: createDelegationPlatformRuntime(bundleDir),
        now: () => "2026-04-08T00:00:00.000Z"
      });
      const baseUrl = await app.listen({
        host: "127.0.0.1",
        port: 0
      });

      try {
        await startDelegationRun(app);

        const claimRun = await runBridgeScript([
          delegationExecutorBridgeScriptPath,
          "claim-next",
          baseUrl,
          "executor_geometry_reviewer",
          "--agent-ref",
          "openclaw.geometry-reviewer"
        ]);

        expect(claimRun.status).toBe(0);

        const submitRun = await runBridgeScript([
          delegationExecutorBridgeScriptPath,
          "submit-result",
          baseUrl,
          "delegation_session_run_1_node_delegate",
          "executor_geometry_reviewer",
          "--status",
          "completed",
          "--result-json",
          JSON.stringify({
            summary: "Draft reviewed"
          }),
          "--artifacts-json",
          JSON.stringify([])
        ]);

        expect(submitRun.status).toBe(0);
        expect(JSON.parse(submitRun.stdout)).toEqual({
          accepted: true,
          session: expect.objectContaining({
            id: "delegation_session_run_1_node_delegate",
            status: "completed"
          })
        });
      } finally {
        await app.close();
      }
    } finally {
      rmSync(bundleDir, {
        recursive: true,
        force: true
      });
    }
  });
});

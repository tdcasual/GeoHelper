import { describe, expect, it, vi } from "vitest";

import { createControlPlaneClient } from "./control-plane-client";

const createJsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });

describe("control-plane-client", () => {
  it("lists platform run profiles from the control plane catalog", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      createJsonResponse({
        catalog: {
          runProfiles: [
            {
              id: "platform_geometry_standard",
              name: "几何解题",
              description: "标准几何解题链路",
              agentId: "geometry_solver",
              workflowId: "wf_geometry_solver",
              defaultBudget: {
                maxModelCalls: 6,
                maxToolCalls: 8,
                maxDurationMs: 120000
              }
            }
          ]
        }
      })
    );

    const client = createControlPlaneClient({
      baseUrl: "https://control-plane.example.com",
      fetchImpl: fetchMock as typeof fetch
    });

    const result = await client.listRunProfiles();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://control-plane.example.com/api/v3/platform/catalog",
      undefined
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: "platform_geometry_standard",
        workflowId: "wf_geometry_solver"
      })
    ]);
  });

  it("fetches thread details from the control plane", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      createJsonResponse({
        thread: {
          id: "thread_1",
          title: "Triangle lesson",
          createdAt: "2026-04-04T00:00:00.000Z"
        }
      })
    );

    const client = createControlPlaneClient({
      baseUrl: "https://control-plane.example.com",
      fetchImpl: fetchMock as typeof fetch
    });

    const result = await client.getThread("thread_1");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://control-plane.example.com/api/v3/threads/thread_1",
      undefined
    );
    expect(result).toEqual({
      id: "thread_1",
      title: "Triangle lesson",
      createdAt: "2026-04-04T00:00:00.000Z"
    });
  });

  it("fetches artifacts from the control plane", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      createJsonResponse({
        artifact: {
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
        }
      })
    );

    const client = createControlPlaneClient({
      baseUrl: "https://control-plane.example.com",
      fetchImpl: fetchMock as typeof fetch
    });

    const result = await client.getArtifact("artifact_1");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://control-plane.example.com/api/v3/artifacts/artifact_1",
      undefined
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: "artifact_1",
        kind: "response",
        runId: "run_1"
      })
    );
  });

  it("lists delegation sessions for a run", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      createJsonResponse({
        sessions: [
          {
            id: "delegation_session_run_1_node_delegate",
            runId: "run_1",
            checkpointId: "checkpoint_1",
            delegationName: "teacher_review",
            agentRef: "openclaw.geometry-reviewer",
            status: "pending",
            outputArtifactIds: [],
            createdAt: "2026-04-08T00:00:00.000Z",
            updatedAt: "2026-04-08T00:00:00.000Z"
          }
        ]
      })
    );

    const client = createControlPlaneClient({
      baseUrl: "https://control-plane.example.com",
      fetchImpl: fetchMock as typeof fetch
    });

    const result = await client.listDelegationSessions({
      runId: "run_1"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://control-plane.example.com/api/v3/delegation-sessions?runId=run_1",
      undefined
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: "delegation_session_run_1_node_delegate",
        runId: "run_1",
        delegationName: "teacher_review"
      })
    ]);
  });

  it("cancels a run through the control plane mutation", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      createJsonResponse({
        run: {
          id: "run_1",
          threadId: "thread_1",
          profileId: "platform_geometry_standard",
          status: "cancelled",
          inputArtifactIds: [],
          outputArtifactIds: [],
          budget: {
            maxModelCalls: 6,
            maxToolCalls: 8,
            maxDurationMs: 120000
          },
          createdAt: "2026-04-10T00:00:00.000Z",
          updatedAt: "2026-04-10T00:02:00.000Z"
        }
      })
    );

    const client = createControlPlaneClient({
      baseUrl: "https://control-plane.example.com",
      fetchImpl: fetchMock as typeof fetch
    });

    const result = await client.cancelRun("run_1");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://control-plane.example.com/api/v3/runs/run_1/cancel",
      {
        method: "POST"
      }
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: "run_1",
        status: "cancelled"
      })
    );
  });

  it("force-releases a delegation session from the admin surface", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      createJsonResponse({
        session: {
          id: "delegation_session_run_1_node_delegate",
          runId: "run_1",
          checkpointId: "checkpoint_1",
          delegationName: "teacher_review",
          agentRef: "openclaw.geometry-reviewer",
          status: "pending",
          claimedBy: null,
          claimedAt: null,
          claimExpiresAt: null,
          outputArtifactIds: [],
          createdAt: "2026-04-10T00:00:00.000Z",
          updatedAt: "2026-04-10T00:02:00.000Z"
        }
      })
    );

    const client = createControlPlaneClient({
      baseUrl: "https://control-plane.example.com",
      fetchImpl: fetchMock as typeof fetch
    });

    const result = await client.forceReleaseDelegationSession(
      "delegation_session_run_1_node_delegate"
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://control-plane.example.com/admin/delegation-sessions/delegation_session_run_1_node_delegate/release",
      {
        method: "POST"
      }
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: "delegation_session_run_1_node_delegate",
        claimedBy: null
      })
    );
  });

  it("lists admin runs with status filters", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      createJsonResponse({
        runs: [
          {
            id: "run_waiting",
            threadId: "thread_1",
            profileId: "platform_geometry_standard",
            status: "waiting_for_checkpoint",
            inputArtifactIds: [],
            outputArtifactIds: [],
            budget: {
              maxModelCalls: 6,
              maxToolCalls: 8,
              maxDurationMs: 120000
            },
            createdAt: "2026-04-10T00:00:00.000Z",
            updatedAt: "2026-04-10T00:01:00.000Z"
          }
        ]
      })
    );

    const client = createControlPlaneClient({
      baseUrl: "https://control-plane.example.com",
      fetchImpl: fetchMock as typeof fetch
    });

    const result = await client.listAdminRuns({
      status: "waiting_for_checkpoint"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://control-plane.example.com/admin/runs?status=waiting_for_checkpoint",
      undefined
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: "run_waiting",
        status: "waiting_for_checkpoint"
      })
    ]);
  });

  it("fetches one admin run timeline with summary and artifacts", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      createJsonResponse({
        run: {
          id: "run_1",
          threadId: "thread_1",
          profileId: "platform_geometry_standard",
          status: "waiting_for_checkpoint",
          inputArtifactIds: [],
          outputArtifactIds: ["artifact_response_1"],
          budget: {
            maxModelCalls: 6,
            maxToolCalls: 8,
            maxDurationMs: 120000
          },
          createdAt: "2026-04-10T00:00:00.000Z",
          updatedAt: "2026-04-10T00:01:00.000Z"
        },
        events: [
          {
            id: "event_1",
            runId: "run_1",
            sequence: 1,
            type: "node.started",
            payload: {
              nodeId: "node_plan_geometry"
            },
            createdAt: "2026-04-10T00:00:00.000Z"
          }
        ],
        childRuns: [],
        checkpoints: [],
        delegationSessions: [],
        artifacts: [
          {
            id: "artifact_response_1",
            runId: "run_1",
            kind: "response",
            contentType: "application/json",
            storage: "inline",
            metadata: {},
            inlineData: {
              text: "Primary response"
            },
            createdAt: "2026-04-10T00:00:01.000Z"
          }
        ],
        summary: {
          eventCount: 1,
          checkpointCount: 0,
          pendingCheckpointCount: 0,
          delegationSessionCount: 0,
          pendingDelegationCount: 0,
          artifactCount: 1,
          memoryWriteCount: 0,
          childRunCount: 0
        },
        memoryEntries: []
      })
    );

    const client = createControlPlaneClient({
      baseUrl: "https://control-plane.example.com",
      fetchImpl: fetchMock as typeof fetch
    });

    const result = await client.getAdminRunTimeline("run_1");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://control-plane.example.com/admin/runs/run_1/timeline",
      undefined
    );
    expect(result).toEqual(
      expect.objectContaining({
        run: expect.objectContaining({
          id: "run_1",
          profileId: "platform_geometry_standard"
        }),
        artifacts: [
          expect.objectContaining({
            id: "artifact_response_1",
            kind: "response"
          })
        ],
        summary: {
          eventCount: 1,
          checkpointCount: 0,
          pendingCheckpointCount: 0,
          delegationSessionCount: 0,
          pendingDelegationCount: 0,
          artifactCount: 1,
          memoryWriteCount: 0,
          childRunCount: 0
        }
      })
    );
  });

  it("lists portable bundle audit records from the control plane admin surface", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      createJsonResponse({
        bundles: [
          {
            agentId: "geometry_solver",
            bundleId: "geometry_solver",
            rootDir: "/repo/agents/geometry-solver",
            schemaVersion: "2",
            hostRequirements: ["workspace.scene.read", "workspace.scene.write"],
            workspaceBootstrapFiles: ["workspace/AGENTS.md"],
            promptAssetPaths: ["prompts/planner.md"],
            openClawCompatibility: {
              bundleId: "geometry_solver",
              schemaVersion: "2",
              recommendedImportMode: "portable-with-host-bindings",
              requiredOpenClawCapabilities: [
                "workspace.scene.read",
                "workspace.scene.write"
              ],
              fullyPortableTools: ["scene.read_state"],
              hostBoundTools: ["scene.apply_command_batch"],
              nativeSubagentDelegations: [],
              acpAgentDelegations: [],
              hostServiceDelegations: [],
              degradedBehaviors: [],
              notes: [],
              rehearsedExtractionCandidate: false,
              extractionBlockers: ["workspace.scene.read", "workspace.scene.write"]
            }
          },
          {
            agentId: "geometry_reviewer",
            bundleId: "geometry_reviewer",
            rootDir: "/repo/agents/geometry-reviewer",
            schemaVersion: "2",
            hostRequirements: [],
            workspaceBootstrapFiles: ["workspace/AGENTS.md"],
            promptAssetPaths: ["prompts/planner.md"],
            openClawCompatibility: {
              bundleId: "geometry_reviewer",
              schemaVersion: "2",
              recommendedImportMode: "portable",
              requiredOpenClawCapabilities: [],
              fullyPortableTools: [],
              hostBoundTools: [],
              nativeSubagentDelegations: [],
              acpAgentDelegations: [],
              hostServiceDelegations: [],
              degradedBehaviors: [],
              notes: [],
              rehearsedExtractionCandidate: true,
              extractionBlockers: []
            },
            audit: {
              rehearsedExtractionCandidate: true,
              extractionBlockers: [],
              verifyImport: {
                bundleId: "geometry_reviewer",
                cleanExternalMoveReady: true,
                extractionBlockers: []
              }
            }
          }
        ]
      })
    );

    const client = createControlPlaneClient({
      baseUrl: "https://control-plane.example.com",
      fetchImpl: fetchMock as typeof fetch
    });

    const result = await client.listBundles();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://control-plane.example.com/admin/bundles",
      undefined
    );
    expect(result).toEqual([
      expect.objectContaining({
        agentId: "geometry_solver",
        audit: {
          rehearsedExtractionCandidate: false,
          extractionBlockers: ["workspace.scene.read", "workspace.scene.write"],
          verifyImport: null
        },
        openClawCompatibility: expect.objectContaining({
          recommendedImportMode: "portable-with-host-bindings",
          hostBoundTools: ["scene.apply_command_batch"],
          rehearsedExtractionCandidate: false,
          extractionBlockers: ["workspace.scene.read", "workspace.scene.write"]
        })
      }),
      expect.objectContaining({
        agentId: "geometry_reviewer",
        audit: {
          rehearsedExtractionCandidate: true,
          extractionBlockers: [],
          verifyImport: {
            bundleId: "geometry_reviewer",
            cleanExternalMoveReady: true,
            extractionBlockers: []
          }
        },
        openClawCompatibility: expect.objectContaining({
          recommendedImportMode: "portable",
          rehearsedExtractionCandidate: true,
          extractionBlockers: []
        })
      })
    ]);
  });

  it("parses incremental run stream frames after a cursor", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        [
          `event: run.snapshot`,
          `data: ${JSON.stringify({
            run: {
              id: "run_1",
              threadId: "thread_1",
              profileId: "platform_geometry_standard",
              status: "waiting_for_checkpoint",
              inputArtifactIds: [],
              outputArtifactIds: [],
              budget: {
                maxModelCalls: 6,
                maxToolCalls: 8,
                maxDurationMs: 120000
              },
              createdAt: "2026-04-04T00:00:00.000Z",
              updatedAt: "2026-04-04T00:00:01.000Z"
            },
            checkpoints: [],
            artifacts: [],
            childRuns: [
              {
                id: "run_child_1",
                threadId: "thread_1",
                profileId: "platform_geometry_quick_draft",
                status: "running",
                parentRunId: "run_1",
                inputArtifactIds: [],
                outputArtifactIds: [],
                budget: {
                  maxModelCalls: 3,
                  maxToolCalls: 4,
                  maxDurationMs: 60000
                },
                createdAt: "2026-04-04T00:00:00.500Z",
                updatedAt: "2026-04-04T00:00:01.000Z"
              }
            ],
            memoryEntries: []
          })}`,
          ``,
          `event: run.event`,
          `data: ${JSON.stringify({
            id: "event_2",
            runId: "run_1",
            sequence: 2,
            type: "checkpoint.waiting",
            payload: {
              checkpointId: "checkpoint_1"
            },
            createdAt: "2026-04-04T00:00:01.000Z"
          })}`,
          ``
        ].join("\n"),
        {
          status: 200,
          headers: {
            "content-type": "text/event-stream"
          }
        }
      )
    );

    const client = createControlPlaneClient({
      baseUrl: "https://control-plane.example.com",
      fetchImpl: fetchMock as typeof fetch
    });

    const result = await client.streamRun("run_1", {
      afterSequence: 1
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://control-plane.example.com/api/v3/runs/run_1/stream?afterSequence=1",
      undefined
    );
    expect(result.events).toEqual([
      expect.objectContaining({
        sequence: 2,
        type: "checkpoint.waiting"
      })
    ]);
    expect(result.childRuns).toEqual([
      expect.objectContaining({
        id: "run_child_1",
        parentRunId: "run_1",
        profileId: "platform_geometry_quick_draft"
      })
    ]);
    expect(result.run.status).toBe("waiting_for_checkpoint");
  });
});

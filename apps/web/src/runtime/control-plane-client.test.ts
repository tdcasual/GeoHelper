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

  it("lists ACP sessions for a run", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      createJsonResponse({
        sessions: [
          {
            id: "acp_session_run_1_node_delegate",
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

    const result = await client.listAcpSessions({
      runId: "run_1"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://control-plane.example.com/api/v3/acp-sessions?runId=run_1",
      undefined
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: "acp_session_run_1_node_delegate",
        runId: "run_1",
        delegationName: "teacher_review"
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

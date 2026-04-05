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
    expect(result.run.status).toBe("waiting_for_checkpoint");
  });
});

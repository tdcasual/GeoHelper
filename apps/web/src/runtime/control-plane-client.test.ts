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
      })
    );

    const client = createControlPlaneClient({
      baseUrl: "https://control-plane.example.com",
      fetchImpl: fetchMock as typeof fetch
    });

    const result = await client.listRunProfiles();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://control-plane.example.com/api/v3/run-profiles",
      undefined
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: "platform_geometry_standard",
        workflowId: "wf_geometry_solver"
      })
    ]);
  });
});

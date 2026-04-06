import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";

describe("control-plane platform catalog routes", () => {
  it("exposes the public platform catalog snapshot", async () => {
    const app = buildServer();

    const res = await app.inject({
      method: "GET",
      url: "/api/v3/platform/catalog"
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({
      catalog: {
        runProfiles: expect.arrayContaining([
          expect.objectContaining({
            id: "platform_geometry_standard",
            agentId: "geometry_solver",
            workflowId: "wf_geometry_solver"
          }),
          expect.objectContaining({
            id: "platform_geometry_quick_draft"
          })
        ]),
        agents: [
          {
            id: "geometry_solver",
            name: "Geometry Solver",
            description:
              "Plans geometry constructions, emits browser-ready command batches, and gates outputs for classroom readiness.",
            workflowId: "wf_geometry_solver",
            toolNames: ["scene.read_state", "scene.apply_command_batch"],
            evaluatorNames: ["teacher_readiness"],
            defaultBudget: {
              maxModelCalls: 6,
              maxToolCalls: 8,
              maxDurationMs: 120000
            }
          }
        ],
        workflows: expect.arrayContaining([
          expect.objectContaining({
            id: "wf_geometry_solver",
            entryNodeId: "node_plan_geometry"
          })
        ]),
        tools: expect.arrayContaining([
          {
            name: "scene.apply_command_batch",
            kind: "browser_tool",
            permissions: ["scene:write"],
            retryable: false
          },
          {
            name: "scene.read_state",
            kind: "browser_tool",
            permissions: ["scene:read"],
            retryable: true
          }
        ]),
        evaluators: [
          {
            name: "teacher_readiness"
          }
        ]
      }
    });
  });

  it("exposes the same canonical platform catalog on the admin surface", async () => {
    const app = buildServer();

    const publicRes = await app.inject({
      method: "GET",
      url: "/api/v3/platform/catalog"
    });
    const adminRes = await app.inject({
      method: "GET",
      url: "/admin/platform/catalog"
    });

    expect(adminRes.statusCode).toBe(200);
    expect(JSON.parse(adminRes.payload)).toEqual(JSON.parse(publicRes.payload));
  });
});

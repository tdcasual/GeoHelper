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

    const payload = JSON.parse(res.payload) as {
      catalog: {
        runProfiles: Array<Record<string, unknown>>;
        agents: Array<Record<string, unknown>>;
        workflows: Array<Record<string, unknown>>;
        tools: Array<Record<string, unknown>>;
        evaluators: Array<Record<string, unknown>>;
      };
    };
    const geometrySolver = payload.catalog.agents.find(
      (agent) => agent.id === "geometry_solver"
    );
    const geometryReviewer = payload.catalog.agents.find(
      (agent) => agent.id === "geometry_reviewer"
    );

    expect(payload).toEqual({
      catalog: expect.objectContaining({
        runProfiles: expect.arrayContaining([
          expect.objectContaining({
            id: "platform_geometry_standard",
            agentId: "geometry_solver",
            workflowId: "wf_geometry_solver"
          }),
          expect.objectContaining({
            id: "platform_geometry_quick_draft"
          }),
          expect.objectContaining({
            id: "platform_geometry_review",
            agentId: "geometry_reviewer",
            workflowId: "wf_geometry_reviewer"
          })
        ]),
        agents: expect.any(Array),
        workflows: expect.arrayContaining([
          expect.objectContaining({
            id: "wf_geometry_solver",
            entryNodeId: "node_plan_geometry"
          }),
          expect.objectContaining({
            id: "wf_geometry_reviewer",
            entryNodeId: "node_plan_review"
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
      })
    });
    expect(geometrySolver).toMatchObject({
      id: "geometry_solver",
      name: "Geometry Solver",
      description:
        "Plans geometry constructions, proposes scene command batches, and gates outputs for classroom readiness.",
      defaultBudget: {
        maxModelCalls: 6,
        maxToolCalls: 8,
        maxDurationMs: 120000
      },
      bundle: expect.objectContaining({
        bundleId: "geometry_solver",
        schemaVersion: "2",
        hostRequirements: ["workspace.scene.read", "workspace.scene.write"],
        workspaceBootstrapFiles: expect.arrayContaining([
          "workspace/AGENTS.md",
          "workspace/STANDING_ORDERS.md"
        ]),
        promptAssetPaths: expect.arrayContaining([
          "prompts/planner.md",
          "prompts/evaluator-teacher-readiness.md"
        ])
      })
    });
    expect(geometrySolver).not.toHaveProperty("workflowId");
    expect(geometrySolver).not.toHaveProperty("toolNames");
    expect(geometrySolver).not.toHaveProperty("evaluatorNames");
    expect(geometryReviewer).toMatchObject({
      id: "geometry_reviewer",
      bundle: expect.objectContaining({
        bundleId: "geometry_reviewer",
        schemaVersion: "2",
        promptAssetPaths: expect.arrayContaining([
          "prompts/planner.md",
          "prompts/synthesizer.md"
        ])
      })
    });
    expect(geometryReviewer).not.toHaveProperty("workflowId");
    expect(geometryReviewer).not.toHaveProperty("toolNames");
    expect(geometryReviewer).not.toHaveProperty("evaluatorNames");
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

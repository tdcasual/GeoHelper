import { describe, expect, it } from "vitest";

import {
  createPlatformRegistry
} from "../src";

describe("platform registry", () => {
  it("composes multiple domain packages into a shared platform bootstrap", () => {
    const registry = createPlatformRegistry({
      domainPackages: [
        {
          id: "geometry",
          agents: {
            geometry_solver: {
              id: "geometry_solver",
              name: "Geometry Solver",
              description: "Solves geometry tasks",
              workflowId: "wf_geometry",
              toolNames: ["scene.read_state"],
              evaluatorNames: ["teacher_readiness"],
              defaultBudget: {
                maxModelCalls: 6,
                maxToolCalls: 8,
                maxDurationMs: 120000
              }
            }
          },
          runProfiles: {
            profile_geometry: {
              id: "profile_geometry",
              name: "Geometry Standard",
              description: "Default geometry run",
              agentId: "geometry_solver",
              workflowId: "wf_geometry",
              defaultBudget: {
                maxModelCalls: 6,
                maxToolCalls: 8,
                maxDurationMs: 120000
              }
            }
          },
          workflows: {
            wf_geometry: {
              id: "wf_geometry",
              version: 1,
              entryNodeId: "node_plan",
              nodes: [
                {
                  id: "node_plan",
                  kind: "planner",
                  name: "Plan",
                  config: {},
                  next: []
                }
              ]
            }
          },
          tools: {
            "scene.read_state": {
              name: "scene.read_state"
            }
          },
          evaluators: {
            teacher_readiness: {
              name: "teacher_readiness"
            }
          }
        },
        {
          id: "algebra",
          agents: {
            algebra_solver: {
              id: "algebra_solver",
              name: "Algebra Solver",
              description: "Solves algebra tasks",
              workflowId: "wf_algebra",
              toolNames: [],
              evaluatorNames: [],
              defaultBudget: {
                maxModelCalls: 4,
                maxToolCalls: 2,
                maxDurationMs: 60000
              }
            }
          },
          runProfiles: {
            profile_algebra: {
              id: "profile_algebra",
              name: "Algebra Standard",
              description: "Default algebra run",
              agentId: "algebra_solver",
              workflowId: "wf_algebra",
              defaultBudget: {
                maxModelCalls: 4,
                maxToolCalls: 2,
                maxDurationMs: 60000
              }
            }
          },
          workflows: {
            wf_algebra: {
              id: "wf_algebra",
              version: 1,
              entryNodeId: "node_model",
              nodes: [
                {
                  id: "node_model",
                  kind: "model",
                  name: "Reason",
                  config: {},
                  next: []
                }
              ]
            }
          },
          tools: {},
          evaluators: {}
        }
      ]
    });

    expect(registry.domainPackages.map((pkg) => pkg.id)).toEqual([
      "geometry",
      "algebra"
    ]);
    expect(registry.bootstrap.agents.geometry_solver).toBeDefined();
    expect(registry.bootstrap.agents.algebra_solver).toBeDefined();
    expect(registry.bootstrap.runProfiles.profile_geometry).toBeDefined();
    expect(registry.bootstrap.runProfiles.profile_algebra).toBeDefined();
    expect(registry.bootstrap.runProfileMap.get("profile_geometry")).toEqual(
      registry.bootstrap.runProfiles.profile_geometry
    );
    expect(registry.bootstrap.workflows.wf_algebra).toBeDefined();
  });
});

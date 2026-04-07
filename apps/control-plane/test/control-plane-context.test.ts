import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createPlatformRuntimeContext,
  type PlatformRuntimeContext
} from "@geohelper/agent-core";
import {
  createGeometryDomainPackage,
  createGeometryPlatformBootstrap
} from "@geohelper/agent-domain-geometry";
import type { PlatformAgentDefinition } from "@geohelper/agent-protocol";
import { describe, expect, it } from "vitest";

import {
  createControlPlaneServices,
  createControlPlaneStoreFromEnv
} from "../src/control-plane-context";

const createTestPlatformRuntime = () =>
  createPlatformRuntimeContext({
    agents: {
      geometry_solver: {
        id: "geometry_solver",
        name: "Geometry Solver",
        description: "Test agent",
        workflowId: "wf_basic",
        toolNames: [],
        evaluatorNames: [],
        defaultBudget: {
          maxModelCalls: 6,
          maxToolCalls: 8,
          maxDurationMs: 120000
        }
      }
    },
    runProfiles: {
      profile_basic: {
        id: "profile_basic",
        name: "Test workflow",
        description: "Test run profile",
        agentId: "geometry_solver",
        workflowId: "wf_basic",
        defaultBudget: {
          maxModelCalls: 6,
          maxToolCalls: 8,
          maxDurationMs: 120000
        }
      }
    },
    runProfileMap: new Map([
      [
        "profile_basic",
        {
          id: "profile_basic",
          name: "Test workflow",
          description: "Test run profile",
          agentId: "geometry_solver",
          workflowId: "wf_basic",
          defaultBudget: {
            maxModelCalls: 6,
            maxToolCalls: 8,
            maxDurationMs: 120000
          }
        }
      ]
    ]),
    workflows: {
      wf_basic: {
        id: "wf_basic",
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
      }
    },
    tools: {},
    evaluators: {}
  }) as PlatformRuntimeContext<
    PlatformAgentDefinition,
    {
      name: string;
      kind: string;
      permissions?: string[];
      retryable?: boolean;
    },
    unknown
  >;

describe("control-plane context", () => {
  it("seeds default run profiles from the shared geometry domain registry", () => {
    const services = createControlPlaneServices();
    const geometryDomain = createGeometryDomainPackage();

    expect([...services.runProfiles.keys()]).toEqual(
      Object.keys(geometryDomain.runProfiles)
    );
    expect(services.runProfiles.get("platform_geometry_standard")).toEqual(
      geometryDomain.runProfiles.platform_geometry_standard
    );
    expect(services.runProfiles.get("platform_geometry_quick_draft")).toEqual(
      geometryDomain.runProfiles.platform_geometry_quick_draft
    );
  });

  it("exposes the default platform bootstrap alongside the derived run profile map", () => {
    const services = createControlPlaneServices();

    expect(services.platformRuntime.bootstrap.runProfiles.platform_geometry_standard).toBeDefined();
    expect(services.platformRuntime.tools["scene.read_state"]).toBeDefined();
    expect(services.platformRuntime.agents.geometry_solver.bundle?.bundleId).toBe(
      "geometry_solver"
    );
    expect(services.runProfiles).toBe(services.platformRuntime.runProfiles);
  });

  it("can boot directly from the geometry platform bootstrap helper", () => {
    const runtime = createPlatformRuntimeContext(createGeometryPlatformBootstrap());

    expect(runtime.bootstrap.runProfiles.platform_geometry_standard).toBeDefined();
    expect(runtime.agents.geometry_solver.bundle?.promptAssetPaths).toContain(
      "prompts/planner.md"
    );
  });

  it("uses a durable sqlite agent store when GEOHELPER_AGENT_STORE_SQLITE_PATH is set", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "geohelper-control-plane-"));
    const databasePath = path.join(tempDir, "agent-store.sqlite");

    try {
      const firstStore = createControlPlaneStoreFromEnv({
        GEOHELPER_AGENT_STORE_SQLITE_PATH: databasePath
      });

      await firstStore.runs.createRun({
        id: "run_sqlite_env",
        threadId: "thread_sqlite_env",
        profileId: "platform_geometry_standard",
        status: "queued",
        inputArtifactIds: [],
        outputArtifactIds: [],
        budget: {
          maxModelCalls: 6,
          maxToolCalls: 8,
          maxDurationMs: 120000
        },
        createdAt: "2026-04-05T00:00:00.000Z",
        updatedAt: "2026-04-05T00:00:00.000Z"
      });

      const secondStore = createControlPlaneStoreFromEnv({
        GEOHELPER_AGENT_STORE_SQLITE_PATH: databasePath
      });

      expect(await secondStore.runs.getRun("run_sqlite_env")).toEqual(
        expect.objectContaining({
          id: "run_sqlite_env"
        })
      );
    } finally {
      rmSync(tempDir, {
        recursive: true,
        force: true
      });
    }
  });

  it("keeps the in-memory agent store as the default when no sqlite path is configured", async () => {
    const firstStore = createControlPlaneStoreFromEnv({});

    await firstStore.runs.createRun({
      id: "run_memory_default",
      threadId: "thread_memory_default",
      profileId: "platform_geometry_standard",
      status: "queued",
      inputArtifactIds: [],
      outputArtifactIds: [],
      budget: {
        maxModelCalls: 6,
        maxToolCalls: 8,
        maxDurationMs: 120000
      },
      createdAt: "2026-04-05T00:00:00.000Z",
      updatedAt: "2026-04-05T00:00:00.000Z"
    });

    const secondStore = createControlPlaneStoreFromEnv({});

    expect(await secondStore.runs.getRun("run_memory_default")).toBeNull();
  });

  it("drives the inline worker through durable dispatch records", async () => {
    const store = createControlPlaneStoreFromEnv({});
    const services = createControlPlaneServices({
      store,
      platformRuntime: createTestPlatformRuntime()
    });

    await store.runs.createRun({
      id: "run_inline_dispatch",
      threadId: "thread_inline_dispatch",
      profileId: "profile_basic",
      status: "queued",
      inputArtifactIds: [],
      outputArtifactIds: [],
      budget: {
        maxModelCalls: 6,
        maxToolCalls: 8,
        maxDurationMs: 120000
      },
      createdAt: "2026-04-05T00:00:00.000Z",
      updatedAt: "2026-04-05T00:00:00.000Z"
    });

    await services.processRun("run_inline_dispatch");

    const run = await store.runs.getRun("run_inline_dispatch");
    const events = await store.events.listRunEvents("run_inline_dispatch");

    expect(run?.status).toBe("completed");
    expect(events.map((event) => event.type)).toContain("run.completed");
    expect(
      await store.dispatches.claimNextDispatch({
        workerId: "worker_observer",
        claimedAt: "2026-04-05T00:01:00.000Z"
      })
    ).toBeNull();
  });
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createGeometryDomainPackage } from "@geohelper/agent-domain-geometry";
import { describe, expect, it } from "vitest";

import {
  createControlPlaneServices,
  createControlPlaneStoreFromEnv
} from "../src/control-plane-context";

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
    expect(services.runProfiles).toBe(services.platformRuntime.runProfiles);
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
});

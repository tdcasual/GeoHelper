import path from "node:path";

import { createPlatformRuntimeContext, type PlatformRuntimeContext } from "@geohelper/agent-core";
import { createGeometryPlatformBootstrap } from "@geohelper/agent-domain-geometry";
import {
  createOpenClawCompatibilityReportFromBundleDir,
  exportOpenClawBundleFromBundleDir,
  type ExportOpenClawBundleResult,
  type OpenClawCompatibilityReport,
  smokeImportOpenClawWorkspace} from "@geohelper/agent-export-openclaw";
import type {
  Checkpoint,
  CheckpointStatus,
  PlatformAgentDefinition,
  PlatformRunProfile,
  RunBudget,
  RunEvent
} from "@geohelper/agent-protocol";
import {
  type AgentStore,
  createMemoryAgentStore,
  createSqliteAgentStore} from "@geohelper/agent-store";
import {
  createWorkerRuntime,
  type WorkerToolRegistration
} from "@geohelper/worker";

interface PlatformToolCatalogRegistration extends WorkerToolRegistration {
  permissions?: string[];
  retryable?: boolean;
}

export interface RegisteredPortableBundle {
  agentId: string;
  bundleId: string;
  rootDir: string;
  schemaVersion: string;
  hostRequirements: string[];
  workspaceBootstrapFiles: string[];
  promptAssetPaths: string[];
  openClawCompatibility: OpenClawCompatibilityReport;
}

export interface ControlPlaneServices {
  store: AgentStore;
  platformRuntime: PlatformRuntimeContext<
    PlatformAgentDefinition,
    PlatformToolCatalogRegistration,
    unknown
  >;
  runProfiles: Map<string, PlatformRunProfile>;
  executionMode: "inline_worker_loop" | "custom";
  now: () => string;
  buildThreadId: () => string;
  buildRunId: () => string;
  buildBrowserSessionId: () => string;
  processRun: (runId: string) => Promise<void>;
  resumeRunFromCheckpoint: (input: {
    runId: string;
    checkpointId: string;
    response: unknown;
  }) => Promise<void>;
  resumeRunFromBrowserTool: (input: {
    runId: string;
    checkpointId: string;
    output: unknown;
  }) => Promise<void>;
  listBundles: () => RegisteredPortableBundle[];
  exportBundleToOpenClaw: (input: {
    agentId: string;
    outputDir?: string;
  }) => ExportOpenClawBundleResult & {
    agentId: string;
    bundleId: string;
  };
  smokeImportOpenClawExport: (input: {
    outputDir: string;
  }) => ReturnType<typeof smokeImportOpenClawWorkspace>;
}

export const DEFAULT_RUN_BUDGET: RunBudget = {
  maxModelCalls: 6,
  maxToolCalls: 8,
  maxDurationMs: 120000
};

const createIdFactory = (prefix: string): (() => string) => {
  let count = 0;

  return () => {
    count += 1;
    return `${prefix}_${count}`;
  };
};

const listRegisteredBundles = (
  platformRuntime: PlatformRuntimeContext<
    PlatformAgentDefinition,
    PlatformToolCatalogRegistration,
    unknown
  >
): RegisteredPortableBundle[] =>
  Object.values(platformRuntime.agents)
    .flatMap((agent) => {
      if (!agent.bundle?.rootDir) {
        return [];
      }

      return [
        {
          agentId: agent.id,
          bundleId: agent.bundle.bundleId,
          rootDir: agent.bundle.rootDir,
          schemaVersion: agent.bundle.schemaVersion,
          hostRequirements: [...agent.bundle.hostRequirements],
          workspaceBootstrapFiles: [...agent.bundle.workspaceBootstrapFiles],
          promptAssetPaths: [...agent.bundle.promptAssetPaths],
          openClawCompatibility: createOpenClawCompatibilityReportFromBundleDir({
            bundleDir: agent.bundle.rootDir
          })
        }
      ];
    })
    .sort((left, right) => left.agentId.localeCompare(right.agentId));

export const createControlPlaneStoreFromEnv = (
  env: NodeJS.ProcessEnv = process.env
): AgentStore => {
  const sqlitePath = env.GEOHELPER_AGENT_STORE_SQLITE_PATH?.trim();

  if (sqlitePath) {
    return createSqliteAgentStore({
      path: sqlitePath
    });
  }

  return createMemoryAgentStore();
};

export const createControlPlaneServices = (
  overrides: Partial<ControlPlaneServices> = {}
): ControlPlaneServices => {
  const store = overrides.store ?? createControlPlaneStoreFromEnv();
  const platformRuntime =
    overrides.platformRuntime ??
    createPlatformRuntimeContext(
      createGeometryPlatformBootstrap()
    );
  const workerRuntime = createWorkerRuntime({
    store,
    platformRuntime
  });

  const processRun =
    overrides.processRun ??
    (async (runId: string): Promise<void> => {
      workerRuntime.runLoop.enqueue(runId);
      await workerRuntime.runLoop.tick();
    });

  const resumeRunFromCheckpoint =
    overrides.resumeRunFromCheckpoint ??
    (async ({
      runId,
      checkpointId,
      response
    }: {
      runId: string;
      checkpointId: string;
      response: unknown;
    }): Promise<void> => {
      workerRuntime.runLoop.submitCheckpointResolution({
        runId,
        checkpointId,
        response
      });
      workerRuntime.runLoop.enqueue(runId);
      await workerRuntime.runLoop.tick();
    });

  const resumeRunFromBrowserTool =
    overrides.resumeRunFromBrowserTool ??
    (async ({
      runId,
      checkpointId,
      output
    }: {
      runId: string;
      checkpointId: string;
      output: unknown;
    }): Promise<void> => {
      workerRuntime.runLoop.submitBrowserToolResult({
        runId,
        checkpointId,
        output
      });
      workerRuntime.runLoop.enqueue(runId);
      await workerRuntime.runLoop.tick();
    });

  const listBundles =
    overrides.listBundles ?? (() => listRegisteredBundles(platformRuntime));

  const exportBundleToOpenClaw =
    overrides.exportBundleToOpenClaw ??
    (({
      agentId,
      outputDir
    }: {
      agentId: string;
      outputDir?: string;
    }) => {
      const agent = platformRuntime.agents[agentId];

      if (!agent?.bundle?.rootDir) {
        throw new Error(`bundle_not_found:${agentId}`);
      }

      const result = exportOpenClawBundleFromBundleDir({
        bundleDir: agent.bundle.rootDir,
        outputDir:
          outputDir ??
          path.resolve(process.cwd(), "exports", "openclaw", agent.bundle.bundleId)
      });

      return {
        ...result,
        agentId,
        bundleId: agent.bundle.bundleId
      };
    });

  const smokeImportOpenClawExport =
    overrides.smokeImportOpenClawExport ??
    (({ outputDir }: { outputDir: string }) =>
      smokeImportOpenClawWorkspace({
        workspaceDir: outputDir
      }));
  const executionMode =
    overrides.executionMode ??
    (overrides.processRun ||
    overrides.resumeRunFromCheckpoint ||
    overrides.resumeRunFromBrowserTool
      ? "custom"
      : "inline_worker_loop");

  return {
    store,
    platformRuntime,
    runProfiles: overrides.runProfiles ?? platformRuntime.runProfiles,
    executionMode,
    now: overrides.now ?? (() => new Date().toISOString()),
    buildThreadId: overrides.buildThreadId ?? createIdFactory("thread"),
    buildRunId: overrides.buildRunId ?? createIdFactory("run"),
    buildBrowserSessionId:
      overrides.buildBrowserSessionId ?? createIdFactory("browser_session"),
    processRun,
    resumeRunFromCheckpoint,
    resumeRunFromBrowserTool,
    listBundles,
    exportBundleToOpenClaw,
    smokeImportOpenClawExport
  };
};

export const appendRunEvent = async (
  services: ControlPlaneServices,
  runId: string,
  type: string,
  payload: Record<string, unknown>
): Promise<RunEvent> => {
  const existingEvents = await services.store.events.listRunEvents(runId);
  const nextSequence = existingEvents.length + 1;
  const event: RunEvent = {
    id: `event_${runId}_${nextSequence}`,
    runId,
    sequence: nextSequence,
    type,
    payload,
    createdAt: services.now()
  };

  await services.store.events.appendRunEvent(event);

  return event;
};

export const findCheckpointById = async (
  services: ControlPlaneServices,
  checkpointId: string
): Promise<Checkpoint | null> => {
  const statuses: CheckpointStatus[] = [
    "pending",
    "resolved",
    "expired",
    "cancelled"
  ];

  for (const status of statuses) {
    const checkpoint = (
      await services.store.checkpoints.listCheckpointsByStatus(status)
    ).find((item) => item.id === checkpointId);

    if (checkpoint) {
      return checkpoint;
    }
  }

  return null;
};

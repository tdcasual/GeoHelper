import {
  createPlatformRuntimeContext,
  type NodeHandlerMap,
  type PlatformRuntimeContext
} from "@geohelper/agent-core";
import {
  createGeometryPlatformBootstrap,
  type GeometryAgentDefinition,
  type GeometryEvaluator
} from "@geohelper/agent-domain-geometry";
import type { PlatformAgentDefinition } from "@geohelper/agent-protocol";
import {
  type AgentStore,
  createMemoryAgentStore,
  createSqliteAgentStore} from "@geohelper/agent-store";

import { createBrowserToolDispatch } from "./browser-tool-dispatch";
import {
  createRunLoop,
  type WorkerToolRegistration
} from "./run-loop";

export interface WorkerRuntimeOptions {
  store: AgentStore;
  platformRuntime: PlatformRuntimeContext<
    PlatformAgentDefinition,
    WorkerToolRegistration,
    unknown
  >;
  handlers?: NodeHandlerMap;
  now?: () => string;
}

export const createWorkerStoreFromEnv = (
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

export const createWorkerRuntime = ({
  store,
  platformRuntime,
  handlers,
  now
}: WorkerRuntimeOptions) => {
  const browserToolDispatch = createBrowserToolDispatch();
  const runLoop = createRunLoop({
    store,
    platformRuntime,
    handlers,
    now
  });

  return {
    browserToolDispatch,
    runLoop,
    platformRuntime
  };
};

export interface GeometryWorkerRuntimeOptions {
  store: AgentStore;
  handlers?: NodeHandlerMap;
  now?: () => string;
}

export const createGeometryWorkerRuntime = ({
  store,
  handlers,
  now
}: GeometryWorkerRuntimeOptions) => {
  const platformRuntime = createPlatformRuntimeContext(
    createGeometryPlatformBootstrap()
  );

  const runtime = createWorkerRuntime({
    store,
    platformRuntime,
    handlers,
    now
  });

  return {
    ...runtime
  };
};

export interface GeometryWorkerRuntime {
  browserToolDispatch: ReturnType<typeof createBrowserToolDispatch>;
  runLoop: ReturnType<typeof createRunLoop>;
  platformRuntime: PlatformRuntimeContext<
    GeometryAgentDefinition,
    WorkerToolRegistration,
    GeometryEvaluator<any, any>
  >;
}

export * from "./browser-tool-dispatch";
export * from "./model-dispatch";
export * from "./run-loop";

export const packageName = "@geohelper/worker";

import type { NodeHandlerMap } from "@geohelper/agent-core";
import {
  createGeometryPlatformBootstrap,
  type GeometryPlatformBootstrap
} from "@geohelper/agent-domain-geometry";
import type {
  PlatformRunProfile,
  WorkflowDefinition
} from "@geohelper/agent-protocol";
import type { AgentStore } from "@geohelper/agent-store";

import { createBrowserToolDispatch } from "./browser-tool-dispatch";
import { createRunLoop } from "./run-loop";

export interface WorkerRuntimeOptions {
  store: AgentStore;
  workflows: Record<string, WorkflowDefinition>;
  runProfiles: Record<string, PlatformRunProfile>;
  handlers?: NodeHandlerMap;
  now?: () => string;
}

export const createWorkerRuntime = ({
  store,
  workflows,
  runProfiles,
  handlers,
  now
}: WorkerRuntimeOptions) => {
  const browserToolDispatch = createBrowserToolDispatch();
  const runLoop = createRunLoop({
    store,
    workflows,
    runProfiles,
    handlers,
    now,
    browserToolDispatch
  });

  return {
    browserToolDispatch,
    runLoop
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
  const platformBootstrap = createGeometryPlatformBootstrap();

  const runtime = createWorkerRuntime({
    store,
    workflows: platformBootstrap.workflows,
    runProfiles: platformBootstrap.runProfiles,
    handlers,
    now
  });

  return {
    ...runtime,
    platformBootstrap
  };
};

export interface GeometryWorkerRuntime {
  browserToolDispatch: ReturnType<typeof createBrowserToolDispatch>;
  runLoop: ReturnType<typeof createRunLoop>;
  platformBootstrap: GeometryPlatformBootstrap;
}

export * from "./browser-tool-dispatch";
export * from "./model-dispatch";
export * from "./run-loop";

export const packageName = "@geohelper/worker";

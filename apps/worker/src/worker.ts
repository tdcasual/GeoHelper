import type { NodeHandlerMap } from "@geohelper/agent-core";
import type { WorkflowDefinition } from "@geohelper/agent-protocol";
import type { AgentStore } from "@geohelper/agent-store";

import { createBrowserToolDispatch } from "./browser-tool-dispatch";
import { createRunLoop } from "./run-loop";

export interface WorkerRuntimeOptions {
  store: AgentStore;
  workflows: Record<string, WorkflowDefinition>;
  handlers?: NodeHandlerMap;
  now?: () => string;
}

export const createWorkerRuntime = ({
  store,
  workflows,
  handlers,
  now
}: WorkerRuntimeOptions) => {
  const browserToolDispatch = createBrowserToolDispatch();
  const runLoop = createRunLoop({
    store,
    workflows,
    handlers,
    now,
    browserToolDispatch
  });

  return {
    browserToolDispatch,
    runLoop
  };
};

export * from "./browser-tool-dispatch";
export * from "./model-dispatch";
export * from "./run-loop";

export const packageName = "@geohelper/worker";

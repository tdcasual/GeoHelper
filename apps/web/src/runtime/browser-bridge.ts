import {
  type BrowserBridgeSession,
  type BrowserToolResult,
  BrowserToolResultSchema} from "@geohelper/browser-bridge";
import type { CommandBatch } from "@geohelper/protocol";

import { executeBatch as executeGeoGebraCommandBatch } from "../geogebra/command-executor";
import { sceneStore } from "../state/scene-store";

interface CanvasBridgeBindings {
  executeBatch: (batch: CommandBatch) => Promise<void>;
  getSceneXml: () => string | null;
}

export interface BrowserBridgeRuntimeOptions {
  session: BrowserBridgeSession;
  executeBatch?: (batch: CommandBatch) => Promise<void>;
  getSceneXml?: () => string | null;
  postToolResult?: (result: BrowserToolResult) => Promise<void>;
}

export interface BrowserBridgeRuntime {
  flushNextRequest: () => Promise<BrowserToolResult | null>;
}

let canvasBridgeBindings: CanvasBridgeBindings | null = null;

export const registerCanvasBridgeBindings = (
  bindings: CanvasBridgeBindings | null
): void => {
  canvasBridgeBindings = bindings;
};

const resolveExecuteBatch = (
  executeBatch?: (batch: CommandBatch) => Promise<void>
): ((batch: CommandBatch) => Promise<void>) =>
  executeBatch ??
  canvasBridgeBindings?.executeBatch ??
  executeGeoGebraCommandBatch;

const resolveGetSceneXml = (
  getSceneXml?: () => string | null
): (() => string | null) =>
  getSceneXml ??
  canvasBridgeBindings?.getSceneXml ??
  (() => sceneStore.getState().transactions[0]?.sceneSnapshot ?? null);

export const createBrowserBridgeRuntime = ({
  session,
  executeBatch,
  getSceneXml,
  postToolResult = async () => {}
}: BrowserBridgeRuntimeOptions): BrowserBridgeRuntime => ({
  flushNextRequest: async () => {
    const request = session.takeNextRequest();
    if (!request) {
      return null;
    }

    let output: unknown;

    if (request.toolName === "scene.read_state") {
      output = {
        sceneId: request.payload.sceneId ?? "active_scene",
        transactionCount: sceneStore.getState().transactions.length
      };
    } else if (request.toolName === "scene.apply_command_batch") {
      await resolveExecuteBatch(executeBatch)(request.payload.commandBatch);
      sceneStore.getState().recordTransaction(request.payload.commandBatch);
      output = {
        commandCount: request.payload.commandBatch.commands.length,
        transactionId: request.payload.commandBatch.transaction_id
      };
    } else {
      output = {
        sceneXml: request.payload.includeXml ? resolveGetSceneXml(getSceneXml)() : null,
        transactionCount: sceneStore.getState().transactions.length
      };
    }

    const result = BrowserToolResultSchema.parse({
      sessionId: request.sessionId,
      requestId: request.requestId,
      toolName: request.toolName,
      status: "completed",
      output
    });

    await postToolResult(result);

    return result;
  }
});

import { createBrowserBridgeSession } from "@geohelper/browser-bridge";
import type { CommandBatch } from "@geohelper/protocol";
import { describe, expect, it, vi } from "vitest";

import { createBrowserBridgeRuntime } from "./browser-bridge";

const commandBatch: CommandBatch = {
  version: "1.0",
  scene_id: "scene_1",
  transaction_id: "tx_1",
  commands: [
    {
      id: "cmd_1",
      op: "create_point",
      args: {
        label: "A",
        x: 0,
        y: 0
      },
      depends_on: [],
      idempotency_key: "scene_1:create_point:A"
    }
  ],
  post_checks: ["确认点 A 已创建"],
  explanations: ["先创建点 A。"]
};

describe("browser bridge runtime", () => {
  it("receives and handles browser tool requests from a session queue", async () => {
    const session = createBrowserBridgeSession({
      id: "browser_session_1"
    });

    session.enqueueRequest({
      sessionId: "browser_session_1",
      requestId: "request_1",
      toolName: "scene.read_state",
      payload: {
        sceneId: "scene_1"
      }
    });

    const runtime = createBrowserBridgeRuntime({
      session,
      postToolResult: async () => {}
    });

    const result = await runtime.flushNextRequest();

    expect(result?.toolName).toBe("scene.read_state");
    expect(result?.status).toBe("completed");
  });

  it("executes GeoGebra command batches for scene.apply_command_batch requests", async () => {
    const session = createBrowserBridgeSession({
      id: "browser_session_1"
    });
    const executeBatch = vi.fn(async () => {});

    session.enqueueRequest({
      sessionId: "browser_session_1",
      requestId: "request_2",
      toolName: "scene.apply_command_batch",
      payload: {
        commandBatch
      }
    });

    const runtime = createBrowserBridgeRuntime({
      session,
      executeBatch,
      postToolResult: async () => {}
    });

    const result = await runtime.flushNextRequest();

    expect(executeBatch).toHaveBeenCalledWith(commandBatch);
    expect(result?.output).toMatchObject({
      commandCount: 1,
      transactionId: "tx_1"
    });
  });

  it("posts canvas evidence back to the control plane", async () => {
    const session = createBrowserBridgeSession({
      id: "browser_session_1"
    });
    const postToolResult = vi.fn(async () => {});

    session.enqueueRequest({
      sessionId: "browser_session_1",
      requestId: "request_3",
      toolName: "scene.capture_snapshot",
      payload: {
        includeXml: true
      }
    });

    const runtime = createBrowserBridgeRuntime({
      session,
      getSceneXml: () => "<xml scene='scene_1' />",
      postToolResult
    });

    await runtime.flushNextRequest();

    expect(postToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "scene.capture_snapshot",
        status: "completed",
        output: expect.objectContaining({
          sceneXml: "<xml scene='scene_1' />"
        })
      })
    );
  });
});

import { describe, expect, it } from "vitest";

import {
  buildAssistantMessageFromCompileResult,
  buildCompileContext,
  resolveChatSendGuard
} from "./chat-send-flow";

describe("chat-send-flow", () => {
  it("builds recentMessages and sceneTransactions context", () => {
    const result = buildCompileContext({
      conversation: {
        id: "conv_1",
        title: "Circle",
        createdAt: 1,
        updatedAt: 2,
        messages: [
          {
            id: "msg_user",
            role: "user",
            content: "先画一个圆"
          },
          {
            id: "msg_assistant",
            role: "assistant",
            content: "已生成 1 条指令"
          }
        ]
      },
      sceneTransactions: [
        {
          id: "tx_1",
          sceneId: "scene_ctx",
          transactionId: "tx_ctx",
          executedAt: 3,
          commandCount: 1,
          batch: {
            version: "1.0",
            scene_id: "scene_ctx",
            transaction_id: "tx_ctx",
            commands: [],
            post_checks: [],
            explanations: []
          }
        }
      ]
    });

    expect(result.recentMessages).toHaveLength(2);
    expect(result.recentMessages?.[0]).toEqual({
      role: "user",
      content: "先画一个圆"
    });
    expect(result.sceneTransactions).toEqual([
      {
        sceneId: "scene_ctx",
        transactionId: "tx_ctx",
        commandCount: 1
      }
    ]);
  });

  it("returns official-mode guard when runtime lacks official auth", () => {
    expect(
      resolveChatSendGuard({
        mode: "official",
        runtime: {
          runtimeCapabilities: {
            supportsOfficialAuth: false,
            supportsVision: true,
            supportsAgentSteps: false,
            supportsServerMetrics: false,
            supportsRateLimitHeaders: false
          }
        },
        attachments: []
      })?.kind
    ).toBe("official_unsupported");
  });

  it("builds assistant messages from compile results", () => {
    expect(
      buildAssistantMessageFromCompileResult({
        id: "msg_assistant",
        batch: {
          version: "1.0",
          scene_id: "scene_1",
          transaction_id: "tx_1",
          commands: [
            {
              id: "cmd_circle",
              op: "create_conic",
              args: {
                kind: "Circle",
                points: ["A", "B"]
              },
              depends_on: [],
              idempotency_key: "cmd_circle_1"
            }
          ],
          post_checks: [],
          explanations: []
        },
        traceId: "trace_1",
        agentSteps: [
          {
            name: "intent",
            status: "ok",
            duration_ms: 12
          }
        ]
      })
    ).toMatchObject({
      role: "assistant",
      content: "已生成 1 条指令",
      traceId: "trace_1",
      agentSteps: [
        {
          name: "intent",
          status: "ok",
          duration_ms: 12
        }
      ]
    });
  });
});

import { describe, expect, it } from "vitest";

import { createAgentRunEnvelopeFixture } from "../test-utils/agent-run-fixture";
import {
  buildAssistantMessageFromCompileResult,
  buildAssistantMessageFromError,
  buildAssistantMessageFromGuard,
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
        agentRun: createAgentRunEnvelopeFixture({
          run: {
            id: "run_1"
          },
          draft: {
            commandBatchDraft: {
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
              post_checks: [
                "待确认：点 D 在线段 BC 上",
                "注意：请检查角平分线是否穿过顶点 A"
              ],
              explanations: ["已创建三角形 ABC", "已作角平分线 AD"]
            }
          },
          teacherPacket: {
            summary: ["已创建三角形 ABC", "已作角平分线 AD"],
            warnings: ["注意：请检查角平分线是否穿过顶点 A"],
            uncertainties: [
              {
                id: "unc_点_d_在线段_bc_上",
                label: "点 D 在线段 BC 上",
                reviewStatus: "pending",
                followUpPrompt:
                  "请基于当前图形结果，重新检查并明确以下待确认条件：点 D 在线段 BC 上。如果条件不成立，也请直接指出。"
              }
            ],
            canvasLinks: [
              {
                id: "summary_1",
                scope: "summary",
                text: "已创建三角形 ABC",
                objectLabels: ["A", "B", "C"]
              },
              {
                id: "summary_2",
                scope: "summary",
                text: "已作角平分线 AD",
                objectLabels: ["A", "D"]
              },
              {
                id: "uncertainty_unc_点_d_在线段_bc_上",
                scope: "uncertainty",
                text: "点 D 在线段 BC 上",
                objectLabels: ["D", "B", "C"],
                uncertaintyId: "unc_点_d_在线段_bc_上"
              }
            ]
          },
          telemetry: {
            upstreamCallCount: 2,
            degraded: false,
            retryCount: 0,
            stages: [
              {
                name: "author",
                status: "ok",
                durationMs: 12
              }
            ]
          }
        }),
        traceId: "trace_1",
      })
    ).toMatchObject({
      role: "assistant",
      content: "已创建三角形 ABC\n已作角平分线 AD",
      traceId: "trace_1",
      agentRunId: "run_1",
      result: {
        status: "success",
        commandCount: 1,
        summaryItems: ["已创建三角形 ABC", "已作角平分线 AD"],
        explanationLines: ["已创建三角形 ABC", "已作角平分线 AD"],
        warningItems: ["注意：请检查角平分线是否穿过顶点 A"],
        uncertaintyItems: [
          {
            id: "unc_点_d_在线段_bc_上",
            label: "点 D 在线段 BC 上",
            reviewStatus: "pending",
            followUpPrompt:
              "请基于当前图形结果，重新检查并明确以下待确认条件：点 D 在线段 BC 上。如果条件不成立，也请直接指出。"
          }
        ],
        canvasLinks: expect.arrayContaining([
          {
            id: "summary_1",
            scope: "summary",
            text: "已创建三角形 ABC",
            objectLabels: ["A", "B", "C"]
          },
          {
            id: "summary_2",
            scope: "summary",
            text: "已作角平分线 AD",
            objectLabels: ["A", "D"]
          },
          {
            id: "uncertainty_unc_点_d_在线段_bc_上",
            scope: "uncertainty",
            text: "点 D 在线段 BC 上",
            objectLabels: ["D", "B", "C"],
            uncertaintyId: "unc_点_d_在线段_bc_上"
          }
        ])
      },
      agentSteps: [
        {
          name: "author",
          status: "ok",
          duration_ms: 12
        }
      ]
    });
  });

  it("falls back to command-count content when compile result lacks explanations", () => {
    expect(
      buildAssistantMessageFromCompileResult({
        id: "msg_assistant_fallback",
        agentRun: createAgentRunEnvelopeFixture({
          run: {
            id: "run_fallback"
          },
          draft: {
            commandBatchDraft: {
              version: "1.0",
              scene_id: "scene_1",
              transaction_id: "tx_1",
              commands: [],
              post_checks: [],
              explanations: []
            }
          },
          teacherPacket: {
            summary: ["已生成 0 条指令"],
            warnings: [],
            uncertainties: [],
            canvasLinks: [],
            nextActions: []
          },
          telemetry: {
            upstreamCallCount: 1,
            degraded: false,
            retryCount: 0,
            stages: []
          }
        })
      })
    ).toMatchObject({
      content: "已生成 0 条指令",
      result: {
        status: "success",
        commandCount: 0,
        summaryItems: ["已生成 0 条指令"],
        canvasLinks: []
      }
    });
  });

  it("builds structured guard messages for teacher-facing review", () => {
    expect(
      buildAssistantMessageFromGuard({
        id: "msg_guard",
        guard: {
          kind: "attachments_unsupported",
          assistantMessage: "当前运行时或模型未开启图片能力"
        }
      })
    ).toMatchObject({
      role: "assistant",
      result: {
        status: "guard",
        commandCount: 0,
        summaryItems: ["当前运行时或模型未开启图片能力"],
        canvasLinks: []
      }
    });
  });

  it("builds structured error messages for teacher-facing review", () => {
    expect(
      buildAssistantMessageFromError({
        id: "msg_error",
        error: new Error("boom"),
        mode: "byok"
      })
    ).toMatchObject({
      role: "assistant",
      content: "生成失败，请重试",
      result: {
        status: "error",
        commandCount: 0,
        summaryItems: ["生成失败，请重试"],
        canvasLinks: []
      }
    });
  });
});

import { describe, expect, it } from "vitest";

import { createRunSnapshotFixture } from "../test-utils/platform-run-fixture";
import {
  buildAssistantMessageFromError,
  buildAssistantMessageFromGuard,
  buildAssistantMessageFromRunResult,
  buildRunContext,
  resolveChatSendGuard
} from "./chat-send-flow";

describe("chat-send-flow", () => {
  it("builds recentMessages and sceneTransactions context", () => {
    const result = buildRunContext({
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

  it("builds assistant messages from platform run snapshots", () => {
    expect(
      buildAssistantMessageFromRunResult({
        id: "msg_assistant",
        snapshot: createRunSnapshotFixture({
          run: {
            id: "run_1"
          },
          checkpoints: [
            {
              id: "unc_点_d_在线段_bc_上",
              runId: "run_1",
              nodeId: "node_teacher_checkpoint",
              kind: "human_input",
              status: "pending",
              title: "点 D 在线段 BC 上",
              prompt:
                "请基于当前图形结果，重新检查并明确以下待确认条件：点 D 在线段 BC 上。如果条件不成立，也请直接指出。",
              createdAt: "2026-04-04T00:00:03.000Z"
            }
          ],
          artifacts: [
            {
              id: "artifact_response_1",
              runId: "run_1",
              kind: "response",
              contentType: "application/json",
              storage: "inline",
              metadata: {},
              inlineData: {
                summary: ["已创建三角形 ABC", "已作角平分线 AD"]
              },
              createdAt: "2026-04-04T00:00:03.000Z"
            },
            {
              id: "artifact_tool_1",
              runId: "run_1",
              kind: "tool_result",
              contentType: "application/json",
              storage: "inline",
              metadata: {
                commandCount: 1
              },
              inlineData: {
                commandBatch: {
                  commands: [{ id: "cmd_circle" }]
                }
              },
              createdAt: "2026-04-04T00:00:02.000Z"
            }
          ],
          events: [
            {
              id: "event_1",
              runId: "run_1",
              sequence: 1,
              type: "node.completed",
              payload: {
                nodeId: "node_plan_geometry",
                resultType: "continue",
                durationMs: 12
              },
              createdAt: "2026-04-04T00:00:01.000Z"
            }
          ]
        }),
        traceId: "trace_1"
      })
    ).toMatchObject({
      role: "assistant",
      content: "已创建三角形 ABC\n已作角平分线 AD",
      traceId: "trace_1",
      platformRunId: "run_1",
      result: {
        status: "success",
        commandCount: 1,
        summaryItems: ["已创建三角形 ABC", "已作角平分线 AD"],
        explanationLines: ["已创建三角形 ABC", "已作角平分线 AD"],
        warningItems: [
          "请基于当前图形结果，重新检查并明确以下待确认条件：点 D 在线段 BC 上。如果条件不成立，也请直接指出。"
        ],
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
          name: "node_plan_geometry",
          status: "ok",
          duration_ms: 12
        }
      ]
    });
  });

  it("falls back to run status content when snapshot lacks response artifacts", () => {
    expect(
      buildAssistantMessageFromRunResult({
        id: "msg_assistant_fallback",
        snapshot: createRunSnapshotFixture({
          run: {
            id: "run_fallback",
            status: "queued"
          },
          artifacts: [],
          checkpoints: []
        })
      })
    ).toMatchObject({
      content: "Run 状态：queued",
      result: {
        status: "guard",
        commandCount: 0,
        summaryItems: ["Run 状态：queued"],
        canvasLinks: []
      }
    });
  });

  it("treats waiting_for_subagent snapshots as guard results", () => {
    expect(
      buildAssistantMessageFromRunResult({
        id: "msg_assistant_subagent_wait",
        snapshot: createRunSnapshotFixture({
          run: {
            id: "run_waiting_subagent",
            status: "waiting_for_subagent"
          },
          artifacts: [],
          checkpoints: []
        })
      })
    ).toMatchObject({
      content: "Run 状态：waiting_for_subagent",
      result: {
        status: "guard",
        summaryItems: ["Run 状态：waiting_for_subagent"]
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

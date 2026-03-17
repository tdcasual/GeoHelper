import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server";
import { clearRateLimits } from "../src/services/rate-limit";

describe("POST /api/v2/agent/runs", () => {
  it("returns an AgentRunEnvelope", async () => {
    clearRateLimits();

    const app = buildServer({}, {
      requestCommandBatch: async (input) => {
        if (input.systemPrompt?.includes("GeometryDraftPackage")) {
          return {
            normalizedIntent: "构造中点",
            assumptions: [],
            constructionPlan: ["先取线段 AB", "再取中点 M"],
            namingPlan: ["A", "B", "M"],
            commandBatchDraft: {
              version: "1.0",
              scene_id: "scene_1",
              transaction_id: "tx_1",
              commands: [],
              explanations: ["草案"],
              post_checks: []
            },
            teachingOutline: ["说明中点定义"],
            reviewChecklist: ["检查 M 是否在线段 AB 上"]
          };
        }

        return {
          reviewer: "geometry-reviewer",
          verdict: "approve",
          summary: ["草案可执行"],
          correctnessIssues: [],
          ambiguityIssues: [],
          namingIssues: [],
          teachingIssues: [],
          repairInstructions: [],
          uncertaintyItems: []
        };
      }
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/agent/runs",
      payload: {
        message: "作线段 AB 的中点 M",
        mode: "byok"
      }
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toMatchObject({
      trace_id: "tr_req-1",
      agent_run: {
        run: {
          status: "success"
        },
        teacherPacket: {
          summary: ["草案可执行"]
        }
      }
    });
  });

  it("accepts browser repair payloads and routes them through the repair author", async () => {
    clearRateLimits();

    const messages: string[] = [];
    const app = buildServer({}, {
      requestCommandBatch: async (input) => {
        messages.push(input.message);
        if (input.systemPrompt?.includes("GeometryDraftPackage")) {
          return {
            normalizedIntent: "修正点 D 位置",
            assumptions: [],
            constructionPlan: ["检查点 D", "修正角平分线"],
            namingPlan: ["A", "B", "C", "D"],
            commandBatchDraft: {
              version: "1.0",
              scene_id: "scene_1",
              transaction_id: "tx_2",
              commands: [],
              explanations: ["已重新检查点 D 条件"],
              post_checks: []
            },
            teachingOutline: ["说明修正原因"],
            reviewChecklist: ["检查点 D 是否在线段 BC 上"]
          };
        }

        return {
          reviewer: "geometry-reviewer",
          verdict: "approve",
          summary: ["已修正并可继续执行"],
          correctnessIssues: [],
          ambiguityIssues: [],
          namingIssues: [],
          teachingIssues: [],
          repairInstructions: [],
          uncertaintyItems: []
        };
      }
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/agent/runs",
      payload: {
        message: "请修正点 D 的位置",
        mode: "byok",
        repair: {
          sourceRun: {
            run: {
              id: "run_1",
              target: "gateway",
              mode: "byok",
              status: "success",
              iterationCount: 1,
              startedAt: "2026-03-17T10:00:00.000Z",
              finishedAt: "2026-03-17T10:00:01.000Z",
              totalDurationMs: 1000
            },
            draft: {
              normalizedIntent: "构造角平分线",
              assumptions: [],
              constructionPlan: ["先画三角形", "再作角平分线"],
              namingPlan: ["A", "B", "C", "D"],
              commandBatchDraft: {
                version: "1.0",
                scene_id: "scene_1",
                transaction_id: "tx_1",
                commands: [],
                explanations: ["原始草案"],
                post_checks: []
              },
              teachingOutline: ["说明角平分线定义"],
              reviewChecklist: ["检查点 D 是否在 BC 上"]
            },
            reviews: [],
            evidence: {
              preflight: {
                status: "passed",
                issues: [],
                referencedLabels: ["A", "B", "C", "D"],
                generatedLabels: ["A", "B", "C", "D"]
              }
            },
            teacherPacket: {
              summary: ["已创建三角形 ABC"],
              warnings: [],
              uncertainties: [],
              nextActions: ["修正点 D"],
              canvasLinks: []
            },
            telemetry: {
              upstreamCallCount: 2,
              degraded: false,
              retryCount: 0,
              stages: []
            }
          },
          teacherInstruction: "只修正点 D 在线段 BC 上这一项",
          canvasEvidence: {
            executedCommandCount: 2,
            failedCommandIds: [],
            createdLabels: ["A", "B", "C", "D"],
            visibleLabels: ["D", "B", "C"],
            teacherFocus: "点 D 在线段 BC 上"
          }
        }
      }
    });

    expect(res.statusCode).toBe(200);
    expect(messages[0]).toContain("只修正点 D 在线段 BC 上这一项");
    expect(messages[0]).toContain("Canvas evidence");
    expect(JSON.parse(res.payload)).toMatchObject({
      agent_run: {
        teacherPacket: {
          summary: ["已修正并可继续执行"]
        }
      }
    });
  });
});

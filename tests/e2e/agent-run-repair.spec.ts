import { expect, test } from "@playwright/test";

import { mockGeoGebraRuntime } from "./geogebra.test-helpers";

const createAgentRunPayload = (input: {
  traceId: string;
  runId: string;
  summary: string[];
  uncertainties?: Array<{
    id: string;
    label: string;
    followUpPrompt: string;
    reviewStatus: "pending" | "confirmed" | "needs_fix";
  }>;
  canvasLinks?: Array<{
    id: string;
    scope: "summary" | "warning" | "uncertainty";
    text: string;
    objectLabels: string[];
    uncertaintyId?: string;
  }>;
}) => ({
  trace_id: input.traceId,
  agent_run: {
    run: {
      id: input.runId,
      target: "gateway",
      mode: "byok",
      status: "success",
      iterationCount: 1,
      startedAt: "2026-03-17T10:00:00.000Z",
      finishedAt: "2026-03-17T10:00:01.000Z",
      totalDurationMs: 1000
    },
    draft: {
      normalizedIntent: "画一个三角形",
      assumptions: [],
      constructionPlan: ["先作三角形", "再检查点 D"],
      namingPlan: ["A", "B", "C", "D"],
      commandBatchDraft: {
        version: "1.0",
        scene_id: "scene_1",
        transaction_id: `tx_${input.runId}`,
        commands: [],
        post_checks: [],
        explanations: input.summary
      },
      teachingOutline: ["说明作图顺序"],
      reviewChecklist: ["检查点 D 是否在 BC 上"]
    },
    reviews: [
      {
        reviewer: "geometry-reviewer",
        verdict: "approve",
        summary: input.summary,
        correctnessIssues: [],
        ambiguityIssues: [],
        namingIssues: [],
        teachingIssues: [],
        repairInstructions: [],
        uncertaintyItems: input.uncertainties ?? []
      }
    ],
    evidence: {
      preflight: {
        status: "passed",
        issues: [],
        referencedLabels: ["A", "B", "C", "D"],
        generatedLabels: ["A", "B", "C", "D"]
      }
    },
    teacherPacket: {
      summary: input.summary,
      warnings: [],
      uncertainties: input.uncertainties ?? [],
      nextActions: ["继续修正"],
      canvasLinks: input.canvasLinks ?? []
    },
    telemetry: {
      upstreamCallCount: 2,
      degraded: false,
      retryCount: 0,
      stages: [
        {
          name: "author",
          status: "ok",
          durationMs: 8
        }
      ]
    }
  }
});

test("repairing one uncertainty sends structured repair payload with canvas evidence", async ({
  page
}) => {
  const requests: Array<Record<string, unknown>> = [];

  await mockGeoGebraRuntime(page);
  await page.route("**/api/v2/agent/runs", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(body);

    const responseBody =
      requests.length === 1
        ? createAgentRunPayload({
            traceId: "tr_initial",
            runId: "run_initial",
            summary: ["已创建三角形 ABC"],
            uncertainties: [
              {
                id: "unc_d",
                label: "点 D 在线段 BC 上",
                followUpPrompt: "请确认点 D 是否在线段 BC 上，并说明原因。",
                reviewStatus: "pending"
              }
            ],
            canvasLinks: [
              {
                id: "link_unc_d",
                scope: "uncertainty",
                text: "点 D 在线段 BC 上",
                objectLabels: ["D", "B", "C"],
                uncertaintyId: "unc_d"
              }
            ]
          })
        : createAgentRunPayload({
            traceId: "tr_repair",
            runId: "run_repair",
            summary: ["已重新检查点 D 条件"]
          });

    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*"
      },
      body: JSON.stringify(responseBody)
    });
  });

  await page.setViewportSize({ width: 1600, height: 960 });
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();
  await page.getByTestId("chat-composer-input").fill("画一个三角形");
  await page.getByRole("button", { name: "发送" }).click();

  await page.getByTestId("studio-uncertainty-repair-unc_d").click();

  await expect
    .poll(() => requests.length)
    .toBeGreaterThanOrEqual(2);

  const repairRequest = requests[1] as {
    message?: string;
    repair?: {
      teacherInstruction?: string;
      sourceRun?: {
        run?: {
          id?: string;
        };
      };
      canvasEvidence?: {
        visibleLabels?: string[];
        teacherFocus?: string;
      };
    };
  };

  expect(repairRequest.message).toContain("仅针对这一项待确认条件完成核对与修正");
  expect(repairRequest.repair?.sourceRun?.run?.id).toBe("run_initial");
  expect(repairRequest.repair?.canvasEvidence?.visibleLabels).toEqual([
    "D",
    "B",
    "C"
  ]);
  expect(repairRequest.repair?.canvasEvidence?.teacherFocus).toContain(
    "点 D 在线段 BC 上"
  );
  expect(repairRequest.repair?.teacherInstruction).toContain("点 D 在线段 BC 上");
  await expect(page.getByTestId("studio-result-panel")).toContainText(
    "已重新检查点 D 条件"
  );
});

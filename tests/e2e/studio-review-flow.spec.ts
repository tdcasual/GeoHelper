import { expect, test } from "@playwright/test";

import { createAgentRunPayload } from "./agent-run.test-helpers";

test("compact chat surface keeps the latest review result after surface switches", async ({
  page
}) => {
  await page.route("**/api/v2/agent/runs", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*"
      },
      body: JSON.stringify(
        createAgentRunPayload({
          traceId: "tr_compact_review",
          runId: "run_compact_review",
          summary: ["已创建三角形 ABC"],
          uncertainties: [
            {
              id: "unc_点_d_在线段_bc_上",
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
              uncertaintyId: "unc_点_d_在线段_bc_上"
            }
          ]
        })
      )
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();
  await page.getByTestId("mobile-surface-chat").click();

  await page.getByTestId("chat-composer-input").fill("画一个三角形");
  await page.getByRole("button", { name: "发送" }).click();

  const compactResult = page.getByTestId("studio-result-panel");
  await expect(compactResult).toBeVisible();
  await expect(compactResult.getByText("可继续补图")).toBeVisible();
  await expect(compactResult.getByText("点 D 在线段 BC 上")).toBeVisible();

  await page.getByTestId("mobile-surface-canvas").click();
  await page.getByTestId("mobile-surface-chat").click();

  await expect(compactResult).toBeVisible();
  await expect(compactResult.getByText("可继续补图")).toBeVisible();
});

test("review panel offers retry after a failed generation", async ({ page }) => {
  let attempts = 0;

  await page.route("**/api/v2/agent/runs", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({
        status: 500,
        headers: {
          "content-type": "application/json",
          "access-control-allow-origin": "*"
        },
        body: JSON.stringify({
          error: {
            code: "COMPILE_FAILED",
            message: "upstream failed"
          }
        })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*"
      },
      body: JSON.stringify(
        createAgentRunPayload({
          traceId: "tr_retry_success",
          runId: "run_retry_success",
          summary: ["已创建可编辑图形"]
        })
      )
    });
  });

  await page.setViewportSize({ width: 1600, height: 960 });
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();

  await page.getByTestId("chat-composer-input").fill("画一个圆");
  await page.getByRole("button", { name: "发送" }).click();

  const resultPanel = page.getByTestId("studio-result-panel");
  await expect(resultPanel.getByText("本轮生成失败")).toBeVisible();
  await page.getByRole("button", { name: "重试当前请求" }).click();
  await expect(resultPanel.getByText("可继续补图")).toBeVisible();
  await expect(
    resultPanel.locator("li").filter({ hasText: /^已创建可编辑图形$/ })
  ).toBeVisible();
});

test("review panel lets the teacher confirm one uncertainty item", async ({
  page
}) => {
  await page.route("**/api/v2/agent/runs", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*"
      },
      body: JSON.stringify(
        createAgentRunPayload({
          traceId: "tr_confirm_review",
          runId: "run_confirm_review",
          summary: ["已创建三角形 ABC"],
          uncertainties: [
            {
              id: "unc_点_d_在线段_bc_上",
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
              uncertaintyId: "unc_点_d_在线段_bc_上"
            }
          ]
        })
      )
    });
  });

  await page.setViewportSize({ width: 1600, height: 960 });
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();
  await page.getByTestId("chat-composer-input").fill("画一个三角形");
  await page.getByRole("button", { name: "发送" }).click();

  const resultPanel = page.getByTestId("studio-result-panel");
  await expect(resultPanel.getByText("待处理 1")).toBeVisible();
  await page.getByTestId("studio-uncertainty-confirm-unc_点_d_在线段_bc_上").click();
  await expect(resultPanel.getByText("待处理 0")).toBeVisible();
  await expect(resultPanel.getByText("已确认 1")).toBeVisible();
});

test("repairing one uncertainty sends a focused follow-up prompt", async ({
  page
}) => {
  const capturedMessages: string[] = [];

  await page.route("**/api/v2/agent/runs", async (route) => {
    const body = route.request().postDataJSON() as { message?: string };
    capturedMessages.push(body.message ?? "");

    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*"
      },
      body: JSON.stringify(
        capturedMessages.length === 1
          ? createAgentRunPayload({
              traceId: `tr_repair_${capturedMessages.length}`,
              runId: `run_repair_${capturedMessages.length}`,
              summary: ["已创建三角形 ABC"],
              uncertainties: [
                {
                  id: "unc_点_d_在线段_bc_上",
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
                  uncertaintyId: "unc_点_d_在线段_bc_上"
                }
              ]
            })
          : createAgentRunPayload({
              traceId: `tr_repair_${capturedMessages.length}`,
              runId: `run_repair_${capturedMessages.length}`,
              summary: ["已重新检查点 D 条件"]
            })
      )
    });
  });

  await page.setViewportSize({ width: 1600, height: 960 });
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();
  await page.getByTestId("chat-composer-input").fill("画一个三角形");
  await page.getByRole("button", { name: "发送" }).click();

  await page.getByTestId("studio-uncertainty-repair-unc_点_d_在线段_bc_上").click();

  await expect
    .poll(() => capturedMessages.length)
    .toBeGreaterThanOrEqual(2);
  expect(capturedMessages[1]).toContain("仅针对这一项待确认条件完成核对与修正");
  expect(capturedMessages[1]).toContain("点 D 在线段 BC 上");
});

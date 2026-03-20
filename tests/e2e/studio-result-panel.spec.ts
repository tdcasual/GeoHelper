import { expect, test } from "@playwright/test";

import { createAgentRunPayload } from "./agent-run.test-helpers";

const mockCompile = async (page: import("@playwright/test").Page) => {
  await page.route("**/api/v2/agent/runs", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*"
      },
      body: JSON.stringify(
        createAgentRunPayload({
          traceId: "tr_e2e_result_panel",
          runId: "run_e2e_result_panel",
          summary: ["已创建三角形 ABC", "已作角平分线 AD"],
          explanations: ["已创建三角形 ABC", "已作角平分线 AD"],
          postChecks: ["待确认：点 D 在线段 BC 上"],
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
};

test("right rail shows structured result sections after one send", async ({
  page
}) => {
  await mockCompile(page);
  await page.setViewportSize({ width: 1600, height: 960 });
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();

  await page.getByTestId("chat-composer-input").fill("作一条垂直平分线");
  await page.getByRole("button", { name: "发送" }).click();

  const resultRail = page.getByTestId("studio-result-rail");
  const resultPanel = page.getByTestId("studio-result-panel");
  await expect(resultRail).toBeVisible();
  await expect(resultPanel.getByRole("heading", { name: "结果状态" })).toBeVisible();
  await expect(resultPanel.getByRole("heading", { name: "图形摘要" })).toBeVisible();
  await expect(resultPanel.getByRole("heading", { name: "执行步骤" })).toBeVisible();
  await expect(resultPanel.getByRole("heading", { name: "待确认" })).toBeVisible();
  await expect(resultPanel.getByRole("heading", { name: "下一步动作" })).toBeVisible();
  await expect(resultPanel.getByText("点 D 在线段 BC 上")).toBeVisible();
  await expect(resultRail.getByRole("button", { name: "补辅助线" })).toBeVisible();
  await expect(resultRail.getByRole("button", { name: "生成讲解思路" })).toBeVisible();
  await expect(page.getByTestId("proof-assist-action-add_auxiliary")).toBeEnabled();
  await expect(page.getByTestId("chat-structured-result-receipt")).toContainText(
    "结构化结果已同步到结果面板"
  );

  const resultPanelSurface = await resultPanel.evaluate((node) => {
    const styles = window.getComputedStyle(node);
    return {
      borderRadius: styles.borderTopLeftRadius,
      boxShadow: styles.boxShadow
    };
  });
  expect(parseFloat(resultPanelSurface.borderRadius)).toBeGreaterThanOrEqual(20);
  expect(resultPanelSurface.boxShadow).not.toBe("none");
});

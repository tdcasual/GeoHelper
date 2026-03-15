import { expect, test } from "@playwright/test";

const mockCompile = async (page: import("@playwright/test").Page) => {
  await page.route("**/api/v1/chat/compile", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*"
      },
      body: JSON.stringify({
        trace_id: "tr_e2e_result_panel",
        batch: {
          version: "1.0",
          scene_id: "s1",
          transaction_id: "t1",
          commands: [],
          post_checks: [],
          explanations: []
        },
        agent_steps: [
          { name: "intent", status: "ok", duration_ms: 5 },
          { name: "planner", status: "ok", duration_ms: 8 },
          { name: "command", status: "ok", duration_ms: 10 }
        ]
      })
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
  await expect(resultPanel.getByRole("heading", { name: "图形摘要" })).toBeVisible();
  await expect(resultPanel.getByRole("heading", { name: "执行步骤" })).toBeVisible();
  await expect(resultPanel.getByRole("heading", { name: "下一步动作" })).toBeVisible();
  await expect(resultRail.getByRole("button", { name: "补辅助线" })).toBeVisible();
  await expect(resultRail.getByRole("button", { name: "生成讲解思路" })).toBeVisible();
  await expect(page.getByTestId("proof-assist-action-add_auxiliary")).toBeEnabled();

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

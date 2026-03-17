import { expect, test } from "@playwright/test";

test("compact chat surface keeps the latest review result after surface switches", async ({
  page
}) => {
  await page.route("**/api/v1/chat/compile", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*"
      },
      body: JSON.stringify({
        trace_id: "tr_compact_review",
        batch: {
          version: "1.0",
          scene_id: "s1",
          transaction_id: "t1",
          commands: [],
          post_checks: ["待确认：点 D 在线段 BC 上"],
          explanations: ["已创建三角形 ABC"]
        },
        agent_steps: [{ name: "intent", status: "ok", duration_ms: 5 }]
      })
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

  await page.route("**/api/v1/chat/compile", async (route) => {
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
      body: JSON.stringify({
        trace_id: "tr_retry_success",
        batch: {
          version: "1.0",
          scene_id: "s1",
          transaction_id: "t1",
          commands: [],
          post_checks: [],
          explanations: ["已创建可编辑图形"]
        },
        agent_steps: [{ name: "intent", status: "ok", duration_ms: 5 }]
      })
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
  await expect(resultPanel.getByText("已创建可编辑图形")).toBeVisible();
});

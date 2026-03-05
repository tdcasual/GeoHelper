import { expect, test } from "@playwright/test";

test("opens settings drawer from top bar", async ({ page }) => {
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "设置" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("heading", { name: "设置" })).toBeVisible();
});

test("applies byok preset config to compile request", async ({ page }) => {
  let capturedModel = "";
  let capturedEndpoint = "";
  let capturedByokKey = "";

  await page.route("**/api/v1/chat/compile", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST,OPTIONS",
          "access-control-allow-headers": "*"
        },
        body: ""
      });
      return;
    }

    const payload = route.request().postDataJSON() as { model?: string };
    const headers = route.request().headers();
    capturedModel = payload.model ?? "";
    capturedEndpoint = headers["x-byok-endpoint"] ?? "";
    capturedByokKey = headers["x-byok-key"] ?? "";

    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*"
      },
      body: JSON.stringify({
        trace_id: "tr_settings_1",
        batch: {
          version: "1.0",
          scene_id: "s1",
          transaction_id: "t1",
          commands: [],
          post_checks: [],
          explanations: []
        },
        agent_steps: []
      })
    });
  });

  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "设置" }).click();

  await page.getByTestId("byok-model-input").fill("openai/gpt-4o-mini");
  await page
    .getByTestId("byok-endpoint-input")
    .fill("https://openrouter.ai/api/v1");
  await page.getByTestId("byok-key-input").fill("sk-e2e-byok");
  await page.getByTestId("byok-save-button").click();
  await page.getByRole("button", { name: "关闭" }).click();

  await page.getByPlaceholder("例如：过点A和B作垂直平分线").fill("画一个圆");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("已生成 0 条指令")).toBeVisible();

  await expect.poll(() => capturedModel).toBe("openai/gpt-4o-mini");
  await expect.poll(() => capturedEndpoint).toBe("https://openrouter.ai/api/v1");
  await expect.poll(() => capturedByokKey).toBe("sk-e2e-byok");
});

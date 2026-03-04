import { expect, test } from "@playwright/test";

test("send message appends assistant reply", async ({ page }) => {
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

    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*"
      },
      body: JSON.stringify({
        trace_id: "tr_e2e_1",
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
          { name: "planner", status: "ok", duration_ms: 7 },
          { name: "command", status: "ok", duration_ms: 10 },
          { name: "verifier", status: "ok", duration_ms: 1 },
          { name: "repair", status: "skipped", duration_ms: 0 }
        ]
      })
    });
  });

  await page.goto("http://localhost:5173");
  await page.getByPlaceholder("例如：过点A和B作垂直平分线").fill("画一个圆");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("已生成 0 条指令")).toBeVisible();
  await expect(page.getByText("intent")).toBeVisible();
  await expect(page.getByText("planner")).toBeVisible();
  await expect(page.getByText("verifier")).toBeVisible();
});

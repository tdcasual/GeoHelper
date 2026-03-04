import { expect, test } from "@playwright/test";

test("supports creating and switching conversations in sidebar", async ({
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
        trace_id: "tr_e2e_sidebar",
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
          { name: "command", status: "ok", duration_ms: 10 },
          { name: "verifier", status: "ok", duration_ms: 1 },
          { name: "repair", status: "skipped", duration_ms: 0 }
        ]
      })
    });
  });

  await page.goto("http://localhost:5173");
  await expect(page.locator("[data-testid='conversation-item']")).toHaveCount(1);

  await page.getByRole("button", { name: "新建会话" }).click();
  await expect(page.locator("[data-testid='conversation-item']")).toHaveCount(2);

  await page
    .getByPlaceholder("例如：过点A和B作垂直平分线")
    .fill("第二个会话消息");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(
    page.locator(".chat-message").filter({ hasText: "第二个会话消息" })
  ).toHaveCount(1);

  await page
    .locator("[data-testid='conversation-item']")
    .last()
    .click();
  await expect(
    page.locator(".chat-message").filter({ hasText: "第二个会话消息" })
  ).toHaveCount(0);
});

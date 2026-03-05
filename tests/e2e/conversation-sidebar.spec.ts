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
};

test("history drawer is hidden by default and can be toggled", async ({
  page
}) => {
  await page.goto("http://localhost:5173");

  await expect(page.getByTestId("conversation-sidebar")).toBeHidden();

  await page.getByTestId("history-toggle-button").click();
  await expect(page.getByTestId("conversation-sidebar")).toBeVisible();

  await page.getByTestId("history-toggle-button").click();
  await expect(page.getByTestId("conversation-sidebar")).toBeHidden();
});

test("supports creating and switching conversations in history drawer", async ({
  page
}) => {
  await mockCompile(page);

  await page.goto("http://localhost:5173");
  await page.getByTestId("history-toggle-button").click();

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

  await page.locator("[data-testid='conversation-item']").last().click();
  await expect(
    page.locator(".chat-message").filter({ hasText: "第二个会话消息" })
  ).toHaveCount(0);
});

test("history drawer width can be resized and remains bounded", async ({
  page
}) => {
  await page.goto("http://localhost:5173");
  await page.getByTestId("history-toggle-button").click();

  const drawer = page.getByTestId("conversation-sidebar");
  const resizer = page.getByTestId("history-resizer");
  await expect(drawer).toBeVisible();
  await expect(resizer).toBeVisible();

  const before = await drawer.boundingBox();
  expect(before?.width ?? 0).toBeGreaterThan(0);

  const resizerBox = await resizer.boundingBox();
  expect(resizerBox).not.toBeNull();

  if (!resizerBox) {
    return;
  }

  await page.mouse.move(
    resizerBox.x + resizerBox.width / 2,
    resizerBox.y + resizerBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    resizerBox.x + resizerBox.width / 2 + 1000,
    resizerBox.y + resizerBox.height / 2
  );
  await page.mouse.up();

  const afterExpand = await drawer.boundingBox();
  expect(afterExpand?.width ?? 0).toBeLessThanOrEqual(420);

  await page.mouse.move(
    resizerBox.x + resizerBox.width / 2,
    resizerBox.y + resizerBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    resizerBox.x + resizerBox.width / 2 - 1000,
    resizerBox.y + resizerBox.height / 2
  );
  await page.mouse.up();

  const afterShrink = await drawer.boundingBox();
  expect(afterShrink?.width ?? 0).toBeGreaterThanOrEqual(180);
});

test("restores unsent draft per conversation", async ({ page }) => {
  await page.goto("http://localhost:5173");
  await page.getByTestId("history-toggle-button").click();

  const composer = page.getByTestId("chat-composer-input");
  await composer.fill("会话一草稿");

  await page.getByRole("button", { name: "新建会话" }).click();
  await expect(composer).toHaveValue("");
  await composer.fill("会话二草稿");

  await page.locator("[data-testid='conversation-item']").nth(1).click();
  await expect(composer).toHaveValue("会话一草稿");

  await page.locator("[data-testid='conversation-item']").first().click();
  await expect(composer).toHaveValue("会话二草稿");
});

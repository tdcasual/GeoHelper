import { expect, test } from "@playwright/test";

const mockCompile = async (page: import("@playwright/test").Page) => {
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
};

test("composer supports shift-enter newline and enter send", async ({ page }) => {
  await mockCompile(page);
  await page.goto("http://localhost:5173");

  const composer = page.getByTestId("chat-composer-input");
  await composer.fill("第一行");
  await composer.press("Shift+Enter");
  await composer.type("第二行");

  await expect(composer).toHaveValue("第一行\n第二行");
  await composer.press("Enter");

  await expect(
    page.locator(".chat-message").filter({ hasText: "第一行" })
  ).toHaveCount(1);
  await expect(
    page.locator(".chat-message").filter({ hasText: "第二行" })
  ).toHaveCount(1);
  await expect(composer).toHaveValue("");
});

test("slash command menu can apply template", async ({ page }) => {
  await page.goto("http://localhost:5173");

  const composer = page.getByTestId("chat-composer-input");
  await composer.fill("/垂直");

  await expect(page.getByTestId("slash-command-menu")).toBeVisible();
  await page.getByRole("button", { name: /垂直平分线/ }).click();

  await expect(composer).toHaveValue("过点A和B作线段AB的垂直平分线。");
});

test("plus menu can apply template action", async ({ page }) => {
  await page.goto("http://localhost:5173");

  await page.getByTestId("plus-menu-button").click();
  await expect(page.getByTestId("plus-menu")).toBeVisible();
  await page.getByRole("button", { name: "画圆" }).click();

  await expect(page.getByTestId("chat-composer-input")).toHaveValue(
    "过点A为圆心，半径为3作圆。"
  );
});

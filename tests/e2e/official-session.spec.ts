import { expect, test } from "@playwright/test";

const openWorkspace = async (page: import("@playwright/test").Page) => {
  await page.goto("/");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();
};

const setOfficialSnapshot = () => {
  localStorage.setItem(
    "geohelper.chat.snapshot",
    JSON.stringify({
      mode: "official",
      sessionToken: "session-token-e2e",
      messages: [],
      reauthRequired: false
    })
  );
};

test("opens token dialog automatically when official session expires", async ({
  page
}) => {
  await page.addInitScript(setOfficialSnapshot);

  await page.route("**/api/v3/threads", async (route) => {
    await route.fulfill({
      status: 401,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*"
      },
      body: JSON.stringify({
        error: {
          code: "SESSION_EXPIRED",
          message: "Session token is invalid or expired"
        }
      })
    });
  });

  await openWorkspace(page);
  await page.getByPlaceholder("例如：过点A和B作垂直平分线").fill("画一个圆");
  await page.getByRole("button", { name: "发送" }).click();

  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByTestId("session-warning")).toBeVisible();
});

test("logout button revokes official session and clears local login state", async ({
  page
}) => {
  await page.addInitScript(setOfficialSnapshot);
  let revokeCalled = false;

  await page.route("**/api/v1/auth/token/revoke", async (route) => {
    revokeCalled = true;
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*"
      },
      body: JSON.stringify({
        revoked: true
      })
    });
  });

  await openWorkspace(page);
  await expect(page.getByRole("button", { name: "退出官方会话" })).toBeVisible();
  await page.getByRole("button", { name: "退出官方会话" }).click();

  await expect.poll(() => revokeCalled).toBe(true);
  await expect(page.getByTestId("session-warning")).toBeVisible();
});

import { expect, test } from "@playwright/test";

import {
  openWorkspace,
  seedGatewayRemoteBackupSettings
} from "./settings-drawer.test-helpers";

test("opens settings as centered modal with section navigation", async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole("button", { name: "设置" }).click();

  const modal = page.getByTestId("settings-modal");
  await expect(modal).toBeVisible();
  await expect(page.getByRole("heading", { name: "设置" })).toBeVisible();
  await expect(page.getByRole("button", { name: "通用", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "模型与预设", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "当前会话", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "实验功能", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "数据与安全", exact: true })).toBeVisible();

  const box = await modal.boundingBox();
  expect(box?.x ?? 0).toBeGreaterThan(40);

  await page.getByRole("button", { name: "模型与预设", exact: true }).click();
  await expect(page.getByRole("heading", { name: "BYOK 预设", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "官方预设", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "数据与安全", exact: true }).click();
  await expect(page.getByRole("heading", { name: "备份与恢复", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "安全", exact: true })).toBeVisible();
});

test("opening settings preserves desktop history preference", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await openWorkspace(page);

  await page.getByTestId("history-toggle-button").click();
  await expect(page.getByTestId("conversation-sidebar")).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem("geohelper.ui.preferences");
        return raw ? JSON.parse(raw).historyDrawerVisible ?? null : null;
      })
    )
    .toBe(true);

  await page.getByRole("button", { name: "设置" }).click();
  await expect(page.getByTestId("settings-modal")).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem("geohelper.ui.preferences");
        return raw ? JSON.parse(raw).historyDrawerVisible ?? null : null;
      }),
      { message: "opening settings should not clear the persisted desktop history state" }
    )
    .toBe(true);

  await page.getByRole("button", { name: "关闭" }).click();
  await expect(page.getByTestId("settings-modal")).toBeHidden();
  await expect(page.getByTestId("conversation-sidebar")).toBeVisible();
  await expect(page.getByTestId("history-toggle-button")).toHaveText("收起历史");
});

test("settings drawer platform run profiles loads and refreshes control-plane catalog", async ({
  page
}) => {
  let runProfileRequests = 0;

  await seedGatewayRemoteBackupSettings(page);
  await page.route("https://gateway.example.com/api/v3/platform/catalog", async (route) => {
    runProfileRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        catalog: {
          runProfiles: [
            {
              id: "platform_remote_geometry_pro",
              name: "远端几何增强",
              description: "control-plane 下发的增强版本",
              agentId: "geometry_solver",
              workflowId: "wf_geometry_solver",
              defaultBudget: {
                maxModelCalls: 9,
                maxToolCalls: 12,
                maxDurationMs: 180000
              }
            }
          ]
        }
      })
    });
  });

  await openWorkspace(page);
  await page.getByRole("button", { name: "设置" }).click();

  await expect(page.getByTestId("platform-run-profile-select")).toBeVisible();
  await expect(page.getByTestId("platform-run-profile-select")).toContainText(
    "远端几何增强"
  );
  await expect(page.getByText("目录来源：Control Plane")).toBeVisible();
  await expect.poll(() => runProfileRequests).toBe(1);

  await page.getByTestId("platform-run-profile-refresh").click();
  await expect.poll(() => runProfileRequests).toBe(2);
  await expect(page.getByTestId("platform-run-profile-select")).toContainText(
    "远端几何增强"
  );
});

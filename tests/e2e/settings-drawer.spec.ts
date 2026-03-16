import { expect, test } from "@playwright/test";

import { openWorkspace } from "./settings-drawer.test-helpers";

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

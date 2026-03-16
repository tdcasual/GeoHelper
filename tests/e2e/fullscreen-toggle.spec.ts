import { expect, test } from "@playwright/test";

import { openWorkspaceAt } from "./fullscreen-toggle.test-helpers";

test("desktop toggles chat without pushing the panel offscreen", async ({
  page
}) => {
  await openWorkspaceAt(page, { width: 1600, height: 900 });

  const canvas = page.locator("[data-panel='canvas']");
  const chat = page.locator("[data-panel='chat']");

  await expect(chat).toBeVisible();
  const geogebraApplet = page.getByTestId("geogebra-host");
  const geogebraWidthWithChat = (await geogebraApplet.boundingBox())?.width ?? 0;
  expect(geogebraWidthWithChat).toBeGreaterThan(500);

  await page.getByRole("button", { name: "收起对话" }).click();
  await expect(chat).toBeHidden();

  const fullWidth = (await canvas.boundingBox())?.width ?? 0;
  expect(fullWidth).toBeGreaterThan(900);

  await expect
    .poll(
      async () => (await geogebraApplet.boundingBox())?.width ?? 0,
      { message: "GeoGebra applet should expand after hiding chat" }
    )
    .toBeGreaterThan(geogebraWidthWithChat + 200);

  await page.getByRole("button", { name: "显示对话" }).click();
  await expect(chat).toBeVisible();
});

test("desktop exposes a fullscreen control and toggles fullscreen mode", async ({
  page
}) => {
  await openWorkspaceAt(page, { width: 1600, height: 900 });

  const fullscreenButton = page.getByTestId("canvas-fullscreen-button");
  await expect(fullscreenButton).toBeVisible();
  await expect(fullscreenButton).toHaveAttribute("aria-label", "全屏显示");

  await fullscreenButton.click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  await expect(fullscreenButton).toHaveAttribute("aria-label", "退出全屏");

  await fullscreenButton.click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement === null))
    .toBe(true);
  await expect(fullscreenButton).toHaveAttribute("aria-label", "全屏显示");
});

test("mobile canvas exposes a fullscreen control and toggles fullscreen mode", async ({
  page
}) => {
  await openWorkspaceAt(page, { width: 390, height: 844 });

  const fullscreenButton = page.getByTestId("canvas-fullscreen-button");
  await expect(fullscreenButton).toBeVisible();
  await expect(fullscreenButton).toHaveAttribute("aria-label", "全屏显示");

  await fullscreenButton.click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  await expect(fullscreenButton).toHaveAttribute("aria-label", "退出全屏");

  await fullscreenButton.click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement === null))
    .toBe(true);
  await expect(fullscreenButton).toHaveAttribute("aria-label", "全屏显示");
});

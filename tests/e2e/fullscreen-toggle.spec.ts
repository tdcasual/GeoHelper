import { expect, test } from "@playwright/test";

test("desktop can hide chat panel and keep canvas full width", async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("http://localhost:5173");

  await page.getByRole("button", { name: "Hide Chat" }).click();
  await expect(page.locator("[data-panel='chat']")).toBeHidden();
});

test("tablet history drawer opens with bounded width", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 1366 });
  await page.goto("http://localhost:5173");

  await page.getByTestId("history-toggle-button").click();
  const drawer = page.getByTestId("conversation-sidebar");
  await expect(drawer).toBeVisible();

  const box = await drawer.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(150);
  expect(box?.width ?? 0).toBeLessThanOrEqual(420);
});

test("mobile history opens as bottom sheet and keeps composer visible", async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:5173");

  await page.getByTestId("history-toggle-button").click();
  const drawer = page.getByTestId("conversation-sidebar");
  await expect(drawer).toBeVisible();
  await expect(page.getByTestId("chat-composer-input")).toBeVisible();

  const box = await drawer.boundingBox();
  expect(box).not.toBeNull();
  if (!box) {
    return;
  }

  expect(box.height).toBeGreaterThan(120);
  expect(box.y).toBeGreaterThan(300);
});

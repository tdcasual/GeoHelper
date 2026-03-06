import { expect, test } from "@playwright/test";

test("desktop toggles chat without pushing the panel offscreen", async ({
  page
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("http://localhost:5173");

  const canvas = page.locator("[data-panel='canvas']");
  const chat = page.locator("[data-panel='chat']");

  await expect(chat).toBeVisible();
  const geogebraApplet = page.locator("#ggbApplet");
  const geogebraWidthWithChat = (await geogebraApplet.boundingBox())?.width ?? 0;
  expect(geogebraWidthWithChat).toBeGreaterThan(500);

  await page.getByRole("button", { name: "Hide Chat" }).click();
  await expect(chat).toBeHidden();

  const fullWidth = (await canvas.boundingBox())?.width ?? 0;
  expect(fullWidth).toBeGreaterThan(900);

  await expect
    .poll(
      async () => (await geogebraApplet.boundingBox())?.width ?? 0,
      { message: "GeoGebra applet should expand after hiding chat" }
    )
    .toBeGreaterThan(geogebraWidthWithChat + 200);

  await page.getByRole("button", { name: "Show Chat" }).click();
  await expect(chat).toBeVisible();

  await expect
    .poll(
      async () => (await canvas.boundingBox())?.width ?? 0,
      { message: "canvas should shrink after showing chat" }
    )
    .toBeLessThan(fullWidth - 200);

  await expect
    .poll(
      async () => {
        const box = await chat.boundingBox();
        return box ? box.x + box.width : 0;
      },
      { message: "chat panel should stay within the viewport" }
    )
    .toBeLessThanOrEqual(1600);

  await page.getByRole("button", { name: "Hide Chat" }).click();
  await expect(chat).toBeHidden();

  await expect
    .poll(
      async () => (await canvas.boundingBox())?.width ?? 0,
      { message: "canvas should expand after hiding chat" }
    )
    .toBeGreaterThan(fullWidth - 20);
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

  const chatBody = page.locator(".chat-body");
  const chatBodyBox = await chatBody.boundingBox();
  expect(chatBodyBox?.width ?? 0).toBeGreaterThanOrEqual(220);
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

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.viewportWidth);

  const box = await drawer.boundingBox();
  expect(box).not.toBeNull();
  if (!box) {
    return;
  }

  expect(box.height).toBeGreaterThan(120);
  expect(box.y).toBeGreaterThan(300);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
});

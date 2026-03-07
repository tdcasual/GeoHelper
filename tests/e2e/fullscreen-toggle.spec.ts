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

  await page.getByRole("button", { name: "收起对话" }).click();
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

test("mobile canvas dedicates most of the host height to the graphics view", async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:5173");

  await expect
    .poll(() =>
      page.evaluate(() => {
        const host = document.querySelector("[data-testid='geogebra-host']");
        const graphics = document.querySelector(".EuclidianPanel");
        const hostHeight = host?.getBoundingClientRect().height ?? 0;
        const graphicsHeight = graphics?.getBoundingClientRect().height ?? 0;
        return hostHeight > 0 ? graphicsHeight / hostHeight : 0;
      })
    )
    .toBeGreaterThan(0.7);
});

test("mobile uses surface tabs, compact header, and overlay history", async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:5173");

  await expect(page.getByTestId("mobile-surface-switcher")).toBeVisible();
  await expect(page.getByTestId("mobile-surface-canvas")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.locator("[data-panel='chat']")).toBeHidden();

  const topBarHeight = await page.evaluate(
    () => document.querySelector(".top-bar")?.getBoundingClientRect().height ?? 0
  );
  expect(topBarHeight).toBeLessThanOrEqual(96);

  await page.getByTestId("mobile-surface-chat").click();
  await expect(page.locator("[data-panel='chat']")).toBeVisible();
  await expect(page.getByTestId("mobile-more-button")).toBeVisible();

  await page.getByTestId("history-toggle-button").click();
  const sheet = page.getByTestId("history-sheet");
  await expect(sheet).toBeVisible();

  const [sheetBox, overflow, position] = await Promise.all([
    sheet.boundingBox(),
    page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    })),
    page.evaluate(
      () =>
        getComputedStyle(
          document.querySelector("[data-testid='history-sheet']") as HTMLElement
        ).position
    )
  ]);

  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.viewportWidth);
  expect(position).toBe("absolute");
  expect(sheetBox).not.toBeNull();
  if (!sheetBox) {
    return;
  }

  expect(sheetBox.width).toBeLessThanOrEqual(overflow.viewportWidth);
  expect(sheetBox.y + sheetBox.height).toBeLessThanOrEqual(
    overflow.viewportHeight
  );
});

test("mobile overflow menu opens as an anchored overlay without pushing content", async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:5173");
  await page.getByTestId("mobile-surface-chat").click();

  const before = await page.evaluate(() => ({
    topBarHeight: document.querySelector(".top-bar")?.getBoundingClientRect().height ?? 0,
    chatPanelY: document.querySelector("[data-panel='chat']")?.getBoundingClientRect().y ?? 0
  }));

  await page.getByTestId("mobile-more-button").click();
  const menu = page.getByTestId("mobile-overflow-menu");
  await expect(menu).toBeVisible();

  const after = await page.evaluate(() => {
    const menuNode = document.querySelector("[data-testid='mobile-overflow-menu']") as
      | HTMLElement
      | null;
    const rect = menuNode?.getBoundingClientRect();
    return {
      topBarHeight: document.querySelector(".top-bar")?.getBoundingClientRect().height ?? 0,
      chatPanelY: document.querySelector("[data-panel='chat']")?.getBoundingClientRect().y ?? 0,
      menuPosition: menuNode ? getComputedStyle(menuNode).position : null,
      menuRect: rect
        ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        : null
    };
  });

  expect(after.topBarHeight).toBe(before.topBarHeight);
  expect(after.chatPanelY).toBe(before.chatPanelY);
  expect(["absolute", "fixed"]).toContain(after.menuPosition);
  expect(after.menuRect).not.toBeNull();
  if (!after.menuRect) {
    return;
  }

  expect(after.menuRect.x + after.menuRect.width).toBeLessThanOrEqual(390);
  expect(after.menuRect.y + after.menuRect.height).toBeLessThanOrEqual(844);
});

test("mobile overflow menu closes history sheet before opening", async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:5173");
  await page.getByTestId("mobile-surface-chat").click();

  await page.getByTestId("history-toggle-button").click();
  await expect(page.getByTestId("history-sheet")).toBeVisible();

  await page.getByTestId("mobile-more-button").click();
  await expect(page.getByTestId("mobile-overflow-menu")).toBeVisible();
  await expect(page.getByTestId("history-sheet")).toBeHidden();
});

test("compact landscape uses single-surface layout instead of narrow split panes", async ({
  page
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("http://localhost:5173");

  await expect(page.getByTestId("mobile-surface-switcher")).toBeVisible();
  await expect(page.locator("[data-panel='chat']")).toBeHidden();
  await expect(page.locator("[data-panel='canvas']")).toBeVisible();

  await page.getByTestId("mobile-surface-chat").click();
  await expect(page.locator("[data-panel='chat']")).toBeVisible();
  await expect(page.locator("[data-panel='canvas']")).toBeHidden();

  const chatBodyWidth = await page.evaluate(
    () => document.querySelector(".chat-body")?.getBoundingClientRect().width ?? 0
  );
  expect(chatBodyWidth).toBeGreaterThan(500);
});


test("mobile overflow menu closes on outside click", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:5173");
  await page.getByTestId("mobile-surface-chat").click();

  await page.getByTestId("mobile-more-button").click();
  await expect(page.getByTestId("mobile-overflow-menu")).toBeVisible();

  await page.mouse.click(40, 220);
  await expect(page.getByTestId("mobile-overflow-menu")).toBeHidden();
});

test("mobile plus menu closes when leaving the chat surface", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:5173");
  await page.getByTestId("mobile-surface-chat").click();

  await page.getByTestId("plus-menu-button").click();
  await expect(page.getByTestId("plus-menu")).toBeVisible();

  await page.getByTestId("mobile-surface-canvas").click();
  await page.getByTestId("mobile-surface-chat").click();
  await expect(page.getByTestId("plus-menu")).toBeHidden();
});

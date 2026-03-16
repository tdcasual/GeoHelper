import { expect, test } from "@playwright/test";

import {
  mockFullscreenApi,
  openCompactChatWorkspace,
  openWorkspaceAt
} from "./fullscreen-toggle.test-helpers";

test("mobile canvas dedicates most of the host height to the graphics view", async ({
  page
}) => {
  await openWorkspaceAt(page, { width: 390, height: 844 });

  await expect
    .poll(() =>
      page.evaluate(() => {
        const host = document.querySelector("[data-testid='geogebra-host']");
        const graphics = document.querySelector("#geogebra-container");
        const hostHeight = host?.getBoundingClientRect().height ?? 0;
        const graphicsHeight = graphics?.getBoundingClientRect().height ?? 0;
        return hostHeight > 0 ? graphicsHeight / hostHeight : 0;
      })
    )
    .toBeGreaterThan(0.92);
});

test("mobile rotating to landscape keeps GeoGebra filling most of the canvas host", async ({
  page
}) => {
  await openWorkspaceAt(page, { width: 390, height: 844 });

  await expect(page.getByTestId("mobile-surface-canvas")).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  await page.setViewportSize({ width: 932, height: 430 });

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const host = document.querySelector("[data-testid='geogebra-host']");
          const container = document.querySelector("#geogebra-container");
          const hostWidth = host?.getBoundingClientRect().width ?? 0;
          const containerWidth = container?.getBoundingClientRect().width ?? 0;
          return hostWidth > 0 ? containerWidth / hostWidth : 0;
        }),
      { message: "GeoGebra canvas should widen after switching to landscape" }
    )
    .toBeGreaterThan(0.75);

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const host = document.querySelector("[data-testid='geogebra-host']");
          const container = document.querySelector("#geogebra-container");
          const hostHeight = host?.getBoundingClientRect().height ?? 0;
          const containerHeight = container?.getBoundingClientRect().height ?? 0;
          return containerHeight - hostHeight;
        }),
      { message: "GeoGebra canvas should stay within host height in landscape" }
    )
    .toBeLessThanOrEqual(4);
});

test("mobile fullscreen survives rotation between portrait and landscape", async ({
  page
}) => {
  await mockFullscreenApi(page);

  const rotateViewport = async (width: number, height: number) => {
    await page.setViewportSize({ width, height });
  };

  await openWorkspaceAt(page, { width: 390, height: 844 });
  await page.getByTestId("canvas-fullscreen-button").click();

  await expect
    .poll(
      () => page.evaluate(() => !!document.fullscreenElement),
      { message: "portrait should enter fullscreen before rotating" }
    )
    .toBe(true);

  await rotateViewport(844, 390);

  await expect
    .poll(
      () => page.evaluate(() => !!document.fullscreenElement),
      { message: "rotating to landscape should keep the GeoGebra host in fullscreen" }
    )
    .toBe(true);

  await rotateViewport(390, 844);

  await expect
    .poll(
      () => page.evaluate(() => !!document.fullscreenElement),
      { message: "rotating back to portrait should still keep fullscreen active" }
    )
    .toBe(true);
});

test("mobile uses surface tabs, compact header, and overlay history", async ({
  page
}) => {
  await openWorkspaceAt(page, { width: 390, height: 844 });

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
  await openCompactChatWorkspace(page, { width: 390, height: 844 });

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
  await openCompactChatWorkspace(page, { width: 390, height: 844 });

  await page.getByTestId("history-toggle-button").click();
  await expect(page.getByTestId("history-sheet")).toBeVisible();

  await page.getByTestId("mobile-more-button").click();
  await expect(page.getByTestId("mobile-overflow-menu")).toBeVisible();
  await expect(page.getByTestId("history-sheet")).toBeHidden();
});

test("compact landscape uses single-surface layout instead of narrow split panes", async ({
  page
}) => {
  await openWorkspaceAt(page, { width: 844, height: 390 });

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

test("compact landscape top bar stays compact on short viewports", async ({
  page
}) => {
  await openWorkspaceAt(page, { width: 844, height: 390 });

  await expect(page.getByTestId("mobile-surface-switcher")).toBeVisible();

  const { topBarHeight, hostHeight, viewportHeight } = await page.evaluate(() => ({
    topBarHeight: document.querySelector(".top-bar")?.getBoundingClientRect().height ?? 0,
    hostHeight:
      document
        .querySelector("[data-testid='geogebra-host']")
        ?.getBoundingClientRect().height ?? 0,
    viewportHeight: window.innerHeight
  }));

  expect(topBarHeight).toBeLessThanOrEqual(84);
  expect(hostHeight).toBeGreaterThanOrEqual(Math.floor(viewportHeight * 0.72));
});

test("short landscape history sheet expands into a full modal layer", async ({
  page
}) => {
  await openCompactChatWorkspace(page, { width: 844, height: 390 });
  await page.getByTestId("history-toggle-button").click();

  await expect(page.getByTestId("history-sheet")).toBeVisible();

  const { sheetY, sheetHeight, sheetBottom, viewportHeight } = await page.evaluate(() => {
    const sheet = document.querySelector("[data-testid='history-sheet']");
    const rect = sheet?.getBoundingClientRect();
    return {
      sheetY: rect?.y ?? 0,
      sheetHeight: rect?.height ?? 0,
      sheetBottom: rect ? rect.y + rect.height : 0,
      viewportHeight: window.innerHeight
    };
  });

  expect(sheetY).toBeLessThanOrEqual(110);
  expect(sheetHeight).toBeGreaterThanOrEqual(220);
  expect(sheetBottom).toBeLessThanOrEqual(viewportHeight);
  expect(viewportHeight - sheetBottom).toBeLessThanOrEqual(4);
});

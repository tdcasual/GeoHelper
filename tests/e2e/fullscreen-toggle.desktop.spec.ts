import { expect, test } from "@playwright/test";

import { openWorkspaceAt } from "./fullscreen-toggle.test-helpers";

test("tablet history drawer opens with bounded width", async ({ page }) => {
  await openWorkspaceAt(page, { width: 1024, height: 1366 });

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

test("desktop GeoGebra frame fills most of the canvas host on wide layouts", async ({
  page
}) => {
  await openWorkspaceAt(page, { width: 1200, height: 700 });

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const host = document.querySelector("[data-testid='geogebra-host']");
          const frame = document.querySelector("#geogebra-container");
          const hostWidth = host?.getBoundingClientRect().width ?? 0;
          const frameWidth = frame?.getBoundingClientRect().width ?? 0;
          return hostWidth > 0 ? frameWidth / hostWidth : 0;
        }),
      { message: "GeoGebra frame should fill most of the host width on desktop" }
    )
    .toBeGreaterThan(0.92);

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const host = document.querySelector("[data-testid='geogebra-host']");
          const frame = document.querySelector("#geogebra-container");
          const hostHeight = host?.getBoundingClientRect().height ?? 0;
          const frameHeight = frame?.getBoundingClientRect().height ?? 0;
          return hostHeight > 0 ? frameHeight / hostHeight : 0;
        }),
      { message: "GeoGebra frame should fill most of the host height on desktop" }
    )
    .toBeGreaterThan(0.92);
});

test("near-breakpoint desktop keeps chat usable when history opens", async ({
  page
}) => {
  await openWorkspaceAt(page, { width: 901, height: 600 });

  const chatBody = page.locator(".chat-body");
  const widthBefore = (await chatBody.boundingBox())?.width ?? 0;
  expect(widthBefore).toBeGreaterThan(320);

  await page.getByTestId("history-toggle-button").click();
  await expect(page.getByTestId("conversation-sidebar")).toBeVisible();

  await expect
    .poll(
      async () => (await chatBody.boundingBox())?.width ?? 0,
      { message: "chat body should stay usable when history opens near breakpoint" }
    )
    .toBeGreaterThan(widthBefore - 60);
});

test("desktop history preference survives a compact viewport detour", async ({
  page
}) => {
  await openWorkspaceAt(page, { width: 1200, height: 900 });

  await page.getByTestId("history-toggle-button").click();
  await expect(page.getByTestId("conversation-sidebar")).toBeVisible();
  await expect(page.getByTestId("history-toggle-button")).toHaveText("收起历史");

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const raw = localStorage.getItem("geohelper.ui.preferences");
          return raw ? JSON.parse(raw).historyDrawerVisible ?? null : null;
        }),
      { message: "desktop history visibility should be persisted after opening" }
    )
    .toBe(true);

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByTestId("mobile-surface-switcher")).toBeVisible();
  await expect(page.getByTestId("history-sheet")).toHaveCount(0);

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const raw = localStorage.getItem("geohelper.ui.preferences");
          return raw ? JSON.parse(raw).historyDrawerVisible ?? null : null;
        }),
      {
        message:
          "compact viewport should not overwrite the persisted desktop history visibility"
      }
    )
    .toBe(true);

  await page.setViewportSize({ width: 1200, height: 900 });
  await expect(page.getByTestId("conversation-sidebar")).toBeVisible();
  await expect(page.getByTestId("history-toggle-button")).toHaveText("收起历史");
});

test("desktop 1600 keeps chat readable when history opens", async ({ page }) => {
  await openWorkspaceAt(page, { width: 1600, height: 900 });

  const inputBody = page.locator(".studio-input-body");
  const widthBefore = (await inputBody.boundingBox())?.width ?? 0;
  expect(widthBefore).toBeGreaterThan(300);

  await page.getByTestId("history-toggle-button").click();
  await expect(page.getByTestId("conversation-sidebar")).toBeVisible();

  await expect
    .poll(
      async () => (await inputBody.boundingBox())?.width ?? 0,
      { message: "1600 desktop input rail should stay wide enough after opening history" }
    )
    .toBeGreaterThan(280);

  await expect
    .poll(
      async () =>
        (await page.locator(".chat-composer").boundingBox())?.width ?? 0,
      { message: "1600 desktop composer should not collapse when history opens" }
    )
    .toBeGreaterThanOrEqual(260);
});

test("desktop 1600 history stays inside the input rail", async ({ page }) => {
  await openWorkspaceAt(page, { width: 1600, height: 900 });
  await page.getByTestId("history-toggle-button").click();
  await expect(page.getByTestId("conversation-sidebar")).toBeVisible();

  const { inputWidth, sidebarWidth } = await page.evaluate(() => ({
    inputWidth:
      document.querySelector("[data-testid='studio-input-rail']")?.getBoundingClientRect()
        .width ?? 0,
    sidebarWidth:
      document.querySelector("[data-testid='conversation-sidebar']")?.getBoundingClientRect()
        .width ?? 0
  }));

  expect(sidebarWidth).toBeGreaterThanOrEqual(220);
  expect(sidebarWidth).toBeLessThan(inputWidth - 120);
});

test("desktop empty state centers guidance and seeds the composer from templates", async ({
  page
}) => {
  await openWorkspaceAt(page, { width: 2560, height: 1440 });

  const emptyCard = page.getByTestId("chat-empty-card");
  await expect(emptyCard).toBeVisible();

  const { containerCenter, cardCenter } = await page.evaluate(() => {
    const container = document
      .querySelector(".studio-result-rail .chat-messages")
      ?.getBoundingClientRect();
    const card = document.querySelector("[data-testid='chat-empty-card']")?.getBoundingClientRect();
    return {
      containerCenter: container ? container.y + container.height / 2 : 0,
      cardCenter: card ? card.y + card.height / 2 : 0
    };
  });

  expect(Math.abs(containerCenter - cardCenter)).toBeLessThanOrEqual(220);
  await expect(page.getByTestId("chat-empty-template-button")).toHaveCount(3);

  await emptyCard.getByRole("button", { name: "画圆" }).click();
  await expect(page.getByTestId("chat-composer-input")).toHaveValue(
    "过点A为圆心，半径为3作圆。"
  );
});

test("ultrawide chat rail uses a readable width", async ({ page }) => {
  await openWorkspaceAt(page, { width: 2560, height: 1440 });
  await expect(page.locator("[data-panel='chat']")).toBeVisible();
  await expect(page.getByTestId("chat-empty-card")).toBeVisible();

  const { inputWidth, chatWidth, composerWidth, emptyCardWidth } = await page.evaluate(() => ({
    inputWidth:
      document.querySelector("[data-testid='studio-input-rail']")?.getBoundingClientRect()
        .width ?? 0,
    chatWidth:
      document.querySelector("[data-panel='chat']")?.getBoundingClientRect().width ?? 0,
    composerWidth:
      document.querySelector(".chat-composer")?.getBoundingClientRect().width ?? 0,
    emptyCardWidth:
      document
        .querySelector("[data-testid='chat-empty-card']")
        ?.getBoundingClientRect().width ?? 0
  }));

  expect(inputWidth).toBeGreaterThanOrEqual(640);
  expect(chatWidth).toBeGreaterThanOrEqual(300);
  expect(composerWidth).toBeGreaterThanOrEqual(560);
  expect(emptyCardWidth).toBeGreaterThanOrEqual(320);
});

test("ultrawide settings drawer uses a readable content width", async ({
  page
}) => {
  await openWorkspaceAt(page, { width: 2560, height: 1440 });
  await page.getByRole("button", { name: "设置" }).first().click();

  const { drawerWidth, contentWidth } = await page.evaluate(() => ({
    drawerWidth:
      document.querySelector(".settings-drawer")?.getBoundingClientRect().width ?? 0,
    contentWidth:
      document.querySelector(".settings-content")?.getBoundingClientRect().width ?? 0
  }));

  expect(drawerWidth).toBeGreaterThanOrEqual(640);
  expect(contentWidth).toBeGreaterThanOrEqual(380);
});

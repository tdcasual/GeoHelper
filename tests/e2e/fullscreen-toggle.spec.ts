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

test("desktop exposes a fullscreen control and toggles fullscreen mode", async ({
  page
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("http://localhost:5173");

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


test("near-breakpoint desktop keeps chat usable when history opens", async ({
  page
}) => {
  await page.setViewportSize({ width: 901, height: 600 });
  await page.goto("http://localhost:5173");

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

test("compact landscape top bar stays compact on short viewports", async ({
  page
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("http://localhost:5173");

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

test("short landscape chat preserves message room above the composer", async ({
  page
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("http://localhost:5173");
  await page.getByTestId("mobile-surface-chat").click();

  const { messagesHeight, composerHeight } = await page.evaluate(() => ({
    messagesHeight:
      document.querySelector(".chat-messages")?.getBoundingClientRect().height ?? 0,
    composerHeight:
      document.querySelector(".chat-composer")?.getBoundingClientRect().height ?? 0
  }));

  expect(messagesHeight).toBeGreaterThanOrEqual(100);
  expect(composerHeight).toBeLessThanOrEqual(150);
});

test("desktop 1600 keeps chat readable when history opens", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("http://localhost:5173");

  const chatBody = page.locator(".chat-body");
  const widthBefore = (await chatBody.boundingBox())?.width ?? 0;
  expect(widthBefore).toBeGreaterThan(480);

  await page.getByTestId("history-toggle-button").click();
  await expect(page.getByTestId("conversation-sidebar")).toBeVisible();

  await expect
    .poll(
      async () => (await chatBody.boundingBox())?.width ?? 0,
      { message: "1600 desktop chat body should stay wide enough after opening history" }
    )
    .toBeGreaterThan(widthBefore - 60);

  await expect
    .poll(
      async () =>
        (await page.locator(".chat-composer").boundingBox())?.width ?? 0,
      { message: "1600 desktop composer should not collapse when history opens" }
    )
    .toBeGreaterThanOrEqual(450);
});


test("desktop 1600 history expands into a full overlay rail", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("http://localhost:5173");
  await page.getByTestId("history-toggle-button").click();
  await expect(page.getByTestId("conversation-sidebar")).toBeVisible();

  const { chatWidth, sidebarWidth } = await page.evaluate(() => ({
    chatWidth:
      document.querySelector("[data-panel='chat']")?.getBoundingClientRect().width ?? 0,
    sidebarWidth:
      document.querySelector("[data-testid='conversation-sidebar']")?.getBoundingClientRect()
        .width ?? 0
  }));

  expect(sidebarWidth).toBeGreaterThanOrEqual(chatWidth - 60);
});

test("desktop empty state centers guidance and seeds the composer from templates", async ({
  page
}) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto("http://localhost:5173");

  const emptyCard = page.getByTestId("chat-empty-card");
  await expect(emptyCard).toBeVisible();

  const { containerCenter, cardCenter } = await page.evaluate(() => {
    const container = document.querySelector(".chat-messages")?.getBoundingClientRect();
    const card = document.querySelector("[data-testid='chat-empty-card']")?.getBoundingClientRect();
    return {
      containerCenter: container ? container.y + container.height / 2 : 0,
      cardCenter: card ? card.y + card.height / 2 : 0
    };
  });

  expect(Math.abs(containerCenter - cardCenter)).toBeLessThanOrEqual(180);
  await expect(page.getByTestId("chat-empty-template-button")).toHaveCount(3);

  await emptyCard.getByRole("button", { name: "画圆" }).click();
  await expect(page.getByTestId("chat-composer-input")).toHaveValue(
    "过点A为圆心，半径为3作圆。"
  );
});

test("ultrawide chat rail uses a readable width", async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto("http://localhost:5173");
  await expect(page.locator("[data-panel='chat']")).toBeVisible();
  await expect(page.getByTestId("chat-empty-card")).toBeVisible();

  const { chatWidth, composerWidth, emptyCardWidth } = await page.evaluate(() => ({
    chatWidth:
      document.querySelector("[data-panel='chat']")?.getBoundingClientRect().width ?? 0,
    composerWidth:
      document.querySelector(".chat-composer")?.getBoundingClientRect().width ?? 0,
    emptyCardWidth:
      document
        .querySelector("[data-testid='chat-empty-card']")
        ?.getBoundingClientRect().width ?? 0
  }));

  expect(chatWidth).toBeGreaterThanOrEqual(640);
  expect(composerWidth).toBeGreaterThanOrEqual(600);
  expect(emptyCardWidth).toBeGreaterThanOrEqual(500);
});

test("ultrawide settings drawer uses a readable content width", async ({
  page
}) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto("http://localhost:5173");
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

test("short landscape history sheet expands into a full modal layer", async ({
  page
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("http://localhost:5173");
  await page.getByTestId("mobile-surface-chat").click();
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

test("compact empty state keeps template shortcuts available", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:5173");
  await page.getByTestId("mobile-surface-chat").click();

  await expect(page.getByTestId("chat-empty-template-button")).toHaveCount(2);

  await page.getByTestId("chat-empty-template-button").first().click();
  await expect(page.getByTestId("chat-composer-input")).not.toHaveValue("");
});


test("short landscape compact empty state stays visually centered", async ({
  page
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("http://localhost:5173");
  await page.getByTestId("mobile-surface-chat").click();
  await expect(page.getByTestId("chat-empty-compact")).toBeVisible();

  const { viewportCenter, emptyCenter } = await page.evaluate(() => {
    const rect = document
      .querySelector("[data-testid='chat-empty-compact']")
      ?.getBoundingClientRect();
    return {
      viewportCenter: window.innerWidth / 2,
      emptyCenter: rect ? rect.x + rect.width / 2 : 0
    };
  });

  expect(Math.abs(viewportCenter - emptyCenter)).toBeLessThanOrEqual(80);
});

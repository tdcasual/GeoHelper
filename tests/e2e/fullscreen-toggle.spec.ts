import { expect, test } from "@playwright/test";

test("desktop toggles chat without pushing the panel offscreen", async ({
  page
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();

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
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();

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
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();

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
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();

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
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();

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

test("mobile canvas dedicates most of the host height to the graphics view", async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();

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
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();

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
  await page.addInitScript(() => {
    let fullscreenElement: Element | null = null;

    Object.defineProperty(Document.prototype, "fullscreenElement", {
      configurable: true,
      get() {
        return fullscreenElement;
      }
    });

    Object.defineProperty(Document.prototype, "fullscreenEnabled", {
      configurable: true,
      get() {
        return true;
      }
    });

    Element.prototype.requestFullscreen = async function requestFullscreen() {
      fullscreenElement = this;
      document.dispatchEvent(new Event("fullscreenchange"));
    };

    Document.prototype.exitFullscreen = async function exitFullscreen() {
      fullscreenElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    };
  });

  const rotateViewport = async (width: number, height: number) => {
    await page.setViewportSize({ width, height });
  };

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();

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
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();

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
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();
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
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();
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
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();

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
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();

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
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();

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

test("compact landscape top bar stays compact on short viewports", async ({
  page
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();

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
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();
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
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();

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
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();
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
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();

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
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();
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
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();
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
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();
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
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();
  await page.getByTestId("mobile-surface-chat").click();

  await page.getByTestId("mobile-more-button").click();
  await expect(page.getByTestId("mobile-overflow-menu")).toBeVisible();

  await page.mouse.click(40, 220);
  await expect(page.getByTestId("mobile-overflow-menu")).toBeHidden();
});

test("mobile plus menu closes when leaving the chat surface", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();
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
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();
  await page.getByTestId("mobile-surface-chat").click();

  await expect(page.getByTestId("chat-empty-template-button")).toHaveCount(2);

  await page.getByTestId("chat-empty-template-button").first().click();
  await expect(page.getByTestId("chat-composer-input")).not.toHaveValue("");
});

test("compact portrait empty state stays vertically centered in chat surface", async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();
  await page.getByTestId("mobile-surface-chat").click();
  await expect(page.getByTestId("chat-empty-compact")).toBeVisible();

  const { emptyCenter, messagesCenter } = await page.evaluate(() => {
    const emptyRect = document
      .querySelector("[data-testid='chat-empty-compact']")
      ?.getBoundingClientRect();
    const messagesRect = document.querySelector(".chat-messages")?.getBoundingClientRect();
    return {
      emptyCenter: emptyRect ? emptyRect.y + emptyRect.height / 2 : 0,
      messagesCenter: messagesRect ? messagesRect.y + messagesRect.height / 2 : 0
    };
  });

  expect(Math.abs(messagesCenter - emptyCenter)).toBeLessThanOrEqual(80);
});

test("short landscape compact empty state stays visually centered", async ({
  page
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();
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


test("short landscape plus menu keeps message area usable", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();
  await page.getByTestId("mobile-surface-chat").click();

  await page.getByTestId("plus-menu-button").click();
  await expect(page.getByTestId("plus-menu")).toBeVisible();

  const { messagesHeight, composerBottom, viewportHeight } = await page.evaluate(() => ({
    messagesHeight:
      document.querySelector(".chat-messages")?.getBoundingClientRect().height ?? 0,
    composerBottom:
      document.querySelector(".chat-composer")?.getBoundingClientRect().bottom ?? 0,
    viewportHeight: window.innerHeight
  }));

  expect(messagesHeight).toBeGreaterThanOrEqual(80);
  expect(composerBottom).toBeLessThanOrEqual(viewportHeight);
});

test("short landscape slash menu stays within viewport and preserves messages", async ({
  page
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();
  await page.getByTestId("mobile-surface-chat").click();
  await page.getByTestId("chat-composer-input").fill("/");
  await expect(page.getByTestId("slash-command-menu")).toBeVisible();

  const { messagesHeight, composerBottom, viewportHeight, slashHeight } = await page.evaluate(() => ({
    messagesHeight:
      document.querySelector(".chat-messages")?.getBoundingClientRect().height ?? 0,
    composerBottom:
      document.querySelector(".chat-composer")?.getBoundingClientRect().bottom ?? 0,
    viewportHeight: window.innerHeight,
    slashHeight:
      document.querySelector("[data-testid='slash-command-menu']")?.getBoundingClientRect()
        .height ?? 0
  }));

  expect(messagesHeight).toBeGreaterThanOrEqual(56);
  expect(composerBottom).toBeLessThanOrEqual(viewportHeight);
  expect(slashHeight).toBeLessThanOrEqual(96);
});


test("long assistant token wraps inside compact mobile chat bubble", async ({
  page
}) => {
  const longAssistantToken = `GeoGebra_${"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".repeat(180)}`;

  await page.addInitScript((snapshot) => {
    localStorage.setItem("geohelper.chat.snapshot", JSON.stringify(snapshot));
  }, {
    mode: "byok",
    sessionToken: null,
    activeConversationId: "conv_long_token",
    reauthRequired: false,
    messages: [
      {
        id: "assistant_long_token",
        role: "assistant",
        content: longAssistantToken
      }
    ],
    conversations: [
      {
        id: "conv_long_token",
        title: "long token",
        createdAt: 1,
        updatedAt: 1,
        messages: [
          {
            id: "assistant_long_token",
            role: "assistant",
            content: longAssistantToken
          }
        ]
      }
    ]
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();
  await page.getByTestId("mobile-surface-chat").click();
  await expect(page.locator(".chat-message-assistant")).toBeVisible();

  const metrics = await page.evaluate(() => {
    const bubble = document.querySelector(".chat-message-assistant") as HTMLElement | null;
    const body = bubble?.querySelector("div") as HTMLElement | null;
    return {
      bubbleScrollWidth: bubble?.scrollWidth ?? 0,
      bubbleClientWidth: bubble?.clientWidth ?? 0,
      bodyScrollWidth: body?.scrollWidth ?? 0,
      bodyClientWidth: body?.clientWidth ?? 0,
      documentScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    };
  });

  expect(metrics.bubbleScrollWidth).toBeLessThanOrEqual(metrics.bubbleClientWidth + 1);
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.bodyClientWidth + 1);
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
});


test("short landscape long chat keeps composer compact and message viewport readable", async ({
  page
}) => {
  const makeLongText = (label: string, repeat = 12) =>
    `${label} ${Array.from({ length: repeat }, (_, index) => `第${index + 1}段内容用于测试滚动与换行表现`).join("，")}`;
  const makeLongToken = (prefix: string, repeat = 18) =>
    `${prefix}_${"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".repeat(repeat)}`;

  const assistantMessage = {
    id: "assistant_long_chat",
    role: "assistant",
    content:
      makeLongText("已为你生成草图，同时补充一段超长不可断行 token 用于测试", 10) +
      "\n" +
      makeLongToken("UNBROKEN", 18),
    traceId: "trace-long-chat",
    agentSteps: [
      {
        name: "analysis-and-normalization-step-with-very-long-name-to-test-grid-wrapping-behavior-in-mobile-layout",
        status: "ok",
        duration_ms: 1380
      },
      {
        name: "constraint-solver-and-geo-construction-planning-step-with-very-long-name",
        status: "fallback",
        duration_ms: 2840
      },
      {
        name: "render-command-generation-step-with-additional-context-and-metadata",
        status: "error",
        duration_ms: 5120
      }
    ]
  };

  await page.addInitScript((snapshot) => {
    localStorage.setItem("geohelper.chat.snapshot", JSON.stringify(snapshot));
  }, {
    mode: "byok",
    sessionToken: null,
    activeConversationId: "conv_long_landscape",
    reauthRequired: false,
    messages: [
      {
        id: "user_long_chat",
        role: "user",
        content: makeLongText("请根据如下条件绘制几何对象，并给出逐步解释", 12)
      },
      assistantMessage
    ],
    conversations: [
      {
        id: "conv_long_landscape",
        title: "long chat",
        createdAt: 1,
        updatedAt: 1,
        messages: [
          {
            id: "user_long_chat",
            role: "user",
            content: makeLongText("请根据如下条件绘制几何对象，并给出逐步解释", 12)
          },
          assistantMessage
        ]
      }
    ]
  });

  await page.setViewportSize({ width: 740, height: 360 });
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();
  await page.getByTestId("mobile-surface-chat").click();
  await expect(page.locator(".chat-message-assistant")).toBeVisible();

  const metrics = await page.evaluate(() => {
    const messages = document.querySelector(".chat-messages") as HTMLElement | null;
    const composer = document.querySelector(".chat-composer") as HTMLElement | null;
    const shell = document.querySelector("[data-testid='chat-composer-shell']") as HTMLElement | null;
    const submit = shell?.querySelector("button[type='submit']") as HTMLElement | null;
    return {
      messagesHeight: messages?.getBoundingClientRect().height ?? 0,
      composerHeight: composer?.getBoundingClientRect().height ?? 0,
      shellHeight: shell?.getBoundingClientRect().height ?? 0,
      shellWidth: shell?.getBoundingClientRect().width ?? 0,
      submitWidth: submit?.getBoundingClientRect().width ?? 0
    };
  });

  expect(metrics.messagesHeight).toBeGreaterThanOrEqual(120);
  expect(metrics.composerHeight).toBeLessThanOrEqual(80);
  expect(metrics.shellHeight).toBeLessThanOrEqual(80);
  expect(metrics.submitWidth).toBeLessThanOrEqual(metrics.shellWidth / 2);
});

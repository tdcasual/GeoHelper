import { expect, test } from "@playwright/test";

test("desktop workspace uses a left canvas and right dialog rail", async ({
  page
}) => {
  await page.setViewportSize({ width: 1600, height: 960 });
  await page.goto("/");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();

  const canvas = page.locator("[data-panel='canvas']");
  const dialogRail = page.getByTestId("workspace-dialog-rail");
  const conversationSidebar = page.getByTestId("conversation-sidebar");
  const historyToggle = page.getByTestId("history-toggle-button");
  const resultPanel = page.getByTestId("studio-result-panel");
  const composer = page.locator(".chat-composer");

  await expect(canvas).toBeVisible();
  await expect(dialogRail).toBeVisible();
  await expect(historyToggle).toBeVisible();
  await expect(resultPanel).toBeVisible();
  await expect(composer).toBeVisible();

  const canvasBoxBeforeToggle = await canvas.boundingBox();
  const dialogBoxBeforeToggle = await dialogRail.boundingBox();

  await historyToggle.click();
  await expect(conversationSidebar).toBeVisible();

  const canvasBox = await canvas.boundingBox();
  const dialogBox = await dialogRail.boundingBox();
  const sidebarBox = await conversationSidebar.boundingBox();

  expect(canvasBoxBeforeToggle).not.toBeNull();
  expect(dialogBoxBeforeToggle).not.toBeNull();
  expect(canvasBox).not.toBeNull();
  expect(dialogBox).not.toBeNull();
  expect(sidebarBox).not.toBeNull();

  if (
    !canvasBoxBeforeToggle ||
    !dialogBoxBeforeToggle ||
    !canvasBox ||
    !dialogBox ||
    !sidebarBox
  ) {
    return;
  }

  expect(canvasBox.x).toBeLessThan(dialogBox.x);
  expect(canvasBox.width).toBeGreaterThan(dialogBox.width);
  expect(Math.abs(canvasBox.width - canvasBoxBeforeToggle.width)).toBeLessThanOrEqual(
    4
  );
  expect(Math.abs(dialogBox.width - dialogBoxBeforeToggle.width)).toBeLessThanOrEqual(
    4
  );
  expect(sidebarBox.x).toBeGreaterThanOrEqual(dialogBox.x);
  expect(sidebarBox.width).toBeLessThan(dialogBox.width);

  const dialogRailSurface = await dialogRail.evaluate((node) => {
    const styles = window.getComputedStyle(node);
    return {
      backgroundImage: styles.backgroundImage,
      borderLeftWidth: styles.borderLeftWidth
    };
  });
  const canvasSurface = await page.locator(".geogebra-host").evaluate((node) => {
    const styles = window.getComputedStyle(node);
    return {
      borderRadius: styles.borderTopLeftRadius,
      boxShadow: styles.boxShadow
    };
  });

  expect(dialogRailSurface.backgroundImage).toContain("linear-gradient");
  expect(parseFloat(canvasSurface.borderRadius)).toBeGreaterThanOrEqual(20);
  expect(canvasSurface.boxShadow).not.toBe("none");
});

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

  await historyToggle.click();
  await expect(conversationSidebar).toBeVisible();

  const canvasBox = await canvas.boundingBox();
  const dialogBox = await dialogRail.boundingBox();

  expect(canvasBox).not.toBeNull();
  expect(dialogBox).not.toBeNull();

  if (!canvasBox || !dialogBox) {
    return;
  }

  expect(canvasBox.x).toBeLessThan(dialogBox.x);
  expect(canvasBox.width).toBeGreaterThan(dialogBox.width);

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
  expect(parseFloat(dialogRailSurface.borderLeftWidth)).toBeGreaterThanOrEqual(1);
  expect(parseFloat(canvasSurface.borderRadius)).toBeGreaterThanOrEqual(20);
  expect(canvasSurface.boxShadow).not.toBe("none");
});

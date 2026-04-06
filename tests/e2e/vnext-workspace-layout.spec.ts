import { expect, test } from "@playwright/test";

test("desktop workspace uses a left input rail, center canvas, and right result rail", async ({
  page
}) => {
  await page.setViewportSize({ width: 1600, height: 960 });
  await page.goto("/");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();

  const inputRail = page.getByTestId("studio-input-rail");
  const canvas = page.locator("[data-panel='canvas']");
  const resultRail = page.getByTestId("studio-result-rail");

  await expect(inputRail).toBeVisible();
  await expect(canvas).toBeVisible();
  await expect(resultRail).toBeVisible();

  const inputBox = await inputRail.boundingBox();
  const canvasBox = await canvas.boundingBox();
  const resultBox = await resultRail.boundingBox();

  expect(inputBox).not.toBeNull();
  expect(canvasBox).not.toBeNull();
  expect(resultBox).not.toBeNull();

  if (!inputBox || !canvasBox || !resultBox) {
    return;
  }

  expect(inputBox.x).toBeLessThan(canvasBox.x);
  expect(canvasBox.x).toBeLessThan(resultBox.x);
  expect(canvasBox.width).toBeGreaterThan(inputBox.width);
  expect(canvasBox.width).toBeGreaterThan(resultBox.width);

  const inputRailSurface = await inputRail.evaluate((node) => {
    const styles = window.getComputedStyle(node);
    return {
      backgroundImage: styles.backgroundImage,
      borderRightWidth: styles.borderRightWidth
    };
  });
  const resultRailSurface = await resultRail.evaluate((node) => {
    const styles = window.getComputedStyle(node);
    return {
      backgroundImage: styles.backgroundImage
    };
  });
  const canvasSurface = await page.locator(".geogebra-host").evaluate((node) => {
    const styles = window.getComputedStyle(node);
    return {
      borderRadius: styles.borderTopLeftRadius,
      boxShadow: styles.boxShadow
    };
  });

  expect(inputRailSurface.backgroundImage).toContain("linear-gradient");
  expect(parseFloat(inputRailSurface.borderRightWidth)).toBeGreaterThanOrEqual(1);
  expect(resultRailSurface.backgroundImage).toContain("linear-gradient");
  expect(parseFloat(canvasSurface.borderRadius)).toBeGreaterThanOrEqual(20);
  expect(canvasSurface.boxShadow).not.toBe("none");
});

import { expect, test } from "@playwright/test";

test("homepage frames GeoHelper as a teacher-first diagram studio", async ({
  page
}) => {
  await page.setViewportSize({ width: 1600, height: 960 });
  await page.goto("http://localhost:5173");

  await expect(page.getByTestId("studio-homepage")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "把题目变成可编辑几何图" })
  ).toBeVisible();
  await expect(
    page.getByText("适合备课、讲题、改题，生成后可继续拖拽与标注")
  ).toBeVisible();

  await expect(page.getByTestId("studio-image-dropzone")).toContainText("拖入题目截图");
  await expect(page.getByTestId("studio-image-dropzone")).toContainText("粘贴图片");
  await expect(page.getByTestId("studio-text-entry")).toBeVisible();

  await expect(
    page.getByRole("button", { name: "开始生成图形", exact: true })
  ).toBeVisible();
  await expect(page.getByText("开始聊天")).toHaveCount(0);

  const seeds = page.getByTestId("teacher-scenario-seed");
  await expect(seeds).toHaveCount(3);

  const mainBox = await page.locator(".studio-homepage-main").boundingBox();
  const scenarioBox = await page.locator(".studio-homepage-scenarios").boundingBox();
  expect(mainBox).not.toBeNull();
  expect(scenarioBox).not.toBeNull();
  if (mainBox && scenarioBox) {
    expect(mainBox.width).toBeGreaterThan(scenarioBox.width);
  }

  const homepageSurface = await page.locator(".studio-homepage-main").evaluate((node) => {
    const styles = window.getComputedStyle(node);
    return {
      backgroundImage: styles.backgroundImage,
      borderRadius: styles.borderTopLeftRadius,
      boxShadow: styles.boxShadow
    };
  });
  expect(homepageSurface.backgroundImage).toContain("linear-gradient");
  expect(parseFloat(homepageSurface.borderRadius)).toBeGreaterThanOrEqual(20);
  expect(homepageSurface.boxShadow).not.toBe("none");
});

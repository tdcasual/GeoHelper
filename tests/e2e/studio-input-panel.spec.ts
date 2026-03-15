import { expect, test } from "@playwright/test";

test("studio input rail exposes image, text, and continue modes without regressing the composer", async ({
  page
}) => {
  await page.setViewportSize({ width: 1600, height: 960 });
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();

  const inputRail = page.getByTestId("studio-input-rail");
  await expect(inputRail).toBeVisible();

  await expect(page.getByTestId("studio-input-mode-image")).toBeVisible();
  await expect(page.getByTestId("studio-input-mode-text")).toBeVisible();
  await expect(page.getByTestId("studio-input-mode-continue")).toBeVisible();

  await expect(page.getByTestId("studio-image-mode-panel")).toContainText("拖入题目截图");

  await page.getByTestId("studio-input-mode-text").click();
  await expect(page.getByTestId("studio-text-mode-panel")).toBeVisible();
  await expect(page.getByTestId("chat-composer-input")).toBeVisible();

  await page.getByTestId("studio-input-mode-continue").click();
  await expect(page.getByTestId("studio-continue-mode-panel")).toContainText("最近输入");
});

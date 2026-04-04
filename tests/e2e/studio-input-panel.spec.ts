import { expect, test } from "@playwright/test";

test("studio input rail exposes image, text, and continue modes without regressing the composer", async ({
  page
}) => {
  await page.setViewportSize({ width: 1600, height: 960 });
  await page.goto("/");
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
  const continuePanel = page.getByTestId("studio-continue-panel");
  await expect(continuePanel).toBeVisible();
  await expect(continuePanel).toContainText("继续当前画稿");
  await expect(continuePanel).toContainText("新会话");
  await expect(continuePanel.getByRole("button", { name: "画圆" })).toBeVisible();

  await continuePanel.getByRole("button", { name: "画圆" }).click();
  await expect(page.getByTestId("chat-composer-input")).toHaveValue(
    "过点A为圆心，半径为3作圆。"
  );
});

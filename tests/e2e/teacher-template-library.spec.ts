import { expect, test } from "@playwright/test";

test("teacher template library is reachable from homepage and the input rail", async ({
  page
}) => {
  await page.setViewportSize({ width: 1600, height: 960 });
  await page.goto("/");

  await page.getByRole("button", { name: "进入模板库", exact: true }).click();
  const library = page.getByTestId("teacher-template-library");
  await expect(library).toBeVisible();

  await library.getByRole("button", { name: "画圆", exact: true }).click();
  await expect(page.getByTestId("chat-composer-input")).toHaveValue(
    "过点A为圆心，半径为3作圆。"
  );

  await page.getByTestId("teacher-template-library-close").click();
  await expect(library).toBeHidden();

  await page.getByTestId("studio-input-mode-continue").click();
  await page.getByRole("button", { name: "打开模板库", exact: true }).click();
  await expect(library).toBeVisible();
});

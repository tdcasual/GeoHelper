import { expect, test } from "@playwright/test";

test("send message appends assistant reply", async ({ page }) => {
  await page.goto("http://localhost:5173");
  await page.getByPlaceholder("例如：过点A和B作垂直平分线").fill("画一个圆");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(
    page.getByText(/已生成\s+\d+\s+条指令|生成失败，请重试/)
  ).toBeVisible();
});

import { expect, test } from "@playwright/test";

test("chat panel can be hidden and canvas becomes full screen", async ({
  page
}) => {
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "Hide Chat" }).click();
  await expect(page.locator("[data-panel='chat']")).toBeHidden();
});

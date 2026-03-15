import { expect, test } from "@playwright/test";

const openWorkspace = async (page: import("@playwright/test").Page) => {
  await page.goto("/");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();
};

test("renders GeoGebra without any geogebra.org network access", async ({
  page
}) => {
  await page.route("**://www.geogebra.org/**", (route) => route.abort());
  await openWorkspace(page);

  await expect(page.getByTestId("geogebra-host")).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const host = document.querySelector("[data-testid='geogebra-host']");
        if (!host) {
          return 0;
        }

        return host.getBoundingClientRect().height;
      })
    )
    .toBeGreaterThan(400);

  const resourceNames = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => name.includes("geogebra.org"))
  );

  expect(resourceNames).toEqual([]);
});

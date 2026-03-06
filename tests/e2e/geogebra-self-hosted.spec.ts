import { expect, test } from "@playwright/test";

test("renders GeoGebra without any geogebra.org network access", async ({
  page
}) => {
  await page.route("**://www.geogebra.org/**", (route) => route.abort());
  await page.goto("/");

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const applet = document.querySelector("#ggbApplet");
        if (!applet) {
          return 0;
        }

        return applet.getBoundingClientRect().height;
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

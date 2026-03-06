import { expect, test } from "@playwright/test";

test("mounts GeoGebra applet when GGBApplet is available", async ({ page }) => {
  await page.route("**/vendor/geogebra/manifest.json", (route) =>
    route.fulfill({
      json: {
        deployScriptPath: "/vendor/geogebra/current/deployggb.js",
        html5CodebasePath: "/vendor/geogebra/current/HTML5/5.0/web3d/"
      }
    })
  );

  await page.route("**/vendor/geogebra/current/deployggb.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: ""
    })
  );

  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).GGBApplet = function () {
      return {
        inject: (containerId: string) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).__geohelperGgbInjectedTo = containerId;
        },
        setHTML5Codebase: (codebase: string) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).__geohelperGgbCodebase = codebase;
        },
        getAppletObject: () => ({
          evalCommand: () => undefined,
          setValue: () => undefined
        })
      };
    };
  });

  await page.goto("http://localhost:5173");
  await expect(page.locator("[data-testid='geogebra-host']")).toBeVisible();

  await expect
    .poll(
      () =>
        page.evaluate(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          () => (window as any).__geohelperGgbInjectedTo
        ),
      { message: "GeoGebra applet should inject into the container" }
    )
    .toBe("geogebra-container");

  await expect
    .poll(
      () =>
        page.evaluate(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          () => (window as any).__geohelperGgbCodebase
        ),
      { message: "GeoGebra applet should receive the local codebase path" }
    )
    .toContain("/vendor/geogebra/current/HTML5/5.0/web3d/");
});

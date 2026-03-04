import { expect, test } from "@playwright/test";

test("mounts GeoGebra applet when GGBApplet is available", async ({ page }) => {
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).GGBApplet = function () {
      return {
        inject: (containerId: string) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).__geohelperGgbInjectedTo = containerId;
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

  const injectedTo = await page.evaluate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => (window as any).__geohelperGgbInjectedTo
  );
  expect(injectedTo).toBe("geogebra-container");
});

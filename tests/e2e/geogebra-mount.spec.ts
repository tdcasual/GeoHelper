import { expect, test } from "@playwright/test";

const mockGeoGebraRuntime = async (page: import("@playwright/test").Page) => {
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
    (window as any).__geohelperGgbSizeCalls = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__geohelperGgbRecalculateCount = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__geohelperGgbInjectedTo = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__geohelperGgbParamsHistory = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).GGBApplet = function (params: Record<string, unknown>) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__geohelperGgbParams = params;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__geohelperGgbParamsHistory.push(params);

      const appletObject = {
        evalCommand: () => undefined,
        setValue: () => undefined,
        setSize: (width: number, height: number) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).__geohelperGgbSizeCalls.push({ width, height });
        },
        recalculateEnvironments: () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).__geohelperGgbRecalculateCount += 1;
        }
      };

      return {
        inject: (containerId: string) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).__geohelperGgbInjectedTo.push(containerId);
        },
        setHTML5Codebase: (codebase: string) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).__geohelperGgbCodebase = codebase;
        },
        getAppletObject: () => appletObject
      };
    };
  });
};

test("mounts GeoGebra applet when GGBApplet is available", async ({ page }) => {
  await mockGeoGebraRuntime(page);

  await page.goto("http://localhost:5173");
  await expect(page.locator("[data-testid='geogebra-host']")).toBeVisible();

  await expect
    .poll(
      () =>
        page.evaluate(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          () => ((window as any).__geohelperGgbInjectedTo as string[])[0]
        ),
      { message: "GeoGebra applet should inject into the container" }
    )
    .toBe("geogebra-container");

  await expect
    .poll(
      () =>
        page.evaluate(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          () => (window as any).__geohelperGgbParams
        ),
      { message: "GeoGebra applet should enable menu and fullscreen controls" }
    )
    .toMatchObject({
      showMenuBar: true,
      showFullscreenButton: true,
      showAlgebraInput: true
    });

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

  await expect
    .poll(
      () =>
        page.evaluate(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          () => ((window as any).__geohelperGgbSizeCalls as Array<unknown>).length
        ),
      { message: "GeoGebra applet should sync to the initial host size" }
    )
    .toBeGreaterThan(0);

  const widthBeforeResize = await page.evaluate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => (window as any).__geohelperGgbSizeCalls.at(-1)?.width ?? 0
  );

  await page.setViewportSize({ width: 1600, height: 900 });

  await expect
    .poll(
      () =>
        page.evaluate(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          () => (window as any).__geohelperGgbSizeCalls.at(-1)?.width ?? 0
        ),
      { message: "GeoGebra applet should resize when the viewport grows" }
    )
    .toBeGreaterThan(widthBeforeResize);

  const widthBeforeChatCollapse = await page.evaluate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => (window as any).__geohelperGgbSizeCalls.at(-1)?.width ?? 0
  );

  await page.getByRole("button", { name: "收起对话" }).click();

  await expect
    .poll(
      () =>
        page.evaluate(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          () => (window as any).__geohelperGgbSizeCalls.at(-1)?.width ?? 0
        ),
      {
        message:
          "GeoGebra applet should resize when the chat panel is collapsed"
      }
    )
    .toBeGreaterThan(widthBeforeChatCollapse);

  await expect
    .poll(
      () =>
        page.evaluate(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          () => (window as any).__geohelperGgbRecalculateCount
        ),
      { message: "GeoGebra applet should recalculate after host size changes" }
    )
    .toBeGreaterThan(0);
});

test("re-mounts GeoGebra with a compact mobile profile after viewport mode changes", async ({
  page
}) => {
  await mockGeoGebraRuntime(page);

  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("http://localhost:5173");

  await expect
    .poll(
      () =>
        page.evaluate(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          () => ((window as any).__geohelperGgbParamsHistory as Array<unknown>).length
        )
    )
    .toBe(1);

  await page.setViewportSize({ width: 390, height: 844 });

  await expect
    .poll(
      () =>
        page.evaluate(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          () => ((window as any).__geohelperGgbParamsHistory as Array<unknown>).length
        ),
      { message: "viewport profile change should trigger a fresh applet mount" }
    )
    .toBeGreaterThan(1);

  await expect
    .poll(
      () =>
        page.evaluate(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          () => (window as any).__geohelperGgbParamsHistory.at(-1)
        )
    )
    .toMatchObject({
      showMenuBar: false,
      showAlgebraInput: false,
      showToolBarHelp: false,
      showFullscreenButton: true
    });
});

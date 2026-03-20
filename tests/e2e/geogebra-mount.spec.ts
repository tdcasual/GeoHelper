import { expect, test } from "@playwright/test";

import { openWorkspace } from "./fullscreen-toggle.test-helpers";
import { mockGeoGebraRuntime } from "./geogebra.test-helpers";

test("mounts GeoGebra applet when GGBApplet is available", async ({ page }) => {
  await mockGeoGebraRuntime(page);

  await openWorkspace(page);
  await expect(page.locator("[data-testid='geogebra-host']")).toBeVisible();

  await expect
    .poll(
      () =>
        page.evaluate(

          () => ((window as any).__geohelperGgbInjectedTo as string[])[0]
        ),
      { message: "GeoGebra applet should inject into the container" }
    )
    .toBe("geogebra-container");

  await expect
    .poll(
      () =>
        page.evaluate(

          () => typeof (window as any).__geohelperGgbParams?.appletOnLoad
        ),
      { message: "GeoGebra applet should pass an appletOnLoad callback" }
    )
    .toBe("function");

  await expect
    .poll(
      () =>
        page.evaluate(

          () => (window as any).__geohelperGgbAppletOnLoadCalls
        ),
      { message: "GeoGebra applet should finish mount through appletOnLoad" }
    )
    .toBeGreaterThan(0);

  await expect
    .poll(
      () =>
        page.evaluate(

          () => (window as any).__geohelperGgbParams
        ),
      { message: "GeoGebra applet should enable menu and fullscreen controls" }
    )
    .toMatchObject({
      appName: "classic",
      preventFocus: true,
      showMenuBar: true,
      showFullscreenButton: true,
      showAlgebraInput: true
    });

  await expect
    .poll(
      () =>
        page.evaluate(

          () => (window as any).__geohelperGgbCodebase
        ),
      { message: "GeoGebra applet should receive the local codebase path" }
    )
    .toContain("/vendor/geogebra/current/HTML5/5.0/web3d/");

  await expect
    .poll(
      () =>
        page.evaluate(

          () => ((window as any).__geohelperGgbSizeCalls as Array<unknown>).length
        ),
      { message: "GeoGebra applet should sync to the initial host size" }
    )
    .toBeGreaterThan(0);

  const widthBeforeResize = await page.evaluate(

    () => (window as any).__geohelperGgbSizeCalls.at(-1)?.width ?? 0
  );

  await page.setViewportSize({ width: 1600, height: 900 });

  await expect
    .poll(
      () =>
        page.evaluate(

          () => (window as any).__geohelperGgbSizeCalls.at(-1)?.width ?? 0
        ),
      { message: "GeoGebra applet should resize when the viewport grows" }
    )
    .toBeGreaterThan(widthBeforeResize);

  const widthBeforeChatCollapse = await page.evaluate(

    () => (window as any).__geohelperGgbSizeCalls.at(-1)?.width ?? 0
  );

  await page.getByRole("button", { name: "收起对话" }).click();

  await expect
    .poll(
      () =>
        page.evaluate(

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
  await openWorkspace(page);

  await expect
    .poll(
      () =>
        page.evaluate(

          () => ((window as any).__geohelperGgbParamsHistory as Array<unknown>).length
        )
    )
    .toBe(1);

  await page.setViewportSize({ width: 390, height: 844 });

  await expect
    .poll(
      () =>
        page.evaluate(

          () => ((window as any).__geohelperGgbParamsHistory as Array<unknown>).length
        ),
      { message: "viewport profile change should trigger a fresh applet mount" }
    )
    .toBeGreaterThan(1);

  await expect
    .poll(
      () =>
        page.evaluate(

          () => (window as any).__geohelperGgbParamsHistory.at(-1)
        )
    )
    .toMatchObject({
      appName: "classic",
      perspective: "G",
      preventFocus: true,
      showMenuBar: false,
      showAlgebraInput: false,
      showToolBarHelp: false,
      showFullscreenButton: true
    });
});


test("re-mounts GeoGebra when desktop enters compact short viewport mode", async ({
  page
}) => {
  await mockGeoGebraRuntime(page);

  await page.setViewportSize({ width: 1200, height: 900 });
  await openWorkspace(page);

  await expect
    .poll(
      () =>
        page.evaluate(

          () => ((window as any).__geohelperGgbParamsHistory as Array<unknown>).length
        )
    )
    .toBe(1);

  await page.setViewportSize({ width: 932, height: 430 });

  await expect
    .poll(
      () =>
        page.evaluate(

          () => ((window as any).__geohelperGgbParamsHistory as Array<unknown>).length
        ),
      {
        message:
          "entering compact short viewport should trigger a fresh desktop GeoGebra mount"
      }
    )
    .toBeGreaterThan(1);

  await expect
    .poll(
      () =>
        page.evaluate(() => {

          const history = (window as any).__geohelperGgbParamsHistory as Array<Record<string, unknown>>;
          return history.at(-1) ?? null;
        })
    )
    .toMatchObject({
      appName: "classic",
      preventFocus: true,
      showMenuBar: true,
      showAlgebraInput: true,
      showToolBarHelp: true,
      showFullscreenButton: true
    });
});

test("replays persisted scene transactions after mount and viewport remount", async ({
  page
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "geohelper.scene.snapshot",
      JSON.stringify({
        schemaVersion: 1,
        transactions: [
          {
            id: "scene_tx_1",
            sceneId: "scene_1",
            transactionId: "tx_1",
            executedAt: 1,
            commandCount: 1,
            batch: {
              version: "1.0",
              scene_id: "scene_1",
              transaction_id: "tx_1",
              commands: [
                {
                  id: "cmd_1",
                  op: "create_point",
                  args: { name: "A", x: 2, y: 1 },
                  depends_on: [],
                  idempotency_key: "idemp_1"
                }
              ],
              post_checks: [],
              explanations: []
            }
          }
        ]
      })
    );
  });
  await mockGeoGebraRuntime(page);

  await page.setViewportSize({ width: 1600, height: 900 });
  await openWorkspace(page);

  await expect
    .poll(() =>
      page.evaluate(

        () => (window as any).__geohelperGgbEvalCommands as string[]
      )
    )
    .toContain("A=(2,1)");

  const replayCountBeforeRemount = await page.evaluate(

    () => ((window as any).__geohelperGgbEvalCommands as string[]).length
  );

  await page.setViewportSize({ width: 390, height: 844 });

  await expect
    .poll(
      () =>
        page.evaluate(

          () => ((window as any).__geohelperGgbEvalCommands as string[]).length
        ),
      { message: "scene transactions should replay into the new applet after remount" }
    )
    .toBeGreaterThan(replayCountBeforeRemount);
});

test("captures manual GeoGebra mutations into the persisted scene snapshot", async ({
  page
}) => {
  await mockGeoGebraRuntime(page);

  await openWorkspace(page);
  await expect(page.getByText("事务数: 0")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(

        () => ((window as any).__geohelperGgbActiveListeners?.add?.length ?? 0)
      )
    )
    .toBeGreaterThan(0);

  await page.evaluate(() => {

    (window as any).__geohelperEmitSceneMutation(
      "add",
      "A",
      "<xml><element label='A' /></xml>"
    );
  });

  await expect(page.getByText("事务数: 1")).toBeVisible();

  const sceneSnapshot = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("geohelper.scene.snapshot") ?? "{}")
  );

  expect(sceneSnapshot.transactions[0].sceneSnapshot).toBe(
    "<xml><element label='A' /></xml>"
  );
  expect(sceneSnapshot.transactions[0].source).toBe("manual");
});

test("applies browser-side focus requests through the runtime focus bridge", async ({
  page
}) => {
  await mockGeoGebraRuntime(page);

  await openWorkspace(page);

  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as any).__geohelperGgbAppletOnLoadCalls
        )
    )
    .toBeGreaterThan(0);

  await page.evaluate(async () => {
    // @ts-expect-error browser-only Vite module import used by Playwright
    const mod = await import("/src/state/scene-focus-store.ts");
    mod.sceneFocusStore.getState().requestFocus({
      source: "summary",
      objectLabels: ["A", "B", "C"],
      revealCanvas: false
    });
  });

  await expect
    .poll(() =>
      page.evaluate(
        () => ((window as any).__geohelperGgbFocusCalls as string[][]).at(-1) ?? null
      )
    )
    .toEqual(["A", "B", "C"]);
});

test("closes slash menu on outside click while keeping the draft", async ({
  page
}) => {
  await mockGeoGebraRuntime(page);

  await openWorkspace(page);
  const composer = page.getByTestId("chat-composer-input");
  await composer.click();
  await composer.fill("/");

  await expect(page.getByTestId("slash-command-menu")).toBeVisible();
  await expect(composer).toHaveValue("/");

  await page.locator("[data-testid='geogebra-host']").click({
    position: { x: 20, y: 20 }
  });

  await expect(page.getByTestId("slash-command-menu")).toHaveCount(0);
  await expect(composer).toHaveValue("/");
});

test("pressing escape closes slash menu without clearing the draft", async ({
  page
}) => {
  await mockGeoGebraRuntime(page);

  await openWorkspace(page);
  const composer = page.getByTestId("chat-composer-input");
  await composer.click();
  await composer.fill("/垂直");

  await expect(page.getByTestId("slash-command-menu")).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(page.getByTestId("slash-command-menu")).toHaveCount(0);
  await expect(composer).toHaveValue("/垂直");
});

test("settings modal traps focus and closes on escape", async ({ page }) => {
  await mockGeoGebraRuntime(page);

  await openWorkspace(page);
  await page.getByRole("button", { name: "设置" }).click();

  const modal = page.getByTestId("settings-modal");
  await expect(modal).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const active = document.activeElement;
        const modalNode = document.querySelector("[data-testid='settings-modal']");
        return modalNode ? modalNode.contains(active) : false;
      })
    )
    .toBe(true);

  for (let index = 0; index < 10; index += 1) {
    const insideModal = await page.evaluate(() => {
      const active = document.activeElement;
      const modalNode = document.querySelector("[data-testid='settings-modal']");
      return modalNode ? modalNode.contains(active) : false;
    });
    expect(insideModal).toBe(true);
    await page.keyboard.press("Tab");
  }

  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
});

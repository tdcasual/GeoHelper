import { expect, test } from "@playwright/test";

import { createAgentRunPayload } from "./agent-run.test-helpers";
import { mockGeoGebraRuntime } from "./geogebra.test-helpers";

const mockCompile = async (page: import("@playwright/test").Page) => {
  await page.route("**/api/v2/agent/runs", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*"
      },
      body: JSON.stringify(
        createAgentRunPayload({
          traceId: "tr_canvas_focus",
          runId: "run_canvas_focus",
          summary: ["已创建三角形 ABC", "已作角平分线 AD"],
          uncertainties: [
            {
              id: "unc_点_d_在线段_bc_上",
              label: "点 D 在线段 BC 上",
              followUpPrompt: "请确认点 D 是否在线段 BC 上，并说明原因。",
              reviewStatus: "pending"
            }
          ],
          canvasLinks: [
            {
              id: "link_unc_d",
              scope: "uncertainty",
              text: "点 D 在线段 BC 上",
              objectLabels: ["D", "B", "C"],
              uncertaintyId: "unc_点_d_在线段_bc_上"
            }
          ]
        })
      )
    });
  });
};

const openWorkspace = async (page: import("@playwright/test").Page) => {
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();
};

test("desktop review focus sends canvas focus request and marks the active item", async ({
  page
}) => {
  await mockGeoGebraRuntime(page);
  await mockCompile(page);

  await page.setViewportSize({ width: 1600, height: 960 });
  await openWorkspace(page);
  await page.getByTestId("chat-composer-input").fill("画一个三角形");
  await page.getByRole("button", { name: "发送" }).click();

  const uncertaintyItem = page.getByTestId(
    "studio-uncertainty-unc_点_d_在线段_bc_上"
  );
  await page.getByTestId("studio-uncertainty-focus-unc_点_d_在线段_bc_上").click();

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & typeof globalThis & Record<string, unknown>
          ).__geohelperGgbFocusCalls as string[][]
      )
    )
    .toContainEqual(["D", "B", "C"]);
  await expect(uncertaintyItem).toHaveAttribute("data-focus-state", "active");
  await expect(page.getByTestId("canvas-focus-notice")).toContainText(
    "已定位对象：D、B、C"
  );
});

test("compact review focus switches to canvas and keeps a focus notice", async ({
  page
}) => {
  await mockGeoGebraRuntime(page);
  await mockCompile(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkspace(page);
  await page.getByTestId("mobile-surface-chat").click();

  await page.getByTestId("chat-composer-input").fill("画一个三角形");
  await page.getByRole("button", { name: "发送" }).click();
  await page.getByTestId("studio-uncertainty-focus-unc_点_d_在线段_bc_上").click();

  await expect(page.getByTestId("mobile-surface-canvas")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.getByTestId("canvas-focus-notice")).toContainText(
    "已定位对象：D、B、C"
  );
});

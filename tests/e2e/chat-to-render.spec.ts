import { expect, test } from "@playwright/test";

import { createAgentRunPayload } from "./agent-run.test-helpers";

const IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=";

const seedVisionDirectSettings = async (
  page: import("@playwright/test").Page
) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "geohelper.settings.snapshot",
      JSON.stringify({
        schemaVersion: 3,
        defaultMode: "byok",
        runtimeProfiles: [
          {
            id: "runtime_direct",
            name: "Direct BYOK",
            target: "direct",
            baseUrl: "https://openrouter.ai/api/v1",
            updatedAt: 1
          },
          {
            id: "runtime_gateway",
            name: "Gateway",
            target: "gateway",
            baseUrl: "https://gateway.example.com",
            updatedAt: 1
          }
        ],
        defaultRuntimeProfileId: "runtime_direct",
        byokPresets: [
          {
            id: "byok_test",
            name: "Vision",
            model: "gpt-4o",
            endpoint: "https://openrouter.ai/api/v1",
            temperature: 0.2,
            maxTokens: 1200,
            timeoutMs: 20000,
            updatedAt: 1
          }
        ],
        officialPresets: [
          {
            id: "official_test",
            name: "Official",
            model: "gpt-4o-mini",
            temperature: 0.2,
            maxTokens: 1200,
            timeoutMs: 20000,
            updatedAt: 1
          }
        ],
        defaultByokPresetId: "byok_test",
        defaultOfficialPresetId: "official_test",
        sessionOverrides: {},
        experimentFlags: {
          showAgentSteps: false,
          autoRetryEnabled: false,
          requestTimeoutEnabled: true,
          strictValidationEnabled: false,
          fallbackSingleAgentEnabled: false,
          debugLogPanelEnabled: false,
          performanceSamplingEnabled: false
        },
        requestDefaults: { retryAttempts: 1 },
        debugEvents: []
      })
    );
  });
};

const seedVisionGatewaySettings = async (
  page: import("@playwright/test").Page
) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "geohelper.settings.snapshot",
      JSON.stringify({
        schemaVersion: 3,
        defaultMode: "byok",
        runtimeProfiles: [
          {
            id: "runtime_gateway",
            name: "Gateway",
            target: "gateway",
            baseUrl: "https://gateway.example.com",
            updatedAt: 1
          },
          {
            id: "runtime_direct",
            name: "Direct BYOK",
            target: "direct",
            baseUrl: "https://openrouter.ai/api/v1",
            updatedAt: 1
          }
        ],
        defaultRuntimeProfileId: "runtime_gateway",
        byokPresets: [
          {
            id: "byok_test",
            name: "Gateway Vision",
            model: "gpt-4.1-mini",
            endpoint: "https://gateway.example.com",
            temperature: 0.2,
            maxTokens: 1200,
            timeoutMs: 20000,
            updatedAt: 1
          }
        ],
        officialPresets: [
          {
            id: "official_test",
            name: "Official",
            model: "gpt-4o-mini",
            temperature: 0.2,
            maxTokens: 1200,
            timeoutMs: 20000,
            updatedAt: 1
          }
        ],
        defaultByokPresetId: "byok_test",
        defaultOfficialPresetId: "official_test",
        sessionOverrides: {},
        experimentFlags: {
          showAgentSteps: false,
          autoRetryEnabled: false,
          requestTimeoutEnabled: true,
          strictValidationEnabled: false,
          fallbackSingleAgentEnabled: false,
          debugLogPanelEnabled: false,
          performanceSamplingEnabled: false
        },
        requestDefaults: { retryAttempts: 1 },
        debugEvents: []
      })
    );
  });
};

const createImageFile = (name = "triangle.png") => ({
  name,
  mimeType: "image/png",
  buffer: Buffer.from(IMAGE_BASE64, "base64")
});

const mockCompile = async (page: import("@playwright/test").Page) => {
  await page.route("**/api/v2/agent/runs", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST,OPTIONS",
          "access-control-allow-headers": "*"
        },
        body: ""
      });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*"
      },
      body: JSON.stringify(
        createAgentRunPayload({
          traceId: "tr_e2e_1",
          runId: "run_e2e_1",
          summary: ["已生成 0 条指令"]
        })
      )
    });
  });
};

test("composer supports shift-enter newline and enter send", async ({ page }) => {
  await mockCompile(page);
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();

  const composer = page.getByTestId("chat-composer-input");
  await composer.fill("第一行");
  await composer.press("Shift+Enter");
  await composer.type("第二行");

  await expect(composer).toHaveValue("第一行\n第二行");
  await composer.press("Enter");

  await expect(
    page.locator(".chat-message").filter({ hasText: "第一行" })
  ).toHaveCount(1);
  await expect(
    page.locator(".chat-message").filter({ hasText: "第二行" })
  ).toHaveCount(1);
  await expect(composer).toHaveValue("");
});

test("slash command menu can apply template", async ({ page }) => {
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();

  const composer = page.getByTestId("chat-composer-input");
  await composer.fill("/垂直");

  const slashMenu = page.getByTestId("slash-command-menu");
  await expect(slashMenu).toBeVisible();
  await expect(page.getByRole("button", { name: "发送" })).toBeDisabled();
  await slashMenu.getByRole("button", { name: /垂直平分线/ }).click();

  await expect(composer).toHaveValue("过点A和B作线段AB的垂直平分线。");
  await expect(page.getByRole("button", { name: "发送" })).toBeEnabled();
});

test("plus menu can apply template action", async ({ page }) => {
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();

  await page.getByTestId("plus-menu-button").click();
  const plusMenu = page.getByTestId("plus-menu");
  await expect(plusMenu).toBeVisible();
  await plusMenu.getByRole("button", { name: "画圆" }).click();

  await expect(page.getByTestId("chat-composer-input")).toHaveValue(
    "过点A为圆心，半径为3作圆。"
  );
});

test("plus menu previews uploaded images when vision is supported", async ({ page }) => {
  await seedVisionDirectSettings(page);

  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();
  await page.getByTestId("plus-menu-button").click();
  await page.getByRole("button", { name: "上传图片", exact: true }).click();
  await page.getByTestId("composer-image-input").setInputFiles(createImageFile());

  await expect(page.getByTestId("composer-attachment-item")).toHaveCount(1);
  await expect(page.getByText("triangle.png")).toBeVisible();
});

test("dragging an image into composer adds an attachment", async ({ page }) => {
  await seedVisionDirectSettings(page);

  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();
  await page.getByTestId("chat-composer-shell").evaluate(
    (node, payload) => {
      const binary = atob(payload.base64);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const file = new File([bytes], payload.name, { type: payload.mimeType });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      node.dispatchEvent(
        new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          dataTransfer
        })
      );
      node.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer
        })
      );
    },
    {
      base64: IMAGE_BASE64,
      name: "triangle-drop.png",
      mimeType: "image/png"
    }
  );

  await expect(page.getByTestId("composer-attachment-item")).toHaveCount(1);
  await expect(page.getByText("triangle-drop.png")).toBeVisible();
});

test("pasting an image into composer adds an attachment", async ({ page }) => {
  await seedVisionDirectSettings(page);

  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();
  await page.getByTestId("chat-composer-input").evaluate(
    (node, payload) => {
      const binary = atob(payload.base64);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const file = new File([bytes], payload.name, { type: payload.mimeType });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", {
        value: dataTransfer,
        configurable: true
      });
      node.dispatchEvent(event);
    },
    {
      base64: IMAGE_BASE64,
      name: "triangle-paste.png",
      mimeType: "image/png"
    }
  );

  await expect(page.getByTestId("composer-attachment-item")).toHaveCount(1);
  await expect(page.getByText("triangle-paste.png")).toBeVisible();
});

test("gateway mode can upload and send images when capability is enabled", async ({ page }) => {
  await seedVisionGatewaySettings(page);

  let compilePayload: Record<string, unknown> | undefined;
  await page.route("https://gateway.example.com/admin/version", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*"
      },
      body: JSON.stringify({
        git_sha: "sha123",
        build_time: "2026-03-12T00:00:00.000Z",
        node_env: "production",
        redis_enabled: true,
        attachments_enabled: true
      })
    });
  });
  await page.route("https://gateway.example.com/api/v2/agent/runs", async (route) => {
    compilePayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*"
      },
      body: JSON.stringify(
        createAgentRunPayload({
          traceId: "tr_gateway_1",
          runId: "run_gateway_1",
          summary: ["已生成 0 条指令"]
        })
      )
    });
  });

  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();
  await page.getByTestId("plus-menu-button").click();
  await expect(
    page.getByRole("button", { name: "上传图片", exact: true })
  ).toBeEnabled();

  await page.getByRole("button", { name: "上传图片", exact: true }).click();
  await page.getByTestId("composer-image-input").setInputFiles(createImageFile());
  await expect(page.getByTestId("composer-attachment-item")).toHaveCount(1);

  await page.getByRole("button", { name: "发送" }).click();
  await expect.poll(() => ((compilePayload?.attachments as unknown[]) ?? []).length).toBe(1);
  await expect(
    page
      .getByTestId("studio-result-panel")
      .locator("text=已生成 0 条指令")
      .first()
  ).toBeVisible();
});

test("plus menu disables image upload when vision is unavailable", async ({ page }) => {
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "开始生成图形", exact: true }).click();
  await page.getByTestId("plus-menu-button").click();

  await expect(
    page.getByRole("button", { name: "上传图片", exact: true })
  ).toBeDisabled();
  await expect(page.getByText("当前运行时或模型未开启图片能力")).toBeVisible();
});

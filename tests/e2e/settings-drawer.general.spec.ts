import { expect, test } from "@playwright/test";

import {
  createBackupFile,
  openSettingsSection,
  openWorkspace
} from "./settings-drawer.test-helpers";

test("mobile settings navigation does not overflow horizontally", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkspace(page);
  await page.getByRole("button", { name: "设置" }).click();

  const metrics = await page.evaluate(() => {
    const nav = document.querySelector(".settings-nav") as HTMLElement | null;
    const buttons = Array.from(
      document.querySelectorAll(".settings-nav-button")
    ).map((element) => {
      const rect = (element as HTMLElement).getBoundingClientRect();
      return {
        text: element.textContent?.trim() ?? "",
        right: rect.right,
        left: rect.left
      };
    });

    const navRect = nav?.getBoundingClientRect();
    return {
      navRight: navRect?.right ?? 0,
      scrollWidth: nav?.scrollWidth ?? 0,
      clientWidth: nav?.clientWidth ?? 0,
      buttons
    };
  });

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  for (const button of metrics.buttons) {
    expect(button.right).toBeLessThanOrEqual(metrics.navRight + 1);
  }
});

test("short landscape settings keeps content viewport usable", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await openWorkspace(page);
  await page.getByRole("button", { name: "设置" }).click();

  const metrics = await page.evaluate(() => {
    const modal = document.querySelector("[data-testid='settings-modal']") as HTMLElement | null;
    const content = document.querySelector(".settings-content") as HTMLElement | null;
    const modalRect = modal?.getBoundingClientRect();
    const contentRect = content?.getBoundingClientRect();
    return {
      viewportHeight: window.innerHeight,
      modalBottom: modalRect?.bottom ?? 0,
      contentHeight: contentRect?.height ?? 0
    };
  });

  expect(metrics.modalBottom).toBeLessThanOrEqual(metrics.viewportHeight);
  expect(metrics.contentHeight).toBeGreaterThanOrEqual(280);
});

test("compact landscape settings keeps bottom apply action fully visible", async ({
  page
}) => {
  await page.setViewportSize({ width: 740, height: 360 });
  await openWorkspace(page);
  await page.getByRole("button", { name: "设置" }).click();

  const metrics = await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll("button")).find((element) =>
      element.textContent?.includes("应用默认模式到当前会话")
    ) as HTMLElement | undefined;
    const rect = button?.getBoundingClientRect();
    return {
      viewportHeight: window.innerHeight,
      buttonBottom: rect?.bottom ?? 0,
      buttonTop: rect?.top ?? 0
    };
  });

  expect(metrics.buttonTop).toBeGreaterThanOrEqual(0);
  expect(metrics.buttonBottom).toBeLessThanOrEqual(metrics.viewportHeight);
});

test("small phone settings keeps bottom apply action fully visible", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await openWorkspace(page);
  await page.getByRole("button", { name: "设置" }).click();

  const metrics = await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll("button")).find((element) =>
      element.textContent?.includes("应用默认模式到当前会话")
    ) as HTMLElement | undefined;
    const rect = button?.getBoundingClientRect();
    return {
      viewportHeight: window.innerHeight,
      buttonBottom: rect?.bottom ?? 0,
      buttonTop: rect?.top ?? 0
    };
  });

  expect(metrics.buttonTop).toBeGreaterThanOrEqual(0);
  expect(metrics.buttonBottom).toBeLessThanOrEqual(metrics.viewportHeight);
});

test("smallest phone settings keeps bottom apply action fully visible", async ({
  page
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openWorkspace(page);
  await page.getByRole("button", { name: "设置" }).click();

  const metrics = await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll("button")).find((element) =>
      element.textContent?.includes("应用默认模式到当前会话")
    ) as HTMLElement | undefined;
    const rect = button?.getBoundingClientRect();
    return {
      viewportHeight: window.innerHeight,
      buttonBottom: rect?.bottom ?? 0,
      buttonTop: rect?.top ?? 0
    };
  });

  expect(metrics.buttonTop).toBeGreaterThanOrEqual(0);
  expect(metrics.buttonBottom).toBeLessThanOrEqual(metrics.viewportHeight);
});

test("applies byok preset config to compile request", async ({ page }) => {
  let capturedModel = "";
  let capturedEndpoint = "";
  let capturedByokKey = "";

  await page.route("**/api/v1/chat/compile", async (route) => {
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

    const payload = route.request().postDataJSON() as { model?: string };
    const headers = route.request().headers();
    capturedModel = payload.model ?? "";
    capturedEndpoint = headers["x-byok-endpoint"] ?? "";
    capturedByokKey = headers["x-byok-key"] ?? "";

    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*"
      },
      body: JSON.stringify({
        trace_id: "tr_settings_1",
        batch: {
          version: "1.0",
          scene_id: "s1",
          transaction_id: "t1",
          commands: [],
          post_checks: [],
          explanations: []
        },
        agent_steps: []
      })
    });
  });

  await openWorkspace(page);
  await openSettingsSection(page, "模型与预设");

  await page.getByTestId("byok-model-input").fill("openai/gpt-4o-mini");
  await page
    .getByTestId("byok-endpoint-input")
    .fill("https://openrouter.ai/api/v1");
  await page.getByTestId("byok-key-input").fill("sk-e2e-byok");
  await page.getByTestId("byok-save-button").click();
  await page.getByRole("button", { name: "关闭" }).click();

  await page.getByPlaceholder("例如：过点A和B作垂直平分线").fill("画一个圆");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByTestId("studio-result-panel").getByText("已生成 0 条指令")).toBeVisible();

  await expect.poll(() => capturedModel).toBe("openai/gpt-4o-mini");
  await expect.poll(() => capturedEndpoint).toBe("https://openrouter.ai/api/v1");
  await expect.poll(() => capturedByokKey).toBe("sk-e2e-byok");
});

test("debug log wraps long tokens inside mobile settings panel", async ({ page }) => {
  const longDebugToken = `debug_${"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".repeat(160)}`;

  await page.addInitScript(
    (snapshot) => {
      localStorage.setItem("geohelper.settings.snapshot", JSON.stringify(snapshot));
    },
    {
      schemaVersion: 3,
      defaultMode: "byok",
      runtimeProfiles: [
        {
          id: "runtime_direct",
          name: "Direct BYOK",
          target: "direct",
          baseUrl: "https://openrouter.ai/api/v1",
          updatedAt: 1
        }
      ],
      defaultRuntimeProfileId: "runtime_direct",
      byokPresets: [
        {
          id: "byok_default",
          name: "Default BYOK",
          model: "gpt-4o-mini",
          endpoint: "https://openrouter.ai/api/v1",
          temperature: 0.2,
          maxTokens: 1200,
          timeoutMs: 20000,
          updatedAt: 1
        }
      ],
      officialPresets: [
        {
          id: "official_default",
          name: "Official",
          model: "gpt-4o-mini",
          temperature: 0.2,
          maxTokens: 1200,
          timeoutMs: 20000,
          updatedAt: 1
        }
      ],
      defaultByokPresetId: "byok_default",
      defaultOfficialPresetId: "official_default",
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
      debugEvents: [
        {
          id: "debug_long_token",
          time: 1741392000000,
          level: "error",
          message: longDebugToken
        }
      ]
    }
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkspace(page);
  await openSettingsSection(page, "数据与安全");
  await expect(page.locator(".debug-log-panel article")).toBeVisible();

  const metrics = await page.evaluate(() => {
    const panel = document.querySelector(".debug-log-panel") as HTMLElement | null;
    const article = document.querySelector(".debug-log-panel article") as HTMLElement | null;
    const message = article?.querySelector("span") as HTMLElement | null;
    const panelRect = panel?.getBoundingClientRect();
    const articleRect = article?.getBoundingClientRect();
    const messageRect = message?.getBoundingClientRect();
    return {
      panelScrollWidth: panel?.scrollWidth ?? 0,
      panelClientWidth: panel?.clientWidth ?? 0,
      articleRight: articleRect?.right ?? 0,
      messageRight: messageRect?.right ?? 0,
      panelRight: panelRect?.right ?? 0
    };
  });

  expect(metrics.panelScrollWidth).toBeLessThanOrEqual(metrics.panelClientWidth + 1);
  expect(metrics.articleRight).toBeLessThanOrEqual(metrics.panelRight + 1);
  expect(metrics.messageRight).toBeLessThanOrEqual(metrics.panelRight + 1);
});

test("short landscape data section keeps import actions visible without general-grid layout", async ({
  page
}) => {
  await page.setViewportSize({ width: 740, height: 360 });
  await openWorkspace(page);
  await openSettingsSection(page, "数据与安全");

  await page
    .getByTestId("settings-modal")
    .locator('input[type="file"][accept="application/json"]')
    .setInputFiles(
      createBackupFile({
        conversations: [
          {
            id: "conv_preview",
            title: "preview",
            createdAt: 1,
            updatedAt: 2,
            messages: []
          }
        ],
        settings: {}
      })
    );

  await expect(page.getByText("已读取备份文件，请选择导入策略")).toBeVisible();

  const metrics = await page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll(".settings-section"));
    const backupSection = sections.find((section) =>
      section.querySelector("h3")?.textContent?.trim() === "备份与恢复"
    ) as HTMLElement | undefined;
    const mergeButton = Array.from(backupSection?.querySelectorAll("button") ?? []).find(
      (button) => button.textContent?.includes("合并导入")
    ) as HTMLElement | undefined;
    const replaceButton = Array.from(backupSection?.querySelectorAll("button") ?? []).find(
      (button) => button.textContent?.includes("覆盖导入")
    ) as HTMLElement | undefined;
    const backupSectionStyle = backupSection ? getComputedStyle(backupSection) : null;
    const mergeRect = mergeButton?.getBoundingClientRect();
    const replaceRect = replaceButton?.getBoundingClientRect();
    return {
      display: backupSectionStyle?.display ?? "",
      mergeBottom: mergeRect?.bottom ?? 0,
      replaceBottom: replaceRect?.bottom ?? 0,
      mergeRight: mergeRect?.right ?? 0,
      replaceRight: replaceRect?.right ?? 0,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth
    };
  });

  expect(metrics.display).not.toBe("grid");
  expect(metrics.mergeBottom).toBeLessThanOrEqual(metrics.viewportHeight);
  expect(metrics.replaceBottom).toBeLessThanOrEqual(metrics.viewportHeight);
  expect(metrics.mergeRight).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.replaceRight).toBeLessThanOrEqual(metrics.viewportWidth);
});

test("mobile settings navigation stays compact instead of stretching rows", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkspace(page);
  await page.getByRole("button", { name: "设置" }).click();

  const metrics = await page.evaluate(() => {
    const nav = document.querySelector(".settings-nav") as HTMLElement | null;
    const buttons = Array.from(document.querySelectorAll(".settings-nav-button")) as HTMLElement[];
    const navRect = nav?.getBoundingClientRect();
    const heights = buttons.map((button) => button.getBoundingClientRect().height);
    return {
      navHeight: navRect?.height ?? 0,
      maxButtonHeight: heights.length ? Math.max(...heights) : 0,
      minButtonHeight: heights.length ? Math.min(...heights) : 0
    };
  });

  expect(metrics.navHeight).toBeLessThanOrEqual(96);
  expect(metrics.maxButtonHeight).toBeLessThanOrEqual(44);
  expect(metrics.minButtonHeight).toBeGreaterThanOrEqual(30);
});

test("mobile settings short sections stay packed below navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkspace(page);
  await page.getByRole("button", { name: "设置" }).click();
  await page.getByRole("button", { name: "实验功能", exact: true }).click();

  const metrics = await page.evaluate(() => {
    const nav = document.querySelector(".settings-nav") as HTMLElement | null;
    const content = document.querySelector(".settings-content") as HTMLElement | null;
    const section = document.querySelector(".settings-section") as HTMLElement | null;
    const navRect = nav?.getBoundingClientRect();
    const contentRect = content?.getBoundingClientRect();
    const sectionRect = section?.getBoundingClientRect();
    return {
      navBottom: navRect?.bottom ?? 0,
      contentTop: contentRect?.top ?? 0,
      sectionTop: sectionRect?.top ?? 0,
      gapAfterNav: navRect && contentRect ? contentRect.top - navRect.bottom : 0,
      contentHeight: contentRect?.height ?? 0
    };
  });

  expect(metrics.gapAfterNav).toBeLessThanOrEqual(20);
  expect(metrics.sectionTop - metrics.contentTop).toBeLessThanOrEqual(4);
  expect(metrics.contentHeight).toBeGreaterThanOrEqual(280);
});

test("mobile model preset selector stays within section with long preset names", async ({
  page
}) => {
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
            baseUrl: "",
            updatedAt: 1
          }
        ],
        defaultRuntimeProfileId: "runtime_gateway",
        byokPresets: [
          {
            id: "byok_default",
            name: "默认 BYOK",
            model: "gpt-4o-mini",
            endpoint: "https://example.com/v1",
            temperature: 0.2,
            maxTokens: 1200,
            timeoutMs: 20000,
            updatedAt: 1
          },
          {
            id: "byok_long",
            name: "这是一个超长的 BYOK 预设名称用于测试 select 与表单布局在手机端的表现",
            model: "anthropic/claude-sonnet-very-long-model-name-for-layout-checks",
            endpoint: "https://openrouter.example.com/api/v1/very/long/endpoint/path",
            temperature: 0.4,
            maxTokens: 4096,
            timeoutMs: 30000,
            updatedAt: 2
          }
        ],
        officialPresets: [
          {
            id: "official_default",
            name: "默认 Official",
            model: "gpt-4o-mini",
            temperature: 0.2,
            maxTokens: 1200,
            timeoutMs: 20000,
            updatedAt: 1
          }
        ],
        defaultByokPresetId: "byok_default",
        defaultOfficialPresetId: "official_default",
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

  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkspace(page);
  await openSettingsSection(page, "模型与预设");

  const metrics = await page.evaluate(() => {
    const section = document.querySelector(".settings-section") as HTMLElement | null;
    const selector = section?.querySelector(".settings-inline-actions select") as HTMLElement | null;
    const sectionRect = section?.getBoundingClientRect();
    const selectorRect = selector?.getBoundingClientRect();
    return {
      sectionScrollWidth: section?.scrollWidth ?? 0,
      sectionClientWidth: section?.clientWidth ?? 0,
      selectorRight: selectorRect?.right ?? 0,
      sectionRight: sectionRect?.right ?? 0,
      selectorWidth: selectorRect?.width ?? 0,
      sectionWidth: sectionRect?.width ?? 0
    };
  });

  expect(metrics.sectionScrollWidth).toBeLessThanOrEqual(metrics.sectionClientWidth + 1);
  expect(metrics.selectorRight).toBeLessThanOrEqual(metrics.sectionRight + 1);
  expect(metrics.selectorWidth).toBeLessThanOrEqual(metrics.sectionWidth);
});

import { createBackupEnvelope } from "../../packages/protocol/src";
import { expect, test } from "@playwright/test";

const openSettingsSection = async (
  page: import("@playwright/test").Page,
  section: "模型与预设" | "数据与安全"
) => {
  await page.getByRole("button", { name: "设置" }).click();
  await page.getByRole("button", { name: section, exact: true }).click();
};

const seedGatewayRemoteBackupSettings = async (
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
        debugEvents: []
      })
    );
    localStorage.setItem(
      "geohelper.chat.snapshot",
      JSON.stringify({
        mode: "byok",
        sessionToken: null,
        reauthRequired: false,
        activeConversationId: "conv_local",
        messages: [
          {
            id: "msg_local",
            role: "user",
            content: "local only"
          }
        ],
        conversations: [
          {
            id: "conv_local",
            title: "local only",
            createdAt: 1,
            updatedAt: 2,
            messages: [
              {
                id: "msg_local",
                role: "user",
                content: "local only"
              }
            ]
          }
        ]
      })
    );
  });
};

const saveGatewayAdminToken = async (
  page: import("@playwright/test").Page
) => {
  await openSettingsSection(page, "数据与安全");
  await page.getByPlaceholder("x-admin-token").fill("admin-secret");
  await page.getByRole("button", { name: "保存管理员令牌" }).click();
  await expect(page.getByText("网关管理员令牌已保存")).toBeVisible();
};

const createBackupFile = (input: {
  schemaVersion?: number;
  appVersion?: string;
  createdAt?: string;
  updatedAt?: string;
  conversations?: Array<Record<string, unknown>>;
  settings?: Record<string, unknown>;
  invalidChecksum?: boolean;
}) => {
  const createdAt = input.createdAt ?? "2026-03-05T00:00:00.000Z";
  const envelope = createBackupEnvelope(
    {
      conversations: input.conversations ?? [],
      settings: input.settings ?? {}
    },
    {
      schemaVersion: input.schemaVersion ?? 1,
      createdAt,
      updatedAt: input.updatedAt ?? createdAt,
      appVersion: input.appVersion ?? "0.0.1",
      snapshotId: "snap_e2e_backup",
      deviceId: "device_e2e_backup"
    }
  );
  const body = JSON.stringify(
    input.invalidChecksum
      ? {
          ...envelope,
          checksum: "deadbeef"
        }
      : envelope,
    null,
    2
  );

  return {
    name: "geochat-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(body, "utf-8")
  };
};

test("opens settings as centered modal with section navigation", async ({ page }) => {
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "设置" }).click();

  const modal = page.getByTestId("settings-modal");
  await expect(modal).toBeVisible();
  await expect(page.getByRole("heading", { name: "设置" })).toBeVisible();
  await expect(page.getByRole("button", { name: "通用", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "模型与预设", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "当前会话", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "实验功能", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "数据与安全", exact: true })).toBeVisible();

  const box = await modal.boundingBox();
  expect(box?.x ?? 0).toBeGreaterThan(40);

  await page.getByRole("button", { name: "模型与预设", exact: true }).click();
  await expect(page.getByRole("heading", { name: "BYOK 预设", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "官方预设", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "数据与安全", exact: true }).click();
  await expect(page.getByRole("heading", { name: "备份与恢复", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "安全", exact: true })).toBeVisible();
});


test("opening settings preserves desktop history preference", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto("http://localhost:5173");

  await page.getByTestId("history-toggle-button").click();
  await expect(page.getByTestId("conversation-sidebar")).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem("geohelper.ui.preferences");
        return raw ? JSON.parse(raw).historyDrawerVisible ?? null : null;
      })
    )
    .toBe(true);

  await page.getByRole("button", { name: "设置" }).click();
  await expect(page.getByTestId("settings-modal")).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem("geohelper.ui.preferences");
        return raw ? JSON.parse(raw).historyDrawerVisible ?? null : null;
      }),
      { message: "opening settings should not clear the persisted desktop history state" }
    )
    .toBe(true);

  await page.getByRole("button", { name: "关闭" }).click();
  await expect(page.getByTestId("settings-modal")).toBeHidden();
  await expect(page.getByTestId("conversation-sidebar")).toBeVisible();
  await expect(page.getByTestId("history-toggle-button")).toHaveText("收起历史");
});



test("mobile settings navigation does not overflow horizontally", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:5173");
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
  await page.goto("http://localhost:5173");
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
  await page.goto("http://localhost:5173");
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
  await page.goto("http://localhost:5173");
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
  await page.goto("http://localhost:5173");
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

  await page.goto("http://localhost:5173");
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
  await expect(page.getByText("已生成 0 条指令")).toBeVisible();

  await expect.poll(() => capturedModel).toBe("openai/gpt-4o-mini");
  await expect.poll(() => capturedEndpoint).toBe("https://openrouter.ai/api/v1");
  await expect.poll(() => capturedByokKey).toBe("sk-e2e-byok");
});

test("shows newer-schema hint before import", async ({ page }) => {
  await page.goto("http://localhost:5173");
  await openSettingsSection(page, "数据与安全");

  await page
    .getByTestId("settings-modal")
    .locator('input[type="file"][accept="application/json"]')
    .setInputFiles(createBackupFile({ schemaVersion: 99 }));

  await expect(
    page.getByText("备份版本高于当前应用，导入后可能存在字段降级")
  ).toBeVisible();
});

test("shows checksum error when backup file is corrupted", async ({ page }) => {
  await page.goto("http://localhost:5173");
  await openSettingsSection(page, "数据与安全");

  await page
    .getByTestId("settings-modal")
    .locator('input[type="file"][accept="application/json"]')
    .setInputFiles(createBackupFile({ invalidChecksum: true }));

  await expect(page.getByText("备份读取失败，请检查文件格式")).toBeVisible();
});

test("merges backup by conversation id and updatedAt", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      (window as { __reloadCalled?: boolean }).__reloadCalled = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window.location as any).reload = () => {
        (window as { __reloadCalled?: boolean }).__reloadCalled = true;
      };
    } catch {
      // Ignore reload patch failure in browser sandbox.
    }
  });
  await page.addInitScript(() => {
    if (sessionStorage.getItem("__seeded_merge__") === "1") {
      return;
    }
    sessionStorage.setItem("__seeded_merge__", "1");
    localStorage.setItem(
      "geohelper.chat.snapshot",
      JSON.stringify({
        mode: "byok",
        sessionToken: null,
        activeConversationId: "conv_local",
        reauthRequired: false,
        messages: [{ id: "m2", role: "user", content: "local" }],
        conversations: [
          {
            id: "conv_shared",
            title: "shared_old",
            createdAt: 1,
            updatedAt: 100,
            messages: [{ id: "m1", role: "user", content: "old" }]
          },
          {
            id: "conv_local",
            title: "local",
            createdAt: 2,
            updatedAt: 200,
            messages: [{ id: "m2", role: "user", content: "local" }]
          }
        ]
      })
    );
  });

  await page.goto("http://localhost:5173");
  await openSettingsSection(page, "数据与安全");

  await page.getByTestId("settings-modal").locator('input[type="file"][accept="application/json"]').setInputFiles(
    createBackupFile({
      conversations: [
        {
          id: "conv_shared",
          title: "shared_new",
          createdAt: 1,
          updatedAt: 300,
          messages: [{ id: "m3", role: "assistant", content: "new" }]
        },
        {
          id: "conv_from_backup",
          title: "backup",
          createdAt: 3,
          updatedAt: 250,
          messages: []
        }
      ],
      settings: {}
    })
  );

  await expect(page.getByText("已读取备份文件，请选择导入策略")).toBeVisible();
  await page.getByRole("button", { name: "合并导入（推荐）" }).click();
  await expect(page.getByText("备份合并导入成功，正在刷新")).toBeVisible();

  const snapshot = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("geohelper.chat.snapshot") ?? "{}")
  );
  expect(snapshot.conversations.map((item: { id: string }) => item.id)).toEqual([
    "conv_shared",
    "conv_from_backup",
    "conv_local"
  ]);
  expect(snapshot.conversations[0].title).toBe("shared_new");
  expect(snapshot.activeConversationId).toBe("conv_local");
});

test("replaces local snapshot when import mode is replace", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      (window as { __reloadCalled?: boolean }).__reloadCalled = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window.location as any).reload = () => {
        (window as { __reloadCalled?: boolean }).__reloadCalled = true;
      };
    } catch {
      // Ignore reload patch failure in browser sandbox.
    }
  });
  await page.addInitScript(() => {
    if (sessionStorage.getItem("__seeded_replace__") === "1") {
      return;
    }
    sessionStorage.setItem("__seeded_replace__", "1");
    localStorage.setItem(
      "geohelper.chat.snapshot",
      JSON.stringify({
        mode: "byok",
        sessionToken: null,
        activeConversationId: "conv_local",
        reauthRequired: false,
        messages: [{ id: "m2", role: "user", content: "local" }],
        conversations: [
          {
            id: "conv_local",
            title: "local",
            createdAt: 2,
            updatedAt: 200,
            messages: [{ id: "m2", role: "user", content: "local" }]
          }
        ]
      })
    );
  });

  await page.goto("http://localhost:5173");
  await openSettingsSection(page, "数据与安全");

  await page.getByTestId("settings-modal").locator('input[type="file"][accept="application/json"]').setInputFiles(
    createBackupFile({
      conversations: [
        {
          id: "conv_only_backup",
          title: "backup",
          createdAt: 3,
          updatedAt: 400,
          messages: [{ id: "m3", role: "assistant", content: "backup" }]
        }
      ],
      settings: {}
    })
  );

  await expect(page.getByText("已读取备份文件，请选择导入策略")).toBeVisible();
  await page.getByRole("button", { name: "覆盖导入" }).click();
  await expect(page.getByText("备份覆盖导入成功，正在刷新")).toBeVisible();

  const snapshot = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("geohelper.chat.snapshot") ?? "{}")
  );
  expect(snapshot.conversations.map((item: { id: string }) => item.id)).toEqual([
    "conv_only_backup"
  ]);
  expect(snapshot.activeConversationId).toBe("conv_only_backup");
  expect(snapshot.messages[0].content).toBe("backup");
});


test("debug log wraps long tokens inside mobile settings panel", async ({ page }) => {
  const longDebugToken = `debug_${"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".repeat(160)}`;

  await page.addInitScript((snapshot) => {
    localStorage.setItem("geohelper.settings.snapshot", JSON.stringify(snapshot));
  }, {
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
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:5173");
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
  await page.goto("http://localhost:5173");
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
  await page.goto("http://localhost:5173");
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
  await page.goto("http://localhost:5173");
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
  await page.goto("http://localhost:5173");
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

test("remote backup sync status stays metadata-only until user explicitly imports", async ({
  page
}) => {
  await seedGatewayRemoteBackupSettings(page);

  await page.route(
    "https://gateway.example.com/admin/backups/history?limit=5",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          history: [
            {
              stored_at: "2026-03-12T10:05:00.000Z",
              schema_version: 2,
              created_at: "2026-03-12T10:00:00.000Z",
              updated_at: "2026-03-12T10:04:00.000Z",
              app_version: "0.0.1",
              checksum: "checksum-remote",
              conversation_count: 2,
              snapshot_id: "snap-remote",
              device_id: "device-remote"
            }
          ],
          build: {
            git_sha: "backupsha",
            build_time: "2026-03-12T10:05:30.000Z",
            node_env: "test",
            redis_enabled: true,
            attachments_enabled: false
          }
        })
      });
    }
  );
  await page.route(
    "https://gateway.example.com/admin/backups/compare",
    async (route) => {
      const payload = route.request().postDataJSON() as {
        local_summary?: {
          snapshot_id?: string;
          checksum?: string;
        };
      };
      expect(payload.local_summary?.snapshot_id).toBeTruthy();
      expect(payload.local_summary?.checksum).toBeTruthy();

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          local_status: "summary",
          remote_status: "available",
          comparison_result: "remote_newer",
          local_snapshot: {
            summary: {
              schema_version: 3,
              created_at: "2026-03-12T09:59:00.000Z",
              updated_at: "2026-03-12T10:01:00.000Z",
              app_version: "0.0.1",
              checksum: "checksum-local",
              conversation_count: 1,
              snapshot_id: "snap-local",
              device_id: "device-local"
            }
          },
          remote_snapshot: {
            summary: {
              stored_at: "2026-03-12T10:05:00.000Z",
              schema_version: 2,
              created_at: "2026-03-12T10:00:00.000Z",
              updated_at: "2026-03-12T10:04:00.000Z",
              app_version: "0.0.1",
              checksum: "checksum-remote",
              conversation_count: 2,
              snapshot_id: "snap-remote",
              device_id: "device-remote"
            }
          },
          build: {
            git_sha: "backupsha",
            build_time: "2026-03-12T10:05:30.000Z",
            node_env: "test",
            redis_enabled: true,
            attachments_enabled: false
          }
        })
      });
    }
  );
  await page.route(
    "https://gateway.example.com/admin/backups/latest",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          backup: {
            stored_at: "2026-03-12T10:05:00.000Z",
            schema_version: 2,
            created_at: "2026-03-12T10:00:00.000Z",
            updated_at: "2026-03-12T10:04:00.000Z",
            app_version: "0.0.1",
            checksum: "checksum-remote",
            conversation_count: 2,
            snapshot_id: "snap-remote",
            device_id: "device-remote",
            envelope: {
              schema_version: 2,
              created_at: "2026-03-12T10:00:00.000Z",
              updated_at: "2026-03-12T10:04:00.000Z",
              app_version: "0.0.1",
              checksum: "checksum-remote",
              snapshot_id: "snap-remote",
              device_id: "device-remote",
              conversations: [],
              settings: {}
            }
          },
          build: {
            git_sha: "backupsha",
            build_time: "2026-03-12T10:05:30.000Z",
            node_env: "test",
            redis_enabled: true,
            attachments_enabled: false
          }
        })
      });
    }
  );

  await page.goto("http://localhost:5173");
  await saveGatewayAdminToken(page);
  await page.getByRole("button", { name: "检查云端状态" }).click();

  await expect(page.getByText("同步状态：云端较新")).toBeVisible();
  await expect(page.getByText(/云端最新快照：.*2 个会话/)).toBeVisible();
  await expect(
    page
      .getByTestId("remote-backup-sync-status")
      .getByText("快照 ID：snap-remote")
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "上传最新快照" })).toBeVisible();
  await expect(page.getByRole("button", { name: "拉取最新快照" })).toBeVisible();

  const chatSnapshotAfterCheck = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("geohelper.chat.snapshot") ?? "null")
  );
  expect(chatSnapshotAfterCheck.conversations.map((item: { id: string }) => item.id)).toEqual([
    "conv_local"
  ]);

  await page.getByRole("button", { name: "拉取最新快照" }).click();
  await expect(page.getByRole("button", { name: "拉取后导入（合并）" })).toBeVisible();
  await expect(page.getByRole("button", { name: "拉取后覆盖导入" })).toBeVisible();

  const chatSnapshotAfterPull = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("geohelper.chat.snapshot") ?? "null")
  );
  expect(chatSnapshotAfterPull.conversations.map((item: { id: string }) => item.id)).toEqual([
    "conv_local"
  ]);
});

test("remote backup history allows selecting and previewing one retained historical snapshot", async ({
  page
}) => {
  await seedGatewayRemoteBackupSettings(page);

  await page.route(
    "https://gateway.example.com/admin/backups/history?limit=5",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          history: [
            {
              stored_at: "2026-03-12T10:05:00.000Z",
              schema_version: 2,
              created_at: "2026-03-12T10:00:00.000Z",
              updated_at: "2026-03-12T10:04:00.000Z",
              app_version: "0.0.1",
              checksum: "checksum-remote-2",
              conversation_count: 2,
              snapshot_id: "snap-remote-2",
              device_id: "device-remote-2",
              base_snapshot_id: "snap-remote-1"
            },
            {
              stored_at: "2026-03-12T09:58:00.000Z",
              schema_version: 2,
              created_at: "2026-03-12T09:55:00.000Z",
              updated_at: "2026-03-12T09:57:00.000Z",
              app_version: "0.0.1",
              checksum: "checksum-remote-1",
              conversation_count: 1,
              snapshot_id: "snap-remote-1",
              device_id: "device-remote-1"
            }
          ],
          build: {
            git_sha: "backupsha",
            build_time: "2026-03-12T10:05:30.000Z",
            node_env: "test",
            redis_enabled: true,
            attachments_enabled: false
          }
        })
      });
    }
  );
  await page.route(
    "https://gateway.example.com/admin/backups/compare",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          local_status: "summary",
          remote_status: "available",
          comparison_result: "remote_newer",
          local_snapshot: {
            summary: {
              schema_version: 3,
              created_at: "2026-03-12T09:59:00.000Z",
              updated_at: "2026-03-12T10:01:00.000Z",
              app_version: "0.0.1",
              checksum: "checksum-local",
              conversation_count: 1,
              snapshot_id: "snap-local",
              device_id: "device-local"
            }
          },
          remote_snapshot: {
            summary: {
              stored_at: "2026-03-12T10:05:00.000Z",
              schema_version: 2,
              created_at: "2026-03-12T10:00:00.000Z",
              updated_at: "2026-03-12T10:04:00.000Z",
              app_version: "0.0.1",
              checksum: "checksum-remote-2",
              conversation_count: 2,
              snapshot_id: "snap-remote-2",
              device_id: "device-remote-2",
              base_snapshot_id: "snap-remote-1"
            }
          },
          build: {
            git_sha: "backupsha",
            build_time: "2026-03-12T10:05:30.000Z",
            node_env: "test",
            redis_enabled: true,
            attachments_enabled: false
          }
        })
      });
    }
  );
  await page.route(
    "https://gateway.example.com/admin/backups/history/snap-remote-1",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          backup: {
            stored_at: "2026-03-12T09:58:00.000Z",
            schema_version: 2,
            created_at: "2026-03-12T09:55:00.000Z",
            updated_at: "2026-03-12T09:57:00.000Z",
            app_version: "0.0.1",
            checksum: "checksum-remote-1",
            conversation_count: 1,
            snapshot_id: "snap-remote-1",
            device_id: "device-remote-1",
            envelope: {
              schema_version: 2,
              created_at: "2026-03-12T09:55:00.000Z",
              updated_at: "2026-03-12T09:57:00.000Z",
              app_version: "0.0.1",
              checksum: "checksum-remote-1",
              snapshot_id: "snap-remote-1",
              device_id: "device-remote-1",
              conversations: [
                {
                  id: "conv_remote_old",
                  title: "old remote"
                }
              ],
              settings: {}
            }
          },
          build: {
            git_sha: "backupsha",
            build_time: "2026-03-12T10:05:30.000Z",
            node_env: "test",
            redis_enabled: true,
            attachments_enabled: false
          }
        })
      });
    }
  );

  await page.goto("http://localhost:5173");
  await saveGatewayAdminToken(page);
  await page.getByRole("button", { name: "检查云端状态" }).click();

  await expect(page.getByTestId("remote-backup-history")).toBeVisible();
  await expect(page.getByText("云端保留历史：2 条")).toBeVisible();
  await expect(
    page.getByTestId("remote-backup-selected-history").getByText("当前选择：云端最新快照")
  ).toBeVisible();

  await page.getByRole("button", { name: /snap-remote-1/ }).click();

  const selectedHistory = page.getByTestId("remote-backup-selected-history");
  await expect(selectedHistory.getByText("当前选择：历史快照")).toBeVisible();
  await expect(selectedHistory.getByText("快照 ID：snap-remote-1")).toBeVisible();
  await expect(selectedHistory.getByText("设备 ID：device-remote-1")).toBeVisible();
  await expect(selectedHistory.getByText("会话数：1")).toBeVisible();
  await expect(selectedHistory.getByText(/更新时间：/)).toBeVisible();
  await expect(
    selectedHistory.getByText(
      "建议先拉取当前选中的快照预览；如这是关键恢复点，可先保护当前选中的快照，再决定合并、覆盖或仍然覆盖云端。"
    )
  ).toBeVisible();

  await page.getByRole("button", { name: "拉取所选历史快照" }).click();

  await expect(page.getByText("已从网关拉取所选快照（1 个会话）")).toBeVisible();
  await expect(page.getByText("同步状态：云端较新")).toBeVisible();
  await expect(page.getByRole("button", { name: "拉取后导入（合并）" })).toBeVisible();
  await expect(page.getByRole("button", { name: "拉取后覆盖导入" })).toBeVisible();

  const chatSnapshotAfterPreview = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("geohelper.chat.snapshot") ?? "null")
  );
  expect(
    chatSnapshotAfterPreview.conversations.map((item: { id: string }) => item.id)
  ).toEqual(["conv_local"]);
});

test("remote backup upload defaults to guarded writes and only force-overwrites after explicit danger action", async ({
  page
}) => {
  await seedGatewayRemoteBackupSettings(page);

  let guardedCalls = 0;
  let latestPutCalls = 0;

  await page.route(
    "https://gateway.example.com/admin/backups/guarded",
    async (route) => {
      guardedCalls += 1;
      const payload = route.request().postDataJSON() as {
        expected_remote_snapshot_id?: string | null;
      };
      expect(payload.expected_remote_snapshot_id ?? null).toBeNull();

      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          guarded_write: "conflict",
          comparison_result: "remote_newer",
          expected_remote_snapshot_id: null,
          actual_remote_snapshot: {
            summary: {
              stored_at: "2026-03-12T10:05:00.000Z",
              schema_version: 2,
              created_at: "2026-03-12T10:00:00.000Z",
              updated_at: "2026-03-12T10:04:00.000Z",
              app_version: "0.0.1",
              checksum: "checksum-remote",
              conversation_count: 2,
              snapshot_id: "snap-remote",
              device_id: "device-remote"
            }
          },
          build: {
            git_sha: "backupsha",
            build_time: "2026-03-12T10:05:30.000Z",
            node_env: "test",
            redis_enabled: true,
            attachments_enabled: false
          }
        })
      });
    }
  );
  await page.route(
    "https://gateway.example.com/admin/backups/latest",
    async (route) => {
      latestPutCalls += 1;
      expect(route.request().method()).toBe("PUT");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          backup: {
            stored_at: "2026-03-12T10:06:00.000Z",
            schema_version: 3,
            created_at: "2026-03-12T09:59:00.000Z",
            updated_at: "2026-03-12T10:06:00.000Z",
            app_version: "0.0.1",
            checksum: "checksum-local",
            conversation_count: 1,
            snapshot_id: "snap-local",
            device_id: "device-local"
          },
          build: {
            git_sha: "backupsha",
            build_time: "2026-03-12T10:06:30.000Z",
            node_env: "test",
            redis_enabled: true,
            attachments_enabled: false
          }
        })
      });
    }
  );

  await page.goto("http://localhost:5173");
  await saveGatewayAdminToken(page);

  await expect(
    page.getByRole("button", { name: "仍然覆盖云端快照" })
  ).toHaveCount(0);

  await page.getByRole("button", { name: "上传最新快照" }).click();

  await expect.poll(() => guardedCalls).toBe(1);
  await expect.poll(() => latestPutCalls).toBe(0);
  await expect(page.getByText("同步状态：需要显式覆盖")).toBeVisible();
  await expect(
    page.getByTestId("remote-backup-sync-status").getByText("不会自动覆盖")
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "仍然覆盖云端快照" })
  ).toBeVisible();

  await page.getByRole("button", { name: "仍然覆盖云端快照" }).click();
  await expect.poll(() => latestPutCalls).toBe(1);
  await expect(page.getByText("已上传到网关最新备份（1 个会话）")).toBeVisible();
});

test("remote backup compare warnings require explicit escalation before overwrite", async ({
  page
}) => {
  await seedGatewayRemoteBackupSettings(page);

  let guardedCalls = 0;
  let latestPutCalls = 0;

  await page.route(
    "https://gateway.example.com/admin/backups/history?limit=5",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          history: [
            {
              stored_at: "2026-03-12T10:05:00.000Z",
              schema_version: 2,
              created_at: "2026-03-12T10:00:00.000Z",
              updated_at: "2026-03-12T10:04:00.000Z",
              app_version: "0.0.1",
              checksum: "checksum-remote",
              conversation_count: 2,
              snapshot_id: "snap-remote",
              device_id: "device-remote"
            }
          ],
          build: {
            git_sha: "backupsha",
            build_time: "2026-03-12T10:05:30.000Z",
            node_env: "test",
            redis_enabled: true,
            attachments_enabled: false
          }
        })
      });
    }
  );
  await page.route(
    "https://gateway.example.com/admin/backups/compare",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          local_status: "summary",
          remote_status: "available",
          comparison_result: "remote_newer",
          local_snapshot: {
            summary: {
              schema_version: 3,
              created_at: "2026-03-12T09:59:00.000Z",
              updated_at: "2026-03-12T10:01:00.000Z",
              app_version: "0.0.1",
              checksum: "checksum-local",
              conversation_count: 1,
              snapshot_id: "snap-local",
              device_id: "device-local"
            }
          },
          remote_snapshot: {
            summary: {
              stored_at: "2026-03-12T10:05:00.000Z",
              schema_version: 2,
              created_at: "2026-03-12T10:00:00.000Z",
              updated_at: "2026-03-12T10:04:00.000Z",
              app_version: "0.0.1",
              checksum: "checksum-remote",
              conversation_count: 2,
              snapshot_id: "snap-remote",
              device_id: "device-remote"
            }
          },
          build: {
            git_sha: "backupsha",
            build_time: "2026-03-12T10:05:30.000Z",
            node_env: "test",
            redis_enabled: true,
            attachments_enabled: false
          }
        })
      });
    }
  );
  await page.route(
    "https://gateway.example.com/admin/backups/guarded",
    async (route) => {
      guardedCalls += 1;
      await route.abort();
    }
  );
  await page.route(
    "https://gateway.example.com/admin/backups/latest",
    async (route) => {
      if (route.request().method() === "PUT") {
        latestPutCalls += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            backup: {
              stored_at: "2026-03-12T10:06:00.000Z",
              schema_version: 3,
              created_at: "2026-03-12T09:59:00.000Z",
              updated_at: "2026-03-12T10:06:00.000Z",
              app_version: "0.0.1",
              checksum: "checksum-local",
              conversation_count: 1,
              snapshot_id: "snap-local",
              device_id: "device-local"
            },
            build: {
              git_sha: "backupsha",
              build_time: "2026-03-12T10:06:30.000Z",
              node_env: "test",
              redis_enabled: true,
              attachments_enabled: false
            }
          })
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          backup: {
            stored_at: "2026-03-12T10:05:00.000Z",
            schema_version: 2,
            created_at: "2026-03-12T10:00:00.000Z",
            updated_at: "2026-03-12T10:04:00.000Z",
            app_version: "0.0.1",
            checksum: "checksum-remote",
            conversation_count: 2,
            snapshot_id: "snap-remote",
            device_id: "device-remote",
            envelope: {
              schema_version: 2,
              created_at: "2026-03-12T10:00:00.000Z",
              updated_at: "2026-03-12T10:04:00.000Z",
              app_version: "0.0.1",
              checksum: "checksum-remote",
              snapshot_id: "snap-remote",
              device_id: "device-remote",
              conversations: [],
              settings: {}
            }
          },
          build: {
            git_sha: "backupsha",
            build_time: "2026-03-12T10:05:30.000Z",
            node_env: "test",
            redis_enabled: true,
            attachments_enabled: false
          }
        })
      });
    }
  );

  await page.goto("http://localhost:5173");
  await saveGatewayAdminToken(page);
  await page.getByRole("button", { name: "检查云端状态" }).click();
  await expect(page.getByText("同步状态：云端较新")).toBeVisible();

  await expect(
    page.getByRole("button", { name: "仍然覆盖云端快照" })
  ).toHaveCount(0);
  await page.getByRole("button", { name: "上传最新快照" }).click();

  await expect.poll(() => guardedCalls).toBe(0);
  await expect.poll(() => latestPutCalls).toBe(0);
  await expect(page.getByText("同步状态：需要显式覆盖")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "仍然覆盖云端快照" })
  ).toBeVisible();
});

test("remote backup sync keeps gateway failures visible and non-destructive", async ({
  page
}) => {
  await seedGatewayRemoteBackupSettings(page);

  await page.route(
    "https://gateway.example.com/admin/backups/history?limit=5",
    async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "GATEWAY_UNAVAILABLE",
            message: "Gateway unavailable"
          }
        })
      });
    }
  );

  await page.goto("http://localhost:5173");
  await saveGatewayAdminToken(page);
  await page.getByRole("button", { name: "检查云端状态" }).click();

  await expect(page.getByText("同步状态：检查失败")).toBeVisible();
  await expect(
    page.getByTestId("remote-backup-sync-status").getByText("Gateway unavailable")
  ).toBeVisible();

  const chatSnapshot = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("geohelper.chat.snapshot") ?? "null")
  );
  expect(chatSnapshot.conversations.map((item: { id: string }) => item.id)).toEqual([
    "conv_local"
  ]);
});

test("remote backup history allows protecting and unprotecting one selected retained snapshot", async ({
  page
}) => {
  await seedGatewayRemoteBackupSettings(page);

  await page.route(
    "https://gateway.example.com/admin/backups/history?limit=5",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          history: [
            {
              stored_at: "2026-03-12T10:05:00.000Z",
              schema_version: 2,
              created_at: "2026-03-12T10:00:00.000Z",
              updated_at: "2026-03-12T10:04:00.000Z",
              app_version: "0.0.1",
              checksum: "checksum-remote-2",
              conversation_count: 2,
              snapshot_id: "snap-remote-2",
              device_id: "device-remote-2",
              is_protected: false,
              base_snapshot_id: "snap-remote-1"
            },
            {
              stored_at: "2026-03-12T09:58:00.000Z",
              schema_version: 2,
              created_at: "2026-03-12T09:55:00.000Z",
              updated_at: "2026-03-12T09:57:00.000Z",
              app_version: "0.0.1",
              checksum: "checksum-remote-1",
              conversation_count: 1,
              snapshot_id: "snap-remote-1",
              device_id: "device-remote-1",
              is_protected: false
            }
          ],
          build: {
            git_sha: "backupsha",
            build_time: "2026-03-12T10:05:30.000Z",
            node_env: "test",
            redis_enabled: true,
            attachments_enabled: false
          }
        })
      });
    }
  );
  await page.route(
    "https://gateway.example.com/admin/backups/compare",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          local_status: "summary",
          remote_status: "available",
          comparison_result: "remote_newer",
          local_snapshot: {
            summary: {
              schema_version: 3,
              created_at: "2026-03-12T09:59:00.000Z",
              updated_at: "2026-03-12T10:01:00.000Z",
              app_version: "0.0.1",
              checksum: "checksum-local",
              conversation_count: 1,
              snapshot_id: "snap-local",
              device_id: "device-local"
            }
          },
          remote_snapshot: {
            summary: {
              stored_at: "2026-03-12T10:05:00.000Z",
              schema_version: 2,
              created_at: "2026-03-12T10:00:00.000Z",
              updated_at: "2026-03-12T10:04:00.000Z",
              app_version: "0.0.1",
              checksum: "checksum-remote-2",
              conversation_count: 2,
              snapshot_id: "snap-remote-2",
              device_id: "device-remote-2",
              is_protected: false,
              base_snapshot_id: "snap-remote-1"
            }
          },
          build: {
            git_sha: "backupsha",
            build_time: "2026-03-12T10:05:30.000Z",
            node_env: "test",
            redis_enabled: true,
            attachments_enabled: false
          }
        })
      });
    }
  );
  await page.route(
    "https://gateway.example.com/admin/backups/history/snap-remote-1/protect",
    async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            protection_status: "protected",
            backup: {
              stored_at: "2026-03-12T09:58:00.000Z",
              schema_version: 2,
              created_at: "2026-03-12T09:55:00.000Z",
              updated_at: "2026-03-12T09:57:00.000Z",
              app_version: "0.0.1",
              checksum: "checksum-remote-1",
              conversation_count: 1,
              snapshot_id: "snap-remote-1",
              device_id: "device-remote-1",
              is_protected: true,
              protected_at: "2026-03-12T10:06:00.000Z"
            },
            build: {
              git_sha: "backupsha",
              build_time: "2026-03-12T10:06:30.000Z",
              node_env: "test",
              redis_enabled: true,
              attachments_enabled: false
            }
          })
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          protection_status: "unprotected",
          backup: {
            stored_at: "2026-03-12T09:58:00.000Z",
            schema_version: 2,
            created_at: "2026-03-12T09:55:00.000Z",
            updated_at: "2026-03-12T09:57:00.000Z",
            app_version: "0.0.1",
            checksum: "checksum-remote-1",
            conversation_count: 1,
            snapshot_id: "snap-remote-1",
            device_id: "device-remote-1",
            is_protected: false
          },
          build: {
            git_sha: "backupsha",
            build_time: "2026-03-12T10:07:00.000Z",
            node_env: "test",
            redis_enabled: true,
            attachments_enabled: false
          }
        })
      });
    }
  );

  await page.goto("http://localhost:5173");
  await saveGatewayAdminToken(page);
  await page.getByRole("button", { name: "检查云端状态" }).click();
  await page.getByRole("button", { name: /snap-remote-1/ }).click();

  const selectedHistory = page.getByTestId("remote-backup-selected-history");
  await expect(selectedHistory.getByText("保护状态：未保护")).toBeVisible();
  await expect(page.getByRole("button", { name: "保护此快照" })).toBeVisible();

  await page.getByRole("button", { name: "保护此快照" }).click();
  await expect(page.getByText("已保护所选快照（snap-remote-1）")).toBeVisible();
  await expect(selectedHistory.getByText("保护状态：已保护")).toBeVisible();
  await expect(selectedHistory.getByText(/保护时间：/)).toBeVisible();
  await expect(page.getByRole("button", { name: "取消保护" })).toBeVisible();

  await page.getByRole("button", { name: "取消保护" }).click();
  await expect(page.getByText("已取消保护所选快照（snap-remote-1）")).toBeVisible();
  await expect(selectedHistory.getByText("保护状态：未保护")).toBeVisible();
});

test("remote backup history shows a friendly protected-capacity error", async ({
  page
}) => {
  await seedGatewayRemoteBackupSettings(page);

  await page.route(
    "https://gateway.example.com/admin/backups/history?limit=5",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          history: [
            {
              stored_at: "2026-03-12T10:05:00.000Z",
              schema_version: 2,
              created_at: "2026-03-12T10:00:00.000Z",
              updated_at: "2026-03-12T10:04:00.000Z",
              app_version: "0.0.1",
              checksum: "checksum-remote-2",
              conversation_count: 2,
              snapshot_id: "snap-remote-2",
              device_id: "device-remote-2",
              is_protected: true,
              protected_at: "2026-03-12T10:06:00.000Z"
            },
            {
              stored_at: "2026-03-12T09:58:00.000Z",
              schema_version: 2,
              created_at: "2026-03-12T09:55:00.000Z",
              updated_at: "2026-03-12T09:57:00.000Z",
              app_version: "0.0.1",
              checksum: "checksum-remote-1",
              conversation_count: 1,
              snapshot_id: "snap-remote-1",
              device_id: "device-remote-1",
              is_protected: false
            }
          ],
          build: {
            git_sha: "backupsha",
            build_time: "2026-03-12T10:05:30.000Z",
            node_env: "test",
            redis_enabled: true,
            attachments_enabled: false
          }
        })
      });
    }
  );
  await page.route(
    "https://gateway.example.com/admin/backups/compare",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          local_status: "summary",
          remote_status: "available",
          comparison_result: "remote_newer",
          local_snapshot: {
            summary: {
              schema_version: 3,
              created_at: "2026-03-12T09:59:00.000Z",
              updated_at: "2026-03-12T10:01:00.000Z",
              app_version: "0.0.1",
              checksum: "checksum-local",
              conversation_count: 1,
              snapshot_id: "snap-local",
              device_id: "device-local"
            }
          },
          remote_snapshot: {
            summary: {
              stored_at: "2026-03-12T10:05:00.000Z",
              schema_version: 2,
              created_at: "2026-03-12T10:00:00.000Z",
              updated_at: "2026-03-12T10:04:00.000Z",
              app_version: "0.0.1",
              checksum: "checksum-remote-2",
              conversation_count: 2,
              snapshot_id: "snap-remote-2",
              device_id: "device-remote-2",
              is_protected: true,
              protected_at: "2026-03-12T10:06:00.000Z"
            }
          },
          build: {
            git_sha: "backupsha",
            build_time: "2026-03-12T10:05:30.000Z",
            node_env: "test",
            redis_enabled: true,
            attachments_enabled: false
          }
        })
      });
    }
  );
  await page.route(
    "https://gateway.example.com/admin/backups/history/snap-remote-1/protect",
    async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          protection_status: "limit_reached",
          snapshot_id: "snap-remote-1",
          protected_count: 1,
          max_protected: 1,
          build: {
            git_sha: "backupsha",
            build_time: "2026-03-12T10:06:30.000Z",
            node_env: "test",
            redis_enabled: true,
            attachments_enabled: false
          }
        })
      });
    }
  );

  await page.goto("http://localhost:5173");
  await saveGatewayAdminToken(page);
  await page.getByRole("button", { name: "检查云端状态" }).click();
  await page.getByRole("button", { name: /snap-remote-1/ }).click();
  await page.getByRole("button", { name: "保护此快照" }).click();

  await expect(
    page.getByText("受保护快照已达上限（1/1），请先取消保护旧快照。")
  ).toBeVisible();
});

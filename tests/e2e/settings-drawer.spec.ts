import { expect, test } from "@playwright/test";

const checksumOf = (value: string): string => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const openSettingsSection = async (
  page: import("@playwright/test").Page,
  section: "模型与预设" | "数据与安全"
) => {
  await page.getByRole("button", { name: "设置" }).click();
  await page.getByRole("button", { name: section, exact: true }).click();
};

const createBackupFile = (input: {
  schemaVersion?: number;
  appVersion?: string;
  createdAt?: string;
  conversations?: Array<Record<string, unknown>>;
  settings?: Record<string, unknown>;
  invalidChecksum?: boolean;
}) => {
  const envelopeWithoutChecksum = {
    schema_version: input.schemaVersion ?? 1,
    created_at: input.createdAt ?? "2026-03-05T00:00:00.000Z",
    app_version: input.appVersion ?? "0.0.1",
    conversations: input.conversations ?? [],
    settings: input.settings ?? {}
  };
  const checksum = input.invalidChecksum
    ? "deadbeef"
    : checksumOf(JSON.stringify(envelopeWithoutChecksum));
  const body = JSON.stringify(
    {
      ...envelopeWithoutChecksum,
      checksum
    },
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
  await expect(page.getByRole("heading", { name: "Official 预设", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "数据与安全", exact: true }).click();
  await expect(page.getByRole("heading", { name: "备份与恢复", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "安全", exact: true })).toBeVisible();
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

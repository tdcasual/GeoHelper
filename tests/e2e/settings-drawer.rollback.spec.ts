import { expect, test } from "@playwright/test";

import {
  createBackupFile,
  openSettingsSection,
  openWorkspace
} from "./settings-drawer.test-helpers";

test("warns before replacing an existing rollback anchor on local import", async ({
  page
}) => {
  await page.addInitScript(() => {
    try {
      const originalSetTimeout = window.setTimeout.bind(window);
      window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
        if (
          typeof handler === "function" &&
          String(handler).includes("window.location.reload")
        ) {
          return 0;
        }
        return originalSetTimeout(handler, timeout, ...(args as []));
      }) as typeof window.setTimeout;

      (window.location as { reload: () => void }).reload = () => undefined;
    } catch {
      // Ignore reload patch failure in browser sandbox.
    }
  });
  await page.addInitScript(() => {
    if (sessionStorage.getItem("__seeded_local_overwrite_guard__") === "1") {
      return;
    }
    sessionStorage.setItem("__seeded_local_overwrite_guard__", "1");
    localStorage.setItem(
      "geohelper.chat.snapshot",
      JSON.stringify({
        mode: "byok",
        sessionToken: null,
        activeConversationId: "conv_local",
        reauthRequired: false,
        messages: [{ id: "m_local", role: "user", content: "local before guard" }],
        conversations: [
          {
            id: "conv_local",
            title: "local before guard",
            createdAt: 1,
            updatedAt: 100,
            messages: [{ id: "m_local", role: "user", content: "local before guard" }]
          }
        ]
      })
    );
  });

  await openWorkspace(page);
  await openSettingsSection(page, "数据与安全");

  const backupFileInput = page
    .getByTestId("settings-modal")
    .locator('input[type="file"][accept="application/json"]');

  await backupFileInput.setInputFiles(
    createBackupFile({
      conversations: [
        {
          id: "conv_first_import",
          title: "first import",
          createdAt: 2,
          updatedAt: 200,
          messages: [{ id: "m_first_import", role: "assistant", content: "first import" }]
        }
      ],
      settings: {}
    })
  );

  await page.getByRole("button", { name: "覆盖导入" }).click();
  await page.getByRole("button", { name: "确认覆盖本地数据" }).click();
  await expect(page.getByText("备份覆盖导入成功，正在刷新")).toBeVisible();

  let snapshot = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("geohelper.chat.snapshot") ?? "{}")
  );
  expect(snapshot.conversations.map((item: { id: string }) => item.id)).toEqual([
    "conv_first_import"
  ]);

  await expect(page.getByTestId("import-rollback-anchor")).toBeVisible();

  const secondBackupFile = createBackupFile({
    conversations: [
      {
        id: "conv_second_import",
        title: "second import",
        createdAt: 3,
        updatedAt: 300,
        messages: [{ id: "m_second_import", role: "assistant", content: "second import" }]
      }
    ],
    settings: {}
  });

  await backupFileInput.setInputFiles(secondBackupFile);
  await expect(page.getByText("已读取备份文件，请选择导入策略")).toBeVisible();

  await page.getByRole("button", { name: "合并导入（推荐）" }).click();
  await expect(
    page.getByText(
      "当前恢复锚点（来源：本地备份文件（geochat-backup.json））将在继续导入后被替换。请再次点击“确认合并导入”继续。"
    )
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "确认合并导入" })).toBeVisible();

  snapshot = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("geohelper.chat.snapshot") ?? "{}")
  );
  expect(snapshot.conversations.map((item: { id: string }) => item.id)).toEqual([
    "conv_first_import"
  ]);

  await page.getByRole("button", { name: "确认合并导入" }).click();
  await expect(page.getByText("备份合并导入成功，正在刷新")).toBeVisible();

  snapshot = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("geohelper.chat.snapshot") ?? "{}")
  );
  expect(snapshot.conversations.map((item: { id: string }) => item.id)).toEqual([
    "conv_second_import",
    "conv_first_import"
  ]);

  await backupFileInput.setInputFiles(
    createBackupFile({
      conversations: [
        {
          id: "conv_third_import",
          title: "third import",
          createdAt: 4,
          updatedAt: 400,
          messages: [{ id: "m_third_import", role: "assistant", content: "third import" }]
        }
      ],
      settings: {}
    })
  );
  await page.getByRole("button", { name: "覆盖导入" }).click();
  await expect(
    page.getByText(
      "高风险操作：覆盖导入会直接替换当前本地数据，并替换当前恢复锚点（来源：本地备份文件（geochat-backup.json））。请再次点击“确认覆盖本地数据”继续。"
    )
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "确认覆盖本地数据" })).toBeVisible();

  snapshot = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("geohelper.chat.snapshot") ?? "{}")
  );
  expect(snapshot.conversations.map((item: { id: string }) => item.id)).toEqual([
    "conv_second_import",
    "conv_first_import"
  ]);
});

test("shows import outcome summary after local import and restores the pre-import local snapshot", async ({
  page
}) => {
  await page.addInitScript(() => {
    try {
      (window as { __reloadCalled?: boolean }).__reloadCalled = false;

      (window.location as { reload: () => void }).reload = () => {
        (window as { __reloadCalled?: boolean }).__reloadCalled = true;
      };
    } catch {
      // Ignore reload patch failure in browser sandbox.
    }
  });
  await page.addInitScript(() => {
    if (sessionStorage.getItem("__seeded_local_rollback__") === "1") {
      return;
    }
    sessionStorage.setItem("__seeded_local_rollback__", "1");
    localStorage.setItem(
      "geohelper.chat.snapshot",
      JSON.stringify({
        mode: "byok",
        sessionToken: null,
        activeConversationId: "conv_local",
        reauthRequired: false,
        messages: [{ id: "m_local", role: "user", content: "local before import" }],
        conversations: [
          {
            id: "conv_local",
            title: "local before import",
            createdAt: 1,
            updatedAt: 100,
            messages: [{ id: "m_local", role: "user", content: "local before import" }]
          }
        ]
      })
    );
    localStorage.setItem(
      "geohelper.ui.preferences",
      JSON.stringify({
        chatVisible: true,
        historyDrawerVisible: false,
        historyDrawerWidth: 280
      })
    );
  });

  await openWorkspace(page);
  await openSettingsSection(page, "数据与安全");

  await page
    .getByTestId("settings-modal")
    .locator('input[type="file"][accept="application/json"]')
    .setInputFiles(
      createBackupFile({
        conversations: [
          {
            id: "conv_imported",
            title: "imported",
            createdAt: 2,
            updatedAt: 200,
            messages: [{ id: "m_imported", role: "assistant", content: "imported" }]
          }
        ],
        settings: {
          ui_preferences: {
            chatVisible: false
          }
        }
      })
    );

  await expect(page.getByText("已读取备份文件，请选择导入策略")).toBeVisible();
  await page.getByRole("button", { name: "覆盖导入" }).click();
  await page.getByRole("button", { name: "确认覆盖本地数据" }).click();
  await expect(page.getByText("备份覆盖导入成功，正在刷新")).toBeVisible();

  let chatSnapshot = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("geohelper.chat.snapshot") ?? "{}")
  );
  expect(chatSnapshot.conversations.map((item: { id: string }) => item.id)).toEqual([
    "conv_imported"
  ]);

  await page.reload();
  await openSettingsSection(page, "数据与安全");

  const rollbackAnchor = page.getByTestId("import-rollback-anchor");
  await expect(rollbackAnchor).toBeVisible();
  await expect(
    rollbackAnchor.getByText("来源：本地备份文件（geochat-backup.json）")
  ).toBeVisible();
  await expect(rollbackAnchor.getByText("导入方式：覆盖导入")).toBeVisible();
  await expect(rollbackAnchor.getByText(/导入前本地快照：.*1 个会话/)).toBeVisible();
  await expect(rollbackAnchor.getByText(/导入后本地快照：.*1 个会话/)).toBeVisible();
  await expect(
    rollbackAnchor.getByText(
      "本次导入结果：覆盖后从 1 个会话变为 1 个会话，移除了 1 个原会话并引入 1 个导入会话。"
    )
  ).toBeVisible();

  await rollbackAnchor.getByRole("button", { name: "恢复到导入前状态" }).click();
  await expect(page.getByText("已恢复到导入前本地状态，正在刷新")).toBeVisible();

  await page.reload();
  await openSettingsSection(page, "数据与安全");
  await expect(page.getByTestId("import-rollback-anchor")).toHaveCount(0);

  chatSnapshot = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("geohelper.chat.snapshot") ?? "{}")
  );
  const uiPreferences = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("geohelper.ui.preferences") ?? "{}")
  );
  expect(chatSnapshot.conversations.map((item: { id: string }) => item.id)).toEqual([
    "conv_local"
  ]);
  expect(chatSnapshot.messages[0]?.content).toBe("local before import");
  expect(uiPreferences.chatVisible).toBe(true);
});

test("clears rollback anchor without mutating the imported local snapshot", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      (window.location as { reload: () => void }).reload = () => undefined;
    } catch {
      // Ignore reload patch failure in browser sandbox.
    }
  });
  await page.addInitScript(() => {
    if (sessionStorage.getItem("__seeded_clear_rollback__") === "1") {
      return;
    }
    sessionStorage.setItem("__seeded_clear_rollback__", "1");
    localStorage.setItem(
      "geohelper.chat.snapshot",
      JSON.stringify({
        mode: "byok",
        sessionToken: null,
        activeConversationId: "conv_local",
        reauthRequired: false,
        messages: [{ id: "m_local", role: "user", content: "local before clear" }],
        conversations: [
          {
            id: "conv_local",
            title: "local before clear",
            createdAt: 1,
            updatedAt: 100,
            messages: [{ id: "m_local", role: "user", content: "local before clear" }]
          }
        ]
      })
    );
  });

  await openWorkspace(page);
  await openSettingsSection(page, "数据与安全");

  await page
    .getByTestId("settings-modal")
    .locator('input[type="file"][accept="application/json"]')
    .setInputFiles(
      createBackupFile({
        conversations: [
          {
            id: "conv_imported_clear",
            title: "imported clear",
            createdAt: 2,
            updatedAt: 200,
            messages: []
          }
        ],
        settings: {}
      })
    );

  await page.getByRole("button", { name: "覆盖导入" }).click();
  await page.getByRole("button", { name: "确认覆盖本地数据" }).click();
  await expect(page.getByText("备份覆盖导入成功，正在刷新")).toBeVisible();

  const rollbackAnchor = page.getByTestId("import-rollback-anchor");
  await expect(rollbackAnchor).toBeVisible();

  let chatSnapshot = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("geohelper.chat.snapshot") ?? "{}")
  );
  expect(chatSnapshot.conversations.map((item: { id: string }) => item.id)).toEqual([
    "conv_imported_clear"
  ]);

  await rollbackAnchor.getByRole("button", { name: "清除此恢复锚点" }).click();
  await expect(page.getByText("已清除此恢复锚点")).toBeVisible();
  await expect(page.getByTestId("import-rollback-anchor")).toHaveCount(0);

  chatSnapshot = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("geohelper.chat.snapshot") ?? "{}")
  );
  expect(chatSnapshot.conversations.map((item: { id: string }) => item.id)).toEqual([
    "conv_imported_clear"
  ]);
});

test("warns when rollback would discard newer post-import changes", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      (window.location as { reload: () => void }).reload = () => undefined;
    } catch {
      // Ignore reload patch failure in browser sandbox.
    }
  });
  await page.addInitScript(() => {
    if (sessionStorage.getItem("__seeded_rollback_warning__") === "1") {
      return;
    }
    sessionStorage.setItem("__seeded_rollback_warning__", "1");
    localStorage.setItem(
      "geohelper.chat.snapshot",
      JSON.stringify({
        mode: "byok",
        sessionToken: null,
        activeConversationId: "conv_local_warning",
        reauthRequired: false,
        messages: [{ id: "m_local_warning", role: "user", content: "local before warning" }],
        conversations: [
          {
            id: "conv_local_warning",
            title: "local before warning",
            createdAt: 1,
            updatedAt: 100,
            messages: [{ id: "m_local_warning", role: "user", content: "local before warning" }]
          }
        ]
      })
    );
  });

  await openWorkspace(page);
  await openSettingsSection(page, "数据与安全");

  await page
    .getByTestId("settings-modal")
    .locator('input[type="file"][accept="application/json"]')
    .setInputFiles(
      createBackupFile({
        conversations: [
          {
            id: "conv_imported_warning",
            title: "imported warning",
            createdAt: 2,
            updatedAt: 200,
            messages: [{ id: "m_imported_warning", role: "assistant", content: "imported warning" }]
          }
        ],
        settings: {}
      })
    );

  await page.getByRole("button", { name: "覆盖导入" }).click();
  await page.getByRole("button", { name: "确认覆盖本地数据" }).click();
  await expect(page.getByText("备份覆盖导入成功，正在刷新")).toBeVisible();

  await page.evaluate(() => {
    const snapshot = JSON.parse(localStorage.getItem("geohelper.chat.snapshot") ?? "{}");
    snapshot.activeConversationId = "conv_imported_warning";
    snapshot.messages = [
      { id: "m_post_import", role: "user", content: "post import local edit" }
    ];
    snapshot.conversations = [
      {
        id: "conv_imported_warning",
        title: "imported warning edited later",
        createdAt: 2,
        updatedAt: 260,
        messages: [{ id: "m_post_import", role: "user", content: "post import local edit" }]
      },
      {
        id: "conv_post_import_new",
        title: "post import new",
        createdAt: 3,
        updatedAt: 300,
        messages: []
      }
    ];
    localStorage.setItem("geohelper.chat.snapshot", JSON.stringify(snapshot));
  });

  await page.reload();
  await openSettingsSection(page, "数据与安全");

  const rollbackAnchor = page.getByTestId("import-rollback-anchor");
  await expect(rollbackAnchor).toBeVisible();
  await expect(
    rollbackAnchor.getByText("当前状态：本地已在这次导入后继续变化。")
  ).toBeVisible();
  await expect(
    rollbackAnchor.getByText(
      "当前本地状态已经偏离最近一次导入结果；如果现在恢复，会同时丢弃导入后新增或修改的内容。"
    )
  ).toBeVisible();
});

import { expect, test } from "@playwright/test";

import {
  createBackupFile,
  openSettingsSection,
  openWorkspace
} from "./settings-drawer.test-helpers";

test("shows newer-schema hint before import", async ({ page }) => {
  await openWorkspace(page);
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
  await openWorkspace(page);
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

      (window.location as { reload: () => void }).reload = () => {
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

  await openWorkspace(page);
  await openSettingsSection(page, "数据与安全");

  await page
    .getByTestId("settings-modal")
    .locator('input[type="file"][accept="application/json"]')
    .setInputFiles(
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

      (window.location as { reload: () => void }).reload = () => {
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

  await openWorkspace(page);
  await openSettingsSection(page, "数据与安全");

  await page
    .getByTestId("settings-modal")
    .locator('input[type="file"][accept="application/json"]')
    .setInputFiles(
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
  await expect(
    page.getByText(
      "高风险操作：覆盖导入会直接替换当前本地数据，请再次点击“确认覆盖本地数据”继续。"
    )
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "确认覆盖本地数据" })).toBeVisible();

  const snapshotBeforeConfirm = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("geohelper.chat.snapshot") ?? "{}")
  );
  expect(snapshotBeforeConfirm.conversations.map((item: { id: string }) => item.id)).toEqual([
    "conv_local"
  ]);

  await page.getByRole("button", { name: "确认覆盖本地数据" }).click();
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

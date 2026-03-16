import { expect, test } from "@playwright/test";

import { createBackupEnvelope } from "../../packages/protocol/src";
import {
  createBackupFile,
  createGatewayRemoteBackupSettingsSnapshot,
  openSettingsSection,
  openWorkspace,
  saveGatewayAdminToken,
  seedGatewayRemoteBackupSettingsOnce
} from "./settings-drawer.test-helpers";

test("shows import outcome summary after remote import with the latest snapshot source label", async ({
  page
}) => {
  await page.addInitScript(() => {
    try {
      (window.location as { reload: () => void }).reload = () => undefined;
    } catch {
      // Ignore reload patch failure in browser sandbox.
    }
  });
  await seedGatewayRemoteBackupSettingsOnce(page);

  const remoteSettingsSnapshot = {
    ...createGatewayRemoteBackupSettingsSnapshot(),
    remoteBackupAdminTokenCipher: {
      version: 1,
      algorithm: "AES-GCM",
      iv: "iv-remote",
      ciphertext: "enc:remote"
    }
  };
  const remoteLatestEnvelope = createBackupEnvelope(
    {
      conversations: [
        {
          id: "conv_remote_a",
          title: "remote a",
          createdAt: 11,
          updatedAt: 21,
          messages: []
        }
      ],
      settings: {
        settings_snapshot: remoteSettingsSnapshot
      }
    },
    {
      schemaVersion: 2,
      createdAt: "2026-03-12T10:00:00.000Z",
      updatedAt: "2026-03-12T10:04:00.000Z",
      appVersion: "0.0.1",
      snapshotId: "snap-remote",
      deviceId: "device-remote"
    }
  );

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
            checksum: remoteLatestEnvelope.checksum,
            conversation_count: 1,
            snapshot_id: "snap-remote",
            device_id: "device-remote",
            envelope: remoteLatestEnvelope
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

  await openWorkspace(page);
  await saveGatewayAdminToken(page);
  await page.getByRole("button", { name: "检查云端状态" }).click();
  await page.getByRole("button", { name: "拉取最新快照" }).click();
  await page.getByRole("button", { name: "拉取后覆盖导入" }).click();
  await page.getByRole("button", { name: "确认拉取后覆盖导入" }).click();
  await expect
    .poll(async () => {
      const snapshot = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("geohelper.chat.snapshot") ?? "{}")
      );
      return snapshot.conversations?.[0]?.id ?? null;
    })
    .toBe("conv_remote_a");

  await page.reload();
  await openSettingsSection(page, "数据与安全");

  const rollbackAnchor = page.getByTestId("import-rollback-anchor");
  await expect(rollbackAnchor).toBeVisible();
  await expect(
    rollbackAnchor.getByText("来源：云端最新快照（snap-remote）")
  ).toBeVisible();
  await expect(rollbackAnchor.getByText("导入方式：覆盖导入")).toBeVisible();
  await expect(rollbackAnchor.getByText(/导入前本地快照：.*1 个会话/)).toBeVisible();
  await expect(rollbackAnchor.getByText(/导入后本地快照：.*1 个会话/)).toBeVisible();
  await expect(
    rollbackAnchor.getByText(
      "本次导入结果：覆盖后从 1 个会话变为 1 个会话，移除了 1 个原会话并引入 1 个导入会话。"
    )
  ).toBeVisible();
});

test("warns before replacing an existing rollback anchor on pulled remote import", async ({
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
  await seedGatewayRemoteBackupSettingsOnce(page);

  const remoteSettingsSnapshot = {
    ...createGatewayRemoteBackupSettingsSnapshot(),
    remoteBackupAdminTokenCipher: {
      version: 1,
      algorithm: "AES-GCM",
      iv: "iv-remote",
      ciphertext: "enc:remote"
    }
  };

  const remoteBackupPulled = createBackupEnvelope(
    {
      conversations: [
        {
          id: "conv_remote_pulled",
          title: "remote pulled",
          createdAt: 12,
          updatedAt: 22,
          messages: [{ id: "msg_remote_pulled", role: "assistant", content: "remote pulled" }]
        }
      ],
      settings: {
        settings_snapshot: remoteSettingsSnapshot
      }
    },
    {
      schemaVersion: 2,
      createdAt: "2026-03-12T10:10:00.000Z",
      updatedAt: "2026-03-12T10:14:00.000Z",
      appVersion: "0.0.1",
      snapshotId: "snap-remote-merge",
      deviceId: "device-remote-merge"
    }
  );

  await page.route("https://gateway.example.com/admin/backups/latest", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        backup: {
          stored_at: "2026-03-12T10:15:00.000Z",
          schema_version: 2,
          created_at: "2026-03-12T10:10:00.000Z",
          updated_at: "2026-03-12T10:14:00.000Z",
          app_version: "0.0.1",
          checksum: remoteBackupPulled.checksum,
          conversation_count: 1,
          snapshot_id: "snap-remote-merge",
          device_id: "device-remote-merge",
          envelope: remoteBackupPulled
        },
        build: {
          git_sha: "backupsha",
          build_time: "2026-03-12T10:25:30.000Z",
          node_env: "test",
          redis_enabled: true,
          attachments_enabled: false
        }
      })
    });
  });

  await saveGatewayAdminToken(page);

  const backupFileInput = page
    .getByTestId("settings-modal")
    .locator('input[type="file"][accept="application/json"]');

  await backupFileInput.setInputFiles(
    createBackupFile({
      conversations: [
        {
          id: "conv_local_anchor",
          title: "local anchor",
          createdAt: 2,
          updatedAt: 200,
          messages: [{ id: "msg_local_anchor", role: "assistant", content: "local anchor" }]
        }
      ],
      settings: {
        settings_snapshot: remoteSettingsSnapshot
      }
    })
  );
  await page.getByRole("button", { name: "覆盖导入" }).click();
  await page.getByRole("button", { name: "确认覆盖本地数据" }).click();
  await expect(page.getByText("备份覆盖导入成功，正在刷新")).toBeVisible();

  let snapshot = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("geohelper.chat.snapshot") ?? "{}")
  );
  expect(snapshot.conversations.map((item: { id: string }) => item.id)).toEqual([
    "conv_local_anchor"
  ]);

  await page.getByRole("textbox", { name: "管理员令牌" }).fill("admin-secret");
  await page.getByRole("button", { name: "保存管理员令牌" }).click();
  await expect(page.getByText("网关管理员令牌已保存")).toBeVisible();
  await page.getByRole("button", { name: "拉取最新快照" }).click();
  await expect(page.getByText("已从网关拉取最新备份（1 个会话）")).toBeVisible();
  await expect(
    page
      .getByTestId("remote-backup-pulled-preview")
      .getByText("快照 ID：snap-remote-merge")
  ).toBeVisible();

  await page.getByRole("button", { name: "拉取后导入（合并）" }).click();
  await expect(
    page.getByText(
      "当前恢复锚点（来源：本地备份文件（geochat-backup.json））将在继续导入后被替换。请再次点击“确认拉取后导入（合并）”继续。"
    )
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "确认拉取后导入（合并）" })
  ).toBeVisible();

  snapshot = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("geohelper.chat.snapshot") ?? "{}")
  );
  expect(snapshot.conversations.map((item: { id: string }) => item.id)).toEqual([
    "conv_local_anchor"
  ]);

  await page.getByRole("button", { name: "拉取后覆盖导入" }).click();
  await expect(
    page.getByText(
      "高风险操作：拉取后覆盖导入会直接替换当前本地数据，并替换当前恢复锚点（来源：本地备份文件（geochat-backup.json））。请再次点击“确认拉取后覆盖导入”继续。"
    )
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "确认拉取后覆盖导入" })
  ).toBeVisible();

  snapshot = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("geohelper.chat.snapshot") ?? "{}")
  );
  expect(snapshot.conversations.map((item: { id: string }) => item.id)).toEqual([
    "conv_local_anchor"
  ]);

  await page.getByRole("button", { name: "拉取后导入（合并）" }).click();
  await page.getByRole("button", { name: "确认拉取后导入（合并）" }).click();
  await expect(page.getByText("已将网关备份合并导入，正在刷新")).toBeVisible();

  snapshot = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("geohelper.chat.snapshot") ?? "{}")
  );
  const mergedConversationIds = snapshot.conversations.map(
    (item: { id: string }) => item.id
  );
  expect(mergedConversationIds).toHaveLength(2);
  expect(mergedConversationIds).toEqual(
    expect.arrayContaining(["conv_remote_pulled", "conv_local_anchor"])
  );
});

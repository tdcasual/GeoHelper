import { expect, test } from "@playwright/test";

import {
  openWorkspace,
  saveGatewayAdminToken,
  seedGatewayRemoteBackupSettings,
  seedGatewayRemoteBackupSettingsOnce
} from "./settings-drawer.test-helpers";

test("remote backup sync status stays metadata-only until user explicitly imports", async ({
  page
}) => {
  await seedGatewayRemoteBackupSettingsOnce(page);

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
              conversations: [
                {
                  id: "conv_remote_a",
                  title: "remote a",
                  createdAt: 11,
                  updatedAt: 21,
                  messages: []
                },
                {
                  id: "conv_remote_b",
                  title: "remote b",
                  createdAt: 12,
                  updatedAt: 22,
                  messages: []
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

  await openWorkspace(page);
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
  const pulledPreview = page.getByTestId("remote-backup-pulled-preview");
  await expect(pulledPreview.getByText("拉取来源：云端最新快照")).toBeVisible();
  await expect(pulledPreview.getByText("与本地关系：拉取结果较新")).toBeVisible();
  await expect(
    pulledPreview.getByText(
      "导入建议：若想尽量保留本地新增内容，先使用合并导入；若确认完全以该快照为准，再使用覆盖导入。"
    )
  ).toBeVisible();
  await expect(pulledPreview.getByText("导入影响预估（按会话）")).toBeVisible();
  await expect(
    pulledPreview.getByText(
      "合并导入：预计新增 2 个会话、按远端更新 0 个同 id 会话、保留 1 个仅本地会话。"
    )
  ).toBeVisible();
  await expect(
    pulledPreview.getByText(
      "覆盖导入：预计用远端 2 个会话替换本地当前 1 个会话。"
    )
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "拉取后导入（合并）" })).toBeVisible();
  await expect(page.getByRole("button", { name: "拉取后覆盖导入" })).toBeVisible();
  await page.getByRole("button", { name: "拉取后覆盖导入" }).click();
  await expect(
    pulledPreview.getByText(
      "高风险操作：拉取后覆盖导入会直接替换当前本地数据，请再次点击“确认拉取后覆盖导入”继续。"
    )
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "确认拉取后覆盖导入" })
  ).toBeVisible();

  const chatSnapshotAfterPull = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("geohelper.chat.snapshot") ?? "null")
  );
  expect(chatSnapshotAfterPull.conversations.map((item: { id: string }) => item.id)).toEqual([
    "conv_local"
  ]);
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

  await openWorkspace(page);
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

  await openWorkspace(page);
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

  await openWorkspace(page);
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

import { expect, test } from "@playwright/test";

import {
  openWorkspace,
  saveGatewayAdminToken,
  seedGatewayRemoteBackupSettings
} from "./settings-drawer.test-helpers";

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

  await openWorkspace(page);
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

  await openWorkspace(page);
  await saveGatewayAdminToken(page);
  await page.getByRole("button", { name: "检查云端状态" }).click();
  await page.getByRole("button", { name: /snap-remote-1/ }).click();
  await page.getByRole("button", { name: "保护此快照" }).click();

  await expect(
    page.getByText("受保护快照已达上限（1/1），请先取消保护旧快照。")
  ).toBeVisible();
});

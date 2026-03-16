import { expect, test } from "@playwright/test";

import {
  openWorkspace,
  saveGatewayAdminToken,
  seedGatewayRemoteBackupSettings
} from "./settings-drawer.test-helpers";

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
                  title: "old remote",
                  createdAt: 13,
                  updatedAt: 14
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

  await expect(page.getByTestId("remote-backup-history")).toBeVisible();
  await expect(page.getByText("云端保留历史：2 条")).toBeVisible();
  await expect(
    page
      .getByRole("button", { name: /snap-remote-2/ })
      .getByText("云端较新")
  ).toBeVisible();
  await expect(
    page
      .getByRole("button", { name: /snap-remote-1/ })
      .getByText("本地较新")
  ).toBeVisible();
  await expect(
    page.getByTestId("remote-backup-selected-history").getByText("当前选择：云端最新快照")
  ).toBeVisible();
  await expect(
    page
      .getByTestId("remote-backup-selected-history")
      .getByText("与本地关系：所选云端快照较新")
  ).toBeVisible();
  await expect(
    page
      .getByTestId("remote-backup-selected-history")
      .getByText("当前所选云端快照比本地更新，建议先拉取该快照预览，再决定合并或覆盖。")
  ).toBeVisible();

  await page.getByRole("button", { name: /snap-remote-1/ }).click();

  const selectedHistory = page.getByTestId("remote-backup-selected-history");
  await expect(selectedHistory.getByText("当前选择：历史快照")).toBeVisible();
  await expect(selectedHistory.getByText("快照 ID：snap-remote-1")).toBeVisible();
  await expect(selectedHistory.getByText("设备 ID：device-remote-1")).toBeVisible();
  await expect(selectedHistory.getByText("会话数：1")).toBeVisible();
  await expect(selectedHistory.getByText(/更新时间：/)).toBeVisible();
  await expect(
    selectedHistory.getByText("与本地关系：本地当前快照较新")
  ).toBeVisible();
  await expect(
    selectedHistory.getByText(
      "本地当前快照比所选云端快照更新；如果要回退到这个历史点，建议先拉取预览，再决定合并或覆盖。"
    )
  ).toBeVisible();
  await expect(
    selectedHistory.getByText(
      "建议先拉取当前选中的快照预览；如这是关键恢复点，可先保护当前选中的快照，再决定合并、覆盖或仍然覆盖云端。"
    )
  ).toBeVisible();

  await page.getByRole("button", { name: "拉取所选历史快照" }).click();

  await expect(page.getByText("已从网关拉取所选快照（1 个会话）")).toBeVisible();
  await expect(page.getByText("同步状态：云端较新")).toBeVisible();
  const pulledHistoryPreview = page.getByTestId("remote-backup-pulled-preview");
  await expect(pulledHistoryPreview.getByText("拉取来源：所选历史快照")).toBeVisible();
  await expect(
    pulledHistoryPreview.getByText("与本地关系：本地当前快照较新")
  ).toBeVisible();
  await expect(
    pulledHistoryPreview.getByText(
      "导入建议：优先使用合并导入保留较新的本地记录；只有确认要回退到该快照时，再使用覆盖导入。"
    )
  ).toBeVisible();
  await expect(pulledHistoryPreview.getByText("导入影响预估（按会话）")).toBeVisible();
  await expect(
    pulledHistoryPreview.getByText(
      "合并导入：预计新增 1 个会话、按远端更新 0 个同 id 会话、保留 1 个仅本地会话。"
    )
  ).toBeVisible();
  await expect(
    pulledHistoryPreview.getByText(
      "覆盖导入：预计用远端 1 个会话替换本地当前 1 个会话。"
    )
  ).toBeVisible();
  await expect(
    pulledHistoryPreview.getByText("当前导入对象：已拉取历史快照（snap-remote-1）")
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "拉取后导入（合并）" })).toBeVisible();
  await expect(page.getByRole("button", { name: "拉取后覆盖导入" })).toBeVisible();

  await page.getByRole("button", { name: /snap-remote-2/ }).click();
  await expect(
    pulledHistoryPreview.getByText(
      "你当前选中的是 snap-remote-2；如要导入这个恢复点，请先重新拉取所选历史快照。"
    )
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "拉取后导入（合并）" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "拉取后覆盖导入" })).toBeDisabled();

  const chatSnapshotAfterPreview = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("geohelper.chat.snapshot") ?? "null")
  );
  expect(
    chatSnapshotAfterPreview.conversations.map((item: { id: string }) => item.id)
  ).toEqual(["conv_local"]);
});

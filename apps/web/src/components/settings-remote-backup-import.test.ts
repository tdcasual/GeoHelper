import { describe, expect, it } from "vitest";

import type { RuntimeBackupComparableSummary } from "../runtime/types";
import {
  formatRemoteBackupRestoreWarning,
  resolveImportActionGuardPresentation,
  resolveImportRollbackAnchorPresentation,
  resolveRemoteBackupPulledConversationImpactPresentation,
  resolveRemoteBackupPulledPreviewGuardPresentation,
  resolveRemoteBackupPulledPreviewPresentation,
  resolveReplaceImportConfirmationPresentation
} from "./settings-remote-backup-import";

const localSummary: RuntimeBackupComparableSummary = {
  schema_version: 2,
  created_at: "2026-03-12T09:58:00.000Z",
  updated_at: "2026-03-12T10:05:00.000Z",
  app_version: "0.0.1",
  checksum: "checksum-local",
  conversation_count: 3,
  snapshot_id: "snap-local",
  device_id: "device-local"
};

const localEnvelope = {
  schema_version: 2,
  created_at: "2026-03-12T09:58:00.000Z",
  updated_at: "2026-03-12T10:05:00.000Z",
  app_version: "0.0.1",
  checksum: "checksum-local-envelope",
  snapshot_id: "snap-local",
  device_id: "device-local",
  conversations: [
    {
      id: "conv-local-only",
      title: "local only",
      createdAt: 1,
      updatedAt: 10,
      messages: []
    },
    {
      id: "conv-shared-local",
      title: "shared local",
      createdAt: 2,
      updatedAt: 20,
      messages: []
    }
  ],
  settings: {}
};

describe("settings remote backup import", () => {
  it("formats restore warning and pulled preview guidance", () => {
    expect(
      formatRemoteBackupRestoreWarning({
        stored_at: "2026-03-12T10:00:00.000Z",
        conversation_count: 2
      })
    ).toBe(
      "导入前请确认恢复策略：合并会保留较新的同 id 本地记录，覆盖会直接替换本地数据。"
    );

    expect(
      resolveRemoteBackupPulledPreviewPresentation({
        source: "latest",
        localSummary,
        pulledBackup: {
          schema_version: 2,
          created_at: "2026-03-12T09:58:00.000Z",
          updated_at: "2026-03-12T10:06:00.000Z",
          app_version: "0.0.1",
          checksum: "checksum-remote-newer",
          conversation_count: 2,
          snapshot_id: "snap-remote-newer",
          device_id: "device-remote",
          base_snapshot_id: "snap-local"
        }
      })
    ).toEqual({
      sourceLabel: "拉取来源：云端最新快照",
      relationLabel: "与本地关系：拉取结果较新",
      recommendation:
        "导入建议：若想尽量保留本地新增内容，先使用合并导入；若确认完全以该快照为准，再使用覆盖导入。"
    });
  });

  it("guards stale selected-history pull previews after the selection changes", () => {
    expect(
      resolveRemoteBackupPulledPreviewGuardPresentation({
        source: "selected_history",
        pulledSnapshotId: "snap-remote-1",
        selectedSnapshotId: "snap-remote-2"
      })
    ).toEqual({
      targetLabel: "当前导入对象：已拉取历史快照（snap-remote-1）",
      warning:
        "你当前选中的是 snap-remote-2；如要导入这个恢复点，请先重新拉取所选历史快照。",
      importEnabled: false
    });
  });

  it("formats pulled preview conversation impact counts for merge and replace", () => {
    expect(
      resolveRemoteBackupPulledConversationImpactPresentation({
        localEnvelopeAtPull: localEnvelope,
        pulledEnvelope: {
          ...localEnvelope,
          checksum: "checksum-remote-preview",
          snapshot_id: "snap-remote-preview",
          conversations: [
            {
              id: "conv-remote-new",
              title: "remote new",
              createdAt: 3,
              updatedAt: 30,
              messages: []
            },
            {
              id: "conv-shared-local",
              title: "shared remote newer",
              createdAt: 2,
              updatedAt: 25,
              messages: []
            }
          ]
        }
      })
    ).toEqual({
      title: "导入影响预估（按会话）",
      mergeSummary:
        "合并导入：预计新增 1 个会话、按远端更新 1 个同 id 会话、保留 1 个仅本地会话。",
      replaceSummary:
        "覆盖导入：预计用远端 2 个会话替换本地当前 2 个会话。"
    });
  });

  it("formats explicit confirmation copy and rollback-anchor guard warnings", () => {
    expect(
      resolveReplaceImportConfirmationPresentation("remote_pulled", true)
    ).toEqual({
      buttonLabel: "确认拉取后覆盖导入",
      warning:
        "高风险操作：拉取后覆盖导入会直接替换当前本地数据，请再次点击“确认拉取后覆盖导入”继续。"
    });

    expect(
      resolveImportActionGuardPresentation({
        scope: "local",
        mode: "replace",
        armed: true,
        hasRollbackAnchor: true,
        anchorSourceLabel: "来源：本地备份文件（lesson-a.json）"
      })
    ).toEqual({
      buttonLabel: "确认覆盖本地数据",
      warning:
        "高风险操作：覆盖导入会直接替换当前本地数据，并替换当前恢复锚点（来源：本地备份文件（lesson-a.json））。请再次点击“确认覆盖本地数据”继续。",
      shouldArmFirst: false,
      danger: true
    });
  });

  it("formats rollback anchor presentation with import outcome summaries", () => {
    expect(
      resolveImportRollbackAnchorPresentation(
        {
          capturedAt: "2026-03-14T01:00:00.000Z",
          source: "local_file",
          importMode: "merge",
          sourceDetail: "lesson-a.json",
          envelope: {
            ...localEnvelope,
            snapshot_id: "snap-local-before"
          },
          importedAt: "2026-03-14T01:01:00.000Z",
          resultEnvelope: {
            ...localEnvelope,
            snapshot_id: "snap-local-after",
            checksum: "checksum-local-after",
            updated_at: "2026-03-14T01:01:00.000Z",
            conversations: [
              localEnvelope.conversations[0]!,
              {
                ...localEnvelope.conversations[1]!,
                title: "shared remote newer",
                updatedAt: 30
              },
              {
                id: "conv-remote-new",
                title: "remote new",
                createdAt: 3,
                updatedAt: 40,
                messages: []
              }
            ]
          }
        },
        {
          conversations: [
            localEnvelope.conversations[0]!,
            {
              ...localEnvelope.conversations[1]!,
              title: "shared remote newer",
              updatedAt: 30
            },
            {
              id: "conv-remote-new",
              title: "remote new",
              createdAt: 3,
              updatedAt: 40,
              messages: []
            }
          ],
          settings: localEnvelope.settings
        }
      )
    ).toEqual({
      title: "导入前恢复锚点",
      sourceLabel: "来源：本地备份文件（lesson-a.json）",
      importModeLabel: "导入方式：合并导入",
      summary: "导入前本地快照：snap-local-before · 2 个会话",
      resultSummary: "导入后本地快照：snap-local-after · 3 个会话",
      outcomeSummary: "本次导入结果：新增 1 个会话、更新 1 个同 id 会话；导入后当前共 3 个会话。",
      currentStateSummary: "当前状态：仍与最近一次导入结果一致。",
      hint: "如本次导入结果不符合预期，可恢复到这次导入前的本地状态。"
    });
  });
});

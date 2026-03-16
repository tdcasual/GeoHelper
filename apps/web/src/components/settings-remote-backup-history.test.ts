import { describe, expect, it } from "vitest";

import type {
  RuntimeBackupComparableSummary,
  RuntimeBackupMetadata
} from "../runtime/types";
import {
  formatRemoteBackupHistorySummary,
  formatRemoteBackupSelectedPullMessage,
  resolveRemoteBackupHistoryBadgePresentation,
  resolveRemoteBackupHistoryComparisonPresentation,
  resolveRemoteBackupHistorySelectionPresentation
} from "./settings-remote-backup-history";

const metadata: RuntimeBackupMetadata = {
  stored_at: "2026-03-12T10:00:00.000Z",
  schema_version: 2,
  created_at: "2026-03-12T09:58:00.000Z",
  updated_at: "2026-03-12T09:59:00.000Z",
  app_version: "0.0.1",
  checksum: "checksum-remote",
  conversation_count: 2,
  snapshot_id: "snap-remote",
  device_id: "device-remote",
  is_protected: false
};

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

describe("settings remote backup history", () => {
  it("formats selected history snapshot details and selected pull success", () => {
    expect(formatRemoteBackupSelectedPullMessage(metadata)).toBe(
      "已从网关拉取所选快照（2 个会话）"
    );

    expect(
      resolveRemoteBackupHistorySelectionPresentation(metadata, metadata.snapshot_id)
    ).toMatchObject({
      statusLabel: "当前选择：云端最新快照",
      snapshotIdLabel: "快照 ID：snap-remote",
      deviceIdLabel: "设备 ID：device-remote",
      conversationCountLabel: "会话数：2",
      protectionLabel: "保护状态：未保护"
    });
  });

  it("formats protected snapshot history summary and labels", () => {
    const protectedMetadata = {
      ...metadata,
      snapshot_id: "snap-protected",
      is_protected: true,
      protected_at: "2026-03-12T10:06:00.000Z"
    };

    expect(
      formatRemoteBackupHistorySummary([protectedMetadata, metadata])
    ).toBe("云端保留历史：2 条（已保护 1 条）");

    expect(
      resolveRemoteBackupHistorySelectionPresentation(
        protectedMetadata,
        protectedMetadata.snapshot_id
      )
    ).toMatchObject({
      protectionLabel: "保护状态：已保护",
      protectedAtLabel: expect.stringContaining("保护时间：")
    });
  });

  it("formats selected history preflight comparison against the current local snapshot", () => {
    expect(
      resolveRemoteBackupHistoryComparisonPresentation(localSummary, {
        ...metadata,
        checksum: "checksum-remote-diverged",
        snapshot_id: "snap-remote-diverged",
        updated_at: "2026-03-12T10:05:00.000Z"
      })
    ).toEqual({
      relationLabel: "与本地关系：存在分叉",
      recommendation:
        "当前所选云端快照与本地存在分叉，建议先拉取该快照预览，再决定合并或覆盖。"
    });
  });

  it("formats compact relation badges for retained history list items", () => {
    expect(
      resolveRemoteBackupHistoryBadgePresentation(localSummary, {
        ...metadata,
        checksum: "checksum-local",
        snapshot_id: "snap-same"
      })
    ).toEqual({
      label: "内容一致",
      relation: "identical"
    });

    expect(
      resolveRemoteBackupHistoryBadgePresentation(localSummary, {
        ...metadata,
        checksum: "checksum-remote-diverged",
        snapshot_id: "snap-remote-diverged",
        updated_at: "2026-03-12T10:05:00.000Z"
      })
    ).toEqual({
      label: "已分叉",
      relation: "diverged"
    });
  });
});

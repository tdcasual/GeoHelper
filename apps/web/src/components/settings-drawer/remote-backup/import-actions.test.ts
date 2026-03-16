import { describe, expect, it, vi } from "vitest";

import type { BackupEnvelope, ImportRollbackAnchor } from "../../../storage/backup";
import { createRemoteBackupImportActions } from "./import-actions";
import type { RemoteBackupPulledResult } from "./sync-actions";

const rollbackAnchor: ImportRollbackAnchor = {
  capturedAt: "2026-03-16T00:00:00.000Z",
  source: "local_file",
  importMode: "merge",
  sourceDetail: "lesson-a.json",
  envelope: {
    schema_version: 2,
    created_at: "2026-03-12T09:58:00.000Z",
    updated_at: "2026-03-12T10:05:00.000Z",
    app_version: "0.0.1",
    checksum: "checksum-local",
    snapshot_id: "snap-local",
    device_id: "device-local",
    conversations: [],
    settings: {}
  }
};

const resultEnvelope: BackupEnvelope = {
  ...rollbackAnchor.envelope,
  snapshot_id: "snap-local-after"
};

const remoteBackupPullResult: RemoteBackupPulledResult = {
  build: {
    git_sha: "sha",
    build_time: "2026-03-16T00:00:00.000Z",
    node_env: "test",
    redis_enabled: false,
    attachments_enabled: true
  },
  backup: {
    stored_at: "2026-03-16T00:00:00.000Z",
    schema_version: 2,
    created_at: "2026-03-12T09:58:00.000Z",
    updated_at: "2026-03-12T10:05:00.000Z",
    app_version: "0.0.1",
    checksum: "checksum-remote",
    conversation_count: 0,
    snapshot_id: "snap-remote",
    device_id: "device-remote",
    is_protected: false,
    envelope: resultEnvelope
  },
  pullSource: "latest",
  localSummaryAtPull: {
    schema_version: 2,
    created_at: "2026-03-12T09:58:00.000Z",
    updated_at: "2026-03-12T10:05:00.000Z",
    app_version: "0.0.1",
    checksum: "checksum-local",
    conversation_count: 0,
    snapshot_id: "snap-local",
    device_id: "device-local"
  },
  localEnvelopeAtPull: rollbackAnchor.envelope
};

describe("remote-backup import actions", () => {
  it("captures rollback anchor before importing a local file", async () => {
    const calls: string[] = [];
    const captureCurrentAppImportRollbackAnchor = vi.fn(async () => {
      calls.push("capture");
      return rollbackAnchor;
    });
    const importAppBackupToLocalStorage = vi.fn(async () => {
      calls.push("import");
    });
    const actions = createRemoteBackupImportActions({
      loadBackupModule: vi.fn(async () => ({
        captureCurrentAppImportRollbackAnchor,
        importAppBackupToLocalStorage,
        recordCurrentAppImportRollbackResult: vi.fn(async () => ({
          ...rollbackAnchor,
          resultEnvelope
        })),
        restoreImportRollbackAnchorToLocalStorage: vi.fn(),
        clearImportRollbackAnchor: vi.fn(),
        importRemoteBackupToLocalStorage: vi.fn(),
        inspectBackup: vi.fn(),
        readImportRollbackAnchor: vi.fn()
      })),
      pendingBackupFile: { name: "lesson-a.json" } as File,
      remoteBackupPullResult,
      setPendingBackupFile: vi.fn(),
      setBackupInspection: vi.fn(),
      setImportRollbackAnchor: vi.fn(),
      setRollbackAnchorCurrentLocalEnvelope: vi.fn(),
      setImportingBackup: vi.fn(),
      setRollbackAnchorBusy: vi.fn(),
      setRemoteSyncImportInProgress: vi.fn(),
      setBackupMessage: vi.fn(),
      setLocalMergeImportArmed: vi.fn(),
      setLocalReplaceImportArmed: vi.fn(),
      setRemoteMergeImportArmed: vi.fn(),
      setRemoteReplaceImportArmed: vi.fn(),
      setRemoteBackupBusyAction: vi.fn(),
      scheduleReload: vi.fn()
    });

    await actions.handleImportBackup("merge");

    expect(captureCurrentAppImportRollbackAnchor).toHaveBeenCalledWith({
      source: "local_file",
      importMode: "merge",
      sourceDetail: "lesson-a.json"
    });
    expect(importAppBackupToLocalStorage).toHaveBeenCalled();
    expect(calls).toEqual(["capture", "import"]);
  });
});

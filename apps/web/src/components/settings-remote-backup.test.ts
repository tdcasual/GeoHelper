import { describe, expect, it } from "vitest";

import * as remoteBackupHelpers from "./settings-remote-backup";
import { resolveRemoteBackupActions } from "./settings-remote-backup-actions";
import { resolveRemoteBackupHistorySelectionPresentation } from "./settings-remote-backup-history";
import { resolveImportActionGuardPresentation } from "./settings-remote-backup-import";
import { resolveRemoteBackupSyncPresentation } from "./settings-remote-backup-sync";

describe("settings remote backup facade", () => {
  it("re-exports action, history, import, and sync helpers", () => {
    expect(remoteBackupHelpers.resolveRemoteBackupActions).toBe(
      resolveRemoteBackupActions
    );
    expect(remoteBackupHelpers.resolveRemoteBackupHistorySelectionPresentation).toBe(
      resolveRemoteBackupHistorySelectionPresentation
    );
    expect(remoteBackupHelpers.resolveImportActionGuardPresentation).toBe(
      resolveImportActionGuardPresentation
    );
    expect(remoteBackupHelpers.resolveRemoteBackupSyncPresentation).toBe(
      resolveRemoteBackupSyncPresentation
    );
  });
});

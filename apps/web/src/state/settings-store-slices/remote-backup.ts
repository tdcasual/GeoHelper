import type {
  RuntimeBackupCompareResponse,
  RuntimeBackupMetadata
} from "../../runtime/types";
import type {
  RemoteBackupSyncResultInput,
  RemoteBackupSyncState,
  SettingsStoreState
} from "../settings-store";

type SettingsSet = (
  updater: (state: SettingsStoreState) => Partial<SettingsStoreState> | {}
) => void;

type PersistableSettingsState = Omit<SettingsStoreState, "drawerOpen"> & {
  drawerOpen?: boolean;
};

interface RemoteBackupSliceDeps {
  set: SettingsSet;
  saveState: (state: PersistableSettingsState) => void;
}

export const createInitialRemoteBackupSyncState = (): RemoteBackupSyncState => ({
  status: "idle",
  latestRemoteBackup: null,
  history: [],
  lastComparison: null,
  lastCheckedAt: null,
  lastError: null
});

export const applyRemoteBackupSnapshotToHistory = (
  history: RuntimeBackupMetadata[],
  backup: RuntimeBackupMetadata
): RuntimeBackupMetadata[] => {
  const existing = history.some((item) => item.snapshot_id === backup.snapshot_id);
  if (existing) {
    return history.map((item) =>
      item.snapshot_id === backup.snapshot_id ? backup : item
    );
  }

  return [backup, ...history];
};

export const applyRemoteBackupSnapshotToComparison = (
  comparison: RuntimeBackupCompareResponse | null,
  backup: RuntimeBackupMetadata
): RuntimeBackupCompareResponse | null => {
  if (!comparison?.remote_snapshot) {
    return comparison;
  }

  if (comparison.remote_snapshot.summary.snapshot_id !== backup.snapshot_id) {
    return comparison;
  }

  return {
    ...comparison,
    remote_snapshot: {
      summary: backup
    }
  };
};

export const mapComparisonResultToSyncStatus = (
  result: RuntimeBackupCompareResponse["comparison_result"]
) => (result === "identical" ? "up_to_date" : result);

export const createRemoteBackupActions = (deps: RemoteBackupSliceDeps) => ({
  setRemoteBackupSyncMode: (mode: SettingsStoreState["remoteBackupSyncPreferences"]["mode"]) =>
    deps.set((state) => {
      const next = {
        ...state,
        remoteBackupSyncPreferences: {
          mode
        }
      };
      deps.saveState(next);
      return {
        remoteBackupSyncPreferences: {
          mode
        }
      };
    }),
  beginRemoteBackupSyncCheck: () =>
    deps.set((state) => ({
      remoteBackupSync: {
        ...state.remoteBackupSync,
        status: "checking",
        lastError: null
      }
    })),
  beginRemoteBackupSyncUpload: () =>
    deps.set((state) => ({
      remoteBackupSync: {
        ...state.remoteBackupSync,
        status: "uploading",
        lastError: null
      }
    })),
  setRemoteBackupSyncResult: (input: RemoteBackupSyncResultInput) =>
    deps.set((state) => ({
      remoteBackupSync: {
        status:
          input.status ??
          mapComparisonResultToSyncStatus(input.comparison.comparison_result),
        latestRemoteBackup:
          input.latestRemoteBackup ??
          input.comparison.remote_snapshot?.summary ??
          state.remoteBackupSync.latestRemoteBackup,
        history: input.history ?? state.remoteBackupSync.history,
        lastComparison: input.comparison,
        lastCheckedAt: input.checkedAt ?? state.remoteBackupSync.lastCheckedAt,
        lastError: null
      }
    })),
  setRemoteBackupSyncError: (message: string) =>
    deps.set((state) => ({
      remoteBackupSync: {
        ...state.remoteBackupSync,
        status: "idle",
        lastComparison: null,
        lastError: message
      }
    })),
  applyRemoteBackupSnapshotUpdate: (backup: RuntimeBackupMetadata) =>
    deps.set((state) => {
      const history = applyRemoteBackupSnapshotToHistory(
        state.remoteBackupSync.history,
        backup
      );
      const latestRemoteBackup =
        state.remoteBackupSync.latestRemoteBackup?.snapshot_id === backup.snapshot_id
          ? backup
          : state.remoteBackupSync.latestRemoteBackup;

      return {
        remoteBackupSync: {
          ...state.remoteBackupSync,
          latestRemoteBackup,
          history,
          lastComparison: applyRemoteBackupSnapshotToComparison(
            state.remoteBackupSync.lastComparison,
            backup
          )
        }
      };
    })
});

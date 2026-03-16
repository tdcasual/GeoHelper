import type { ChangeEventHandler, RefObject } from "react";

import type {
  RuntimeBackupComparableSummary,
  RuntimeBackupDownloadResponse,
  RuntimeBackupMetadata
} from "../../runtime/types";
import type {
  DebugEvent,
  RemoteBackupSyncMode,
  RemoteBackupSyncState
} from "../../state/settings-store";
import type { BackupInspection } from "../../storage/backup";
import type {
  ImportActionGuardPresentation,
  ImportRollbackAnchorPresentation,
  RemoteBackupActionState,
  RemoteBackupHistoryComparisonPresentation,
  RemoteBackupHistorySelectionPresentation,
  RemoteBackupPulledConversationImpactPresentation,
  RemoteBackupPulledPreviewGuardPresentation,
  RemoteBackupPulledPreviewPresentation,
  RemoteBackupSyncPresentation
} from "../settings-remote-backup";
import { DataMaintenanceSection } from "./data-section/DataMaintenanceSection";
import { ImportRollbackSection } from "./data-section/ImportRollbackSection";
import { LocalBackupSection } from "./data-section/LocalBackupSection";
import { RemoteBackupSection } from "./data-section/RemoteBackupSection";

export interface SettingsDataSectionProps {
  backupInputRef: RefObject<HTMLInputElement | null>;
  pendingBackupFile: File | null;
  backupInspection: BackupInspection | null;
  localImportGuardWarning: string | null;
  importingBackup: boolean;
  localMergeImportGuardPresentation: ImportActionGuardPresentation;
  localReplaceImportGuardPresentation: ImportActionGuardPresentation;
  localReplaceImportArmed: boolean;
  importRollbackAnchorCapturedAt: string | null;
  importRollbackAnchorPresentation: ImportRollbackAnchorPresentation | null;
  rollbackAnchorBusy: boolean;
  remoteBackupBusyAction: string | null;
  remoteBackupAdminTokenDraft: string;
  remoteBackupAdminTokenSaved: boolean;
  remoteBackupSyncMode: RemoteBackupSyncMode;
  remoteBackupActions: RemoteBackupActionState;
  remoteBackupSync: RemoteBackupSyncState;
  remoteBackupSyncPresentation: RemoteBackupSyncPresentation;
  remoteBackupHistorySummary: string;
  latestRemoteHistorySnapshotId: string | null;
  selectedRemoteHistoryBackup: RuntimeBackupMetadata | null;
  selectedRemoteHistoryPresentation: RemoteBackupHistorySelectionPresentation | null;
  selectedRemoteHistoryComparisonPresentation: RemoteBackupHistoryComparisonPresentation | null;
  remoteBackupLocalSummary: RuntimeBackupComparableSummary | null;
  remoteBackupPullResult: RuntimeBackupDownloadResponse | null;
  remoteBackupPulledPreviewPresentation: RemoteBackupPulledPreviewPresentation | null;
  remoteBackupPulledPreviewGuardPresentation: RemoteBackupPulledPreviewGuardPresentation | null;
  remoteBackupPulledConversationImpactPresentation: RemoteBackupPulledConversationImpactPresentation | null;
  remoteImportGuardWarning: string | null;
  remoteMergeImportGuardPresentation: ImportActionGuardPresentation;
  remoteReplaceImportGuardPresentation: ImportActionGuardPresentation;
  remoteReplaceImportArmed: boolean;
  backupMessage: string | null;
  debugEvents: DebugEvent[];
  onExportBackup: () => void;
  onLocalMergeImport: () => void;
  onLocalReplaceImport: () => void;
  onCancelLocalImport: () => void;
  onRestoreImportRollbackAnchor: () => void;
  onClearImportRollbackAnchor: () => void;
  onRemoteBackupAdminTokenDraftChange: (value: string) => void;
  onRemoteBackupSyncModeChange: (mode: RemoteBackupSyncMode) => void;
  onSelectRemoteHistorySnapshot: (snapshotId: string) => void;
  onToggleRemoteHistoryProtection: () => void;
  onPullSelectedHistorySnapshot: () => void;
  onSaveRemoteBackupAdminToken: () => void;
  onClearRemoteBackupAdminToken: () => void;
  onCheckRemoteBackupSync: () => void;
  onUploadRemoteBackup: () => void;
  onPullLatestRemoteBackup: () => void;
  onForceUploadRemoteBackup: () => void;
  onRemoteMergeImport: () => void;
  onRemoteReplaceImport: () => void;
  onClearRemotePullResult: () => void;
  onBackupInputChange: ChangeEventHandler<HTMLInputElement>;
  onClearStoredSecrets: () => void;
  onClearDebugEvents: () => void;
}

export const SettingsDataSection = ({
  backupInputRef,
  backupMessage,
  onBackupInputChange,
  ...props
}: SettingsDataSectionProps) => (
  <>
    <section className="settings-section">
      <LocalBackupSection backupInputRef={backupInputRef} {...props} />
      <ImportRollbackSection {...props} />
    </section>

    <RemoteBackupSection {...props} />

    <input
      ref={backupInputRef}
      type="file"
      accept="application/json"
      hidden
      onChange={onBackupInputChange}
    />
    {backupMessage ? <p className="settings-hint">{backupMessage}</p> : null}

    <DataMaintenanceSection {...props} />
  </>
);

import type {
  RemoteBackupSyncState,
  RuntimeProfile
} from "../../../state/settings-store";
import type { BackupEnvelope, ImportRollbackAnchor } from "../../../storage/backup";
import {
  formatRemoteBackupHistorySummary,
  resolveImportActionGuardPresentation,
  resolveImportRollbackAnchorPresentation,
  resolveRemoteBackupActions,
  resolveRemoteBackupHistoryComparisonPresentation,
  resolveRemoteBackupHistorySelectionPresentation,
  resolveRemoteBackupPulledConversationImpactPresentation,
  resolveRemoteBackupPulledPreviewGuardPresentation,
  resolveRemoteBackupPulledPreviewPresentation,
  resolveRemoteBackupSyncPresentation
} from "../../settings-remote-backup";
import type { RemoteBackupPulledResult } from "./sync-actions";

export interface RemoteBackupDerivedStateInput {
  runtimeProfiles: RuntimeProfile[];
  defaultRuntimeProfileId: string;
  remoteBackupAdminTokenCipher: unknown;
  remoteBackupSync: RemoteBackupSyncState;
  remoteBackupPullResult: RemoteBackupPulledResult | null;
  selectedRemoteHistorySnapshotId: string | null;
  importRollbackAnchor: ImportRollbackAnchor | null;
  rollbackAnchorCurrentLocalEnvelope: BackupEnvelope | null;
  localMergeImportArmed: boolean;
  localReplaceImportArmed: boolean;
  remoteMergeImportArmed: boolean;
  remoteReplaceImportArmed: boolean;
}

export const buildRemoteBackupDerivedState = (
  input: RemoteBackupDerivedStateInput
) => {
  const remoteBackupActions = resolveRemoteBackupActions({
    runtimeProfiles: input.runtimeProfiles,
    defaultRuntimeProfileId: input.defaultRuntimeProfileId,
    hasAdminToken: Boolean(input.remoteBackupAdminTokenCipher),
    hasPulledBackup: Boolean(input.remoteBackupPullResult)
  });
  const remoteBackupSyncPresentation = resolveRemoteBackupSyncPresentation(
    input.remoteBackupSync
  );
  const latestRemoteHistorySnapshotId =
    input.remoteBackupSync.history[0]?.snapshot_id ??
    input.remoteBackupSync.latestRemoteBackup?.snapshot_id ??
    null;
  const selectedRemoteHistoryBackup =
    input.remoteBackupSync.history.find(
      (backup) => backup.snapshot_id === input.selectedRemoteHistorySnapshotId
    ) ?? input.remoteBackupSync.history[0] ?? null;
  const selectedRemoteHistoryPresentation = selectedRemoteHistoryBackup
    ? resolveRemoteBackupHistorySelectionPresentation(
        selectedRemoteHistoryBackup,
        latestRemoteHistorySnapshotId
      )
    : null;
  const remoteBackupLocalSummary =
    input.remoteBackupSync.lastComparison?.local_snapshot.summary ?? null;
  const selectedRemoteHistoryComparisonPresentation =
    resolveRemoteBackupHistoryComparisonPresentation(
      remoteBackupLocalSummary,
      selectedRemoteHistoryBackup
    );
  const remoteBackupHistorySummary = formatRemoteBackupHistorySummary(
    input.remoteBackupSync.history
  );
  const remoteBackupPulledPreviewPresentation = input.remoteBackupPullResult
    ? resolveRemoteBackupPulledPreviewPresentation({
        source: input.remoteBackupPullResult.pullSource,
        localSummary: input.remoteBackupPullResult.localSummaryAtPull,
        pulledBackup: input.remoteBackupPullResult.backup
      })
    : null;
  const remoteBackupPulledPreviewGuardPresentation = input.remoteBackupPullResult
    ? resolveRemoteBackupPulledPreviewGuardPresentation({
        source: input.remoteBackupPullResult.pullSource,
        pulledSnapshotId: input.remoteBackupPullResult.backup.snapshot_id,
        selectedSnapshotId: selectedRemoteHistoryBackup?.snapshot_id ?? null
      })
    : null;
  const remoteBackupPulledConversationImpactPresentation =
    input.remoteBackupPullResult
      ? resolveRemoteBackupPulledConversationImpactPresentation({
          localEnvelopeAtPull: input.remoteBackupPullResult.localEnvelopeAtPull,
          pulledEnvelope: input.remoteBackupPullResult.backup.envelope
        })
      : null;
  const importRollbackAnchorPresentation = input.importRollbackAnchor
    ? resolveImportRollbackAnchorPresentation(
        input.importRollbackAnchor,
        input.rollbackAnchorCurrentLocalEnvelope
      )
    : null;
  const localMergeImportGuardPresentation = resolveImportActionGuardPresentation({
    scope: "local",
    mode: "merge",
    armed: input.localMergeImportArmed,
    hasRollbackAnchor: Boolean(input.importRollbackAnchor),
    anchorSourceLabel: importRollbackAnchorPresentation?.sourceLabel ?? null
  });
  const localReplaceImportGuardPresentation = resolveImportActionGuardPresentation({
    scope: "local",
    mode: "replace",
    armed: input.localReplaceImportArmed,
    hasRollbackAnchor: Boolean(input.importRollbackAnchor),
    anchorSourceLabel: importRollbackAnchorPresentation?.sourceLabel ?? null
  });
  const remoteMergeImportGuardPresentation = resolveImportActionGuardPresentation({
    scope: "remote_pulled",
    mode: "merge",
    armed: input.remoteMergeImportArmed,
    hasRollbackAnchor: Boolean(input.importRollbackAnchor),
    anchorSourceLabel: importRollbackAnchorPresentation?.sourceLabel ?? null
  });
  const remoteReplaceImportGuardPresentation = resolveImportActionGuardPresentation({
    scope: "remote_pulled",
    mode: "replace",
    armed: input.remoteReplaceImportArmed,
    hasRollbackAnchor: Boolean(input.importRollbackAnchor),
    anchorSourceLabel: importRollbackAnchorPresentation?.sourceLabel ?? null
  });
  const localImportGuardWarning = input.localMergeImportArmed
    ? localMergeImportGuardPresentation.warning
    : input.localReplaceImportArmed
      ? localReplaceImportGuardPresentation.warning
      : null;
  const remoteImportGuardWarning = input.remoteMergeImportArmed
    ? remoteMergeImportGuardPresentation.warning
    : input.remoteReplaceImportArmed
      ? remoteReplaceImportGuardPresentation.warning
      : null;

  return {
    remoteBackupActions,
    remoteBackupSyncPresentation,
    latestRemoteHistorySnapshotId,
    selectedRemoteHistoryBackup,
    selectedRemoteHistoryPresentation,
    remoteBackupLocalSummary,
    selectedRemoteHistoryComparisonPresentation,
    remoteBackupHistorySummary,
    remoteBackupPulledPreviewPresentation,
    remoteBackupPulledPreviewGuardPresentation,
    remoteBackupPulledConversationImpactPresentation,
    importRollbackAnchorPresentation,
    localMergeImportGuardPresentation,
    localReplaceImportGuardPresentation,
    remoteMergeImportGuardPresentation,
    remoteReplaceImportGuardPresentation,
    localImportGuardWarning,
    remoteImportGuardWarning
  };
};

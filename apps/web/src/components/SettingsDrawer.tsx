import { ChangeEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  compareGatewayBackup,
  downloadGatewayBackup,
  fetchGatewayBackupHistory,
  protectGatewayBackupSnapshot,
  unprotectGatewayBackupSnapshot,
  uploadGatewayBackup,
  uploadGatewayBackupGuarded
} from "../runtime/runtime-service";
import {
  ChatMode,
  type RemoteBackupSyncStatus,
  type RuntimeBackupComparableSummary,
  type RuntimeBackupCompareResponse,
  type RuntimeBackupDownloadResponse,
  type RuntimeBackupGuardedUploadConflictResponse,
  type RuntimeBackupMetadata,
  type RuntimeBuildIdentity
} from "../runtime/types";
import {
  ByokPreset,
  OfficialPreset,
  RuntimeProfile,
  useSettingsStore
} from "../state/settings-store";
import {
  BACKUP_FILENAME,
  type BackupEnvelope,
  BackupImportMode,
  BackupInspection,
  captureCurrentAppImportRollbackAnchor,
  clearImportRollbackAnchor,
  exportCurrentAppBackup,
  exportCurrentAppBackupEnvelope,
  importAppBackupToLocalStorage,
  importRemoteBackupToLocalStorage,
  inspectBackup,
  readImportRollbackAnchor,
  recordCurrentAppImportRollbackResult,
  restoreImportRollbackAnchorToLocalStorage
} from "../storage/backup";
import { setRemoteSyncImportInProgress } from "../storage/remote-sync";
import { SettingsDataSection } from "./settings-drawer/SettingsDataSection";
import { SettingsExperimentsSection } from "./settings-drawer/SettingsExperimentsSection";
import {
  createComparableSummaryFromBackupEnvelope,
  formatRemoteBackupActionMessage,
  formatRemoteBackupHistorySummary,
  formatRemoteBackupProtectionActionMessage,
  formatRemoteBackupProtectionLimitMessage,
  formatRemoteBackupSelectedPullMessage,
  type RemoteBackupPullSource,
  resolveImportActionGuardPresentation,
  resolveImportRollbackAnchorPresentation,
  resolveRemoteBackupActions,
  resolveRemoteBackupHistoryComparisonPresentation,
  resolveRemoteBackupHistorySelectionPresentation,
  resolveRemoteBackupPulledConversationImpactPresentation,
  resolveRemoteBackupPulledPreviewGuardPresentation,
  resolveRemoteBackupPulledPreviewPresentation,
  resolveRemoteBackupSyncPresentation
} from "./settings-remote-backup";

interface SettingsDrawerProps {
  open: boolean;
  activeConversationId: string | null;
  currentMode: ChatMode;
  onClose: () => void;
  onApplyMode: (mode: ChatMode) => void;
}

interface RemoteBackupPulledResult extends RuntimeBackupDownloadResponse {
  pullSource: RemoteBackupPullSource;
  localSummaryAtPull: RuntimeBackupComparableSummary;
  localEnvelopeAtPull: BackupEnvelope;
}

interface ByokDraft {
  id?: string;
  name: string;
  model: string;
  endpoint: string;
  temperature: string;
  maxTokens: string;
  timeoutMs: string;
  apiKey: string;
}

interface OfficialDraft {
  id?: string;
  name: string;
  model: string;
  temperature: string;
  maxTokens: string;
  timeoutMs: string;
}

interface RuntimeDraft {
  id: string;
  name: string;
  target: "gateway" | "direct";
  baseUrl: string;
}

type SettingsSectionId =
  | "general"
  | "models"
  | "session"
  | "experiments"
  | "data";

const SETTINGS_SECTIONS: Array<{ id: SettingsSectionId; label: string }> = [
  { id: "general", label: "通用" },
  { id: "models", label: "模型与预设" },
  { id: "session", label: "当前会话" },
  { id: "experiments", label: "实验功能" },
  { id: "data", label: "数据与安全" }
];

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

const getFocusableElements = (container: HTMLElement | null) => {
  if (!container) {
    return [] as HTMLElement[];
  }

  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getAttribute("aria-hidden") !== "true"
  );
};

const fromByokPreset = (preset: ByokPreset | undefined): ByokDraft => ({
  id: preset?.id,
  name: preset?.name ?? "",
  model: preset?.model ?? "gpt-4o-mini",
  endpoint: preset?.endpoint ?? "",
  temperature: String(preset?.temperature ?? 0.2),
  maxTokens: String(preset?.maxTokens ?? 1200),
  timeoutMs: String(preset?.timeoutMs ?? 20_000),
  apiKey: ""
});

const makeEmptyByokDraft = (): ByokDraft => ({
  id: undefined,
  name: "",
  model: "gpt-4o-mini",
  endpoint: "",
  temperature: "0.2",
  maxTokens: "1200",
  timeoutMs: "20000",
  apiKey: ""
});

const fromOfficialPreset = (
  preset: OfficialPreset | undefined
): OfficialDraft => ({
  id: preset?.id,
  name: preset?.name ?? "",
  model: preset?.model ?? "gpt-4o-mini",
  temperature: String(preset?.temperature ?? 0.2),
  maxTokens: String(preset?.maxTokens ?? 1200),
  timeoutMs: String(preset?.timeoutMs ?? 20_000)
});

const makeEmptyOfficialDraft = (): OfficialDraft => ({
  id: undefined,
  name: "",
  model: "gpt-4o-mini",
  temperature: "0.2",
  maxTokens: "1200",
  timeoutMs: "20000"
});

const fromRuntimeProfile = (profile: RuntimeProfile | undefined): RuntimeDraft => ({
  id: profile?.id ?? "runtime_direct",
  name: profile?.name ?? "Direct BYOK",
  target: profile?.target ?? "direct",
  baseUrl: profile?.baseUrl ?? ""
});

const MANUAL_REMOTE_OVERWRITE_BLOCKED_STATUSES = new Set<RemoteBackupSyncStatus>([
  "remote_newer",
  "diverged",
  "upload_blocked_remote_newer",
  "upload_blocked_diverged",
  "upload_conflict",
  "force_upload_required"
]);

const shouldEscalateManualRemoteOverwrite = (
  status: RemoteBackupSyncStatus
): boolean => MANUAL_REMOTE_OVERWRITE_BLOCKED_STATUSES.has(status);

const createRemoteBackupIdenticalComparison = (input: {
  localSummary: RuntimeBackupComparableSummary;
  remoteBackup: RuntimeBackupMetadata;
  build: RuntimeBuildIdentity;
}): RuntimeBackupCompareResponse => ({
  local_status: "summary",
  remote_status: "available",
  comparison_result: "identical",
  local_snapshot: {
    summary: input.localSummary
  },
  remote_snapshot: {
    summary: input.remoteBackup
  },
  build: input.build
});

const createRemoteBackupGuardedConflictComparison = (input: {
  localSummary: RuntimeBackupComparableSummary;
  response: RuntimeBackupGuardedUploadConflictResponse;
  fallbackRemoteBackup: RuntimeBackupMetadata | null;
}): RuntimeBackupCompareResponse => {
  const remoteSummary =
    input.response.actual_remote_snapshot?.summary ?? input.fallbackRemoteBackup;

  return {
    local_status: "summary",
    remote_status: remoteSummary ? "available" : "missing",
    comparison_result: input.response.comparison_result,
    local_snapshot: {
      summary: input.localSummary
    },
    remote_snapshot: remoteSummary ? { summary: remoteSummary } : null,
    build: input.response.build
  };
};

export const SettingsDrawer = ({
  open,
  activeConversationId,
  currentMode,
  onClose,
  onApplyMode
}: SettingsDrawerProps) => {
  const defaultMode = useSettingsStore((state) => state.defaultMode);
  const runtimeProfiles = useSettingsStore((state) => state.runtimeProfiles);
  const defaultRuntimeProfileId = useSettingsStore(
    (state) => state.defaultRuntimeProfileId
  );
  const byokPresets = useSettingsStore((state) => state.byokPresets);
  const officialPresets = useSettingsStore((state) => state.officialPresets);
  const defaultByokPresetId = useSettingsStore(
    (state) => state.defaultByokPresetId
  );
  const defaultOfficialPresetId = useSettingsStore(
    (state) => state.defaultOfficialPresetId
  );
  const sessionOverrides = useSettingsStore((state) => state.sessionOverrides);
  const experimentFlags = useSettingsStore((state) => state.experimentFlags);
  const requestDefaults = useSettingsStore((state) => state.requestDefaults);
  const debugEvents = useSettingsStore((state) => state.debugEvents);
  const byokRuntimeIssue = useSettingsStore((state) => state.byokRuntimeIssue);
  const remoteBackupAdminTokenCipher = useSettingsStore(
    (state) => state.remoteBackupAdminTokenCipher
  );
  const remoteBackupSyncPreferences = useSettingsStore(
    (state) => state.remoteBackupSyncPreferences
  );
  const remoteBackupSync = useSettingsStore((state) => state.remoteBackupSync);
  const upsertRuntimeProfile = useSettingsStore(
    (state) => state.upsertRuntimeProfile
  );
  const setDefaultRuntimeProfile = useSettingsStore(
    (state) => state.setDefaultRuntimeProfile
  );
  const setDefaultMode = useSettingsStore((state) => state.setDefaultMode);
  const upsertByokPreset = useSettingsStore((state) => state.upsertByokPreset);
  const removeByokPreset = useSettingsStore((state) => state.removeByokPreset);
  const setDefaultByokPreset = useSettingsStore(
    (state) => state.setDefaultByokPreset
  );
  const upsertOfficialPreset = useSettingsStore(
    (state) => state.upsertOfficialPreset
  );
  const removeOfficialPreset = useSettingsStore(
    (state) => state.removeOfficialPreset
  );
  const setDefaultOfficialPreset = useSettingsStore(
    (state) => state.setDefaultOfficialPreset
  );
  const setSessionOverride = useSettingsStore((state) => state.setSessionOverride);
  const clearSessionOverride = useSettingsStore(
    (state) => state.clearSessionOverride
  );
  const setExperimentFlag = useSettingsStore((state) => state.setExperimentFlag);
  const setDefaultRetryAttempts = useSettingsStore(
    (state) => state.setDefaultRetryAttempts
  );
  const clearDebugEvents = useSettingsStore((state) => state.clearDebugEvents);
  const clearStoredSecrets = useSettingsStore((state) => state.clearStoredSecrets);
  const setRemoteBackupAdminToken = useSettingsStore(
    (state) => state.setRemoteBackupAdminToken
  );
  const readRemoteBackupAdminToken = useSettingsStore(
    (state) => state.readRemoteBackupAdminToken
  );
  const clearRemoteBackupAdminToken = useSettingsStore(
    (state) => state.clearRemoteBackupAdminToken
  );
  const setRemoteBackupSyncMode = useSettingsStore(
    (state) => state.setRemoteBackupSyncMode
  );
  const setByokRuntimeIssue = useSettingsStore(
    (state) => state.setByokRuntimeIssue
  );
  const beginRemoteBackupSyncCheck = useSettingsStore(
    (state) => state.beginRemoteBackupSyncCheck
  );
  const beginRemoteBackupSyncUpload = useSettingsStore(
    (state) => state.beginRemoteBackupSyncUpload
  );
  const setRemoteBackupSyncResult = useSettingsStore(
    (state) => state.setRemoteBackupSyncResult
  );
  const setRemoteBackupSyncError = useSettingsStore(
    (state) => state.setRemoteBackupSyncError
  );
  const applyRemoteBackupSnapshotUpdate = useSettingsStore(
    (state) => state.applyRemoteBackupSnapshotUpdate
  );

  const [selectedByokId, setSelectedByokId] = useState(defaultByokPresetId);
  const [selectedOfficialId, setSelectedOfficialId] = useState(
    defaultOfficialPresetId
  );
  const [selectedRuntimeId, setSelectedRuntimeId] = useState(
    defaultRuntimeProfileId
  );
  const [byokDraft, setByokDraft] = useState<ByokDraft>(
    fromByokPreset(byokPresets.find((item) => item.id === defaultByokPresetId))
  );
  const [officialDraft, setOfficialDraft] = useState<OfficialDraft>(
    fromOfficialPreset(
      officialPresets.find((item) => item.id === defaultOfficialPresetId)
    )
  );
  const [runtimeDraft, setRuntimeDraft] = useState<RuntimeDraft>(
    fromRuntimeProfile(
      runtimeProfiles.find((item) => item.id === defaultRuntimeProfileId)
    )
  );

  const sessionOverride = useMemo(
    () =>
      activeConversationId ? sessionOverrides[activeConversationId] ?? {} : {},
    [activeConversationId, sessionOverrides]
  );
  const [sessionModel, setSessionModel] = useState(sessionOverride.model ?? "");
  const [sessionTemperature, setSessionTemperature] = useState(
    sessionOverride.temperature != null ? String(sessionOverride.temperature) : ""
  );
  const [sessionMaxTokens, setSessionMaxTokens] = useState(
    sessionOverride.maxTokens != null ? String(sessionOverride.maxTokens) : ""
  );
  const [sessionTimeoutMs, setSessionTimeoutMs] = useState(
    sessionOverride.timeoutMs != null ? String(sessionOverride.timeoutMs) : ""
  );
  const [sessionRetryAttempts, setSessionRetryAttempts] = useState(
    sessionOverride.retryAttempts != null
      ? String(sessionOverride.retryAttempts)
      : ""
  );
  const [savingByok, setSavingByok] = useState(false);
  const [savingOfficial, setSavingOfficial] = useState(false);
  const [savingRuntime, setSavingRuntime] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [remoteBackupAdminTokenDraft, setRemoteBackupAdminTokenDraft] =
    useState("");
  const [remoteBackupBusyAction, setRemoteBackupBusyAction] = useState<
    string | null
  >(null);
  const [remoteBackupPullResult, setRemoteBackupPullResult] =
    useState<RemoteBackupPulledResult | null>(null);
  const [selectedRemoteHistorySnapshotId, setSelectedRemoteHistorySnapshotId] =
    useState<string | null>(null);
  const [activeSection, setActiveSection] =
    useState<SettingsSectionId>("general");
  const [pendingBackupFile, setPendingBackupFile] = useState<File | null>(null);
  const [backupInspection, setBackupInspection] =
    useState<BackupInspection | null>(null);
  const [importRollbackAnchor, setImportRollbackAnchor] = useState(() =>
    readImportRollbackAnchor()
  );
  const [rollbackAnchorCurrentLocalEnvelope, setRollbackAnchorCurrentLocalEnvelope] =
    useState<BackupEnvelope | null>(null);
  const [localMergeImportArmed, setLocalMergeImportArmed] = useState(false);
  const [localReplaceImportArmed, setLocalReplaceImportArmed] = useState(false);
  const [remoteMergeImportArmed, setRemoteMergeImportArmed] = useState(false);
  const [remoteReplaceImportArmed, setRemoteReplaceImportArmed] = useState(false);
  const [importingBackup, setImportingBackup] = useState(false);
  const [rollbackAnchorBusy, setRollbackAnchorBusy] = useState(false);
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const modalRef = useRef<HTMLElement | null>(null);
  const remoteBackupActions = useMemo(
    () =>
      resolveRemoteBackupActions({
        runtimeProfiles,
        defaultRuntimeProfileId,
        hasAdminToken: Boolean(remoteBackupAdminTokenCipher),
        hasPulledBackup: Boolean(remoteBackupPullResult)
      }),
    [
      defaultRuntimeProfileId,
      remoteBackupAdminTokenCipher,
      remoteBackupPullResult,
      runtimeProfiles
    ]
  );
  const remoteBackupSyncPresentation = useMemo(
    () => resolveRemoteBackupSyncPresentation(remoteBackupSync),
    [remoteBackupSync]
  );
  const latestRemoteHistorySnapshotId =
    remoteBackupSync.history[0]?.snapshot_id ??
    remoteBackupSync.latestRemoteBackup?.snapshot_id ??
    null;
  const selectedRemoteHistoryBackup = useMemo(
    () =>
      remoteBackupSync.history.find(
        (backup) => backup.snapshot_id === selectedRemoteHistorySnapshotId
      ) ?? remoteBackupSync.history[0] ?? null,
    [remoteBackupSync.history, selectedRemoteHistorySnapshotId]
  );
  const selectedRemoteHistoryPresentation = useMemo(
    () =>
      selectedRemoteHistoryBackup
        ? resolveRemoteBackupHistorySelectionPresentation(
            selectedRemoteHistoryBackup,
            latestRemoteHistorySnapshotId
          )
        : null,
    [latestRemoteHistorySnapshotId, selectedRemoteHistoryBackup]
  );
  const remoteBackupLocalSummary =
    remoteBackupSync.lastComparison?.local_snapshot.summary ?? null;
  const selectedRemoteHistoryComparisonPresentation = useMemo(
    () =>
      resolveRemoteBackupHistoryComparisonPresentation(
        remoteBackupLocalSummary,
        selectedRemoteHistoryBackup
      ),
    [remoteBackupLocalSummary, selectedRemoteHistoryBackup]
  );
  const remoteBackupHistorySummary = useMemo(
    () => formatRemoteBackupHistorySummary(remoteBackupSync.history),
    [remoteBackupSync.history]
  );
  const remoteBackupPulledPreviewPresentation = useMemo(
    () =>
      remoteBackupPullResult
        ? resolveRemoteBackupPulledPreviewPresentation({
            source: remoteBackupPullResult.pullSource,
            localSummary: remoteBackupPullResult.localSummaryAtPull,
            pulledBackup: remoteBackupPullResult.backup
          })
        : null,
    [remoteBackupPullResult]
  );
  const remoteBackupPulledPreviewGuardPresentation = useMemo(
    () =>
      remoteBackupPullResult
        ? resolveRemoteBackupPulledPreviewGuardPresentation({
            source: remoteBackupPullResult.pullSource,
            pulledSnapshotId: remoteBackupPullResult.backup.snapshot_id,
            selectedSnapshotId: selectedRemoteHistoryBackup?.snapshot_id ?? null
          })
        : null,
    [remoteBackupPullResult, selectedRemoteHistoryBackup]
  );
  const remoteBackupPulledConversationImpactPresentation = useMemo(
    () =>
      remoteBackupPullResult
        ? resolveRemoteBackupPulledConversationImpactPresentation({
            localEnvelopeAtPull: remoteBackupPullResult.localEnvelopeAtPull,
            pulledEnvelope: remoteBackupPullResult.backup.envelope
          })
        : null,
    [remoteBackupPullResult]
  );
  const importRollbackAnchorPresentation = useMemo(
    () =>
      importRollbackAnchor
        ? resolveImportRollbackAnchorPresentation(
            importRollbackAnchor,
            rollbackAnchorCurrentLocalEnvelope
          )
        : null,
    [importRollbackAnchor, rollbackAnchorCurrentLocalEnvelope]
  );
  const localMergeImportGuardPresentation = useMemo(
    () =>
      resolveImportActionGuardPresentation({
        scope: "local",
        mode: "merge",
        armed: localMergeImportArmed,
        hasRollbackAnchor: Boolean(importRollbackAnchor),
        anchorSourceLabel: importRollbackAnchorPresentation?.sourceLabel ?? null
      }),
    [
      importRollbackAnchor,
      importRollbackAnchorPresentation,
      localMergeImportArmed
    ]
  );
  const localReplaceImportGuardPresentation = useMemo(
    () =>
      resolveImportActionGuardPresentation({
        scope: "local",
        mode: "replace",
        armed: localReplaceImportArmed,
        hasRollbackAnchor: Boolean(importRollbackAnchor),
        anchorSourceLabel: importRollbackAnchorPresentation?.sourceLabel ?? null
      }),
    [
      importRollbackAnchor,
      importRollbackAnchorPresentation,
      localReplaceImportArmed
    ]
  );
  const remoteMergeImportGuardPresentation = useMemo(
    () =>
      resolveImportActionGuardPresentation({
        scope: "remote_pulled",
        mode: "merge",
        armed: remoteMergeImportArmed,
        hasRollbackAnchor: Boolean(importRollbackAnchor),
        anchorSourceLabel: importRollbackAnchorPresentation?.sourceLabel ?? null
      }),
    [
      importRollbackAnchor,
      importRollbackAnchorPresentation,
      remoteMergeImportArmed
    ]
  );
  const remoteReplaceImportGuardPresentation = useMemo(
    () =>
      resolveImportActionGuardPresentation({
        scope: "remote_pulled",
        mode: "replace",
        armed: remoteReplaceImportArmed,
        hasRollbackAnchor: Boolean(importRollbackAnchor),
        anchorSourceLabel: importRollbackAnchorPresentation?.sourceLabel ?? null
      }),
    [
      importRollbackAnchor,
      importRollbackAnchorPresentation,
      remoteReplaceImportArmed
    ]
  );
  const localImportGuardWarning = localMergeImportArmed
    ? localMergeImportGuardPresentation.warning
    : localReplaceImportArmed
      ? localReplaceImportGuardPresentation.warning
      : null;
  const remoteImportGuardWarning = remoteMergeImportArmed
    ? remoteMergeImportGuardPresentation.warning
    : remoteReplaceImportArmed
      ? remoteReplaceImportGuardPresentation.warning
      : null;
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!byokPresets.some((item) => item.id === selectedByokId)) {
      setSelectedByokId(defaultByokPresetId);
    }
  }, [byokPresets, selectedByokId, defaultByokPresetId]);

  useEffect(() => {
    const preset = byokPresets.find((item) => item.id === selectedByokId);
    setByokDraft(fromByokPreset(preset));
  }, [byokPresets, selectedByokId]);

  useEffect(() => {
    if (!officialPresets.some((item) => item.id === selectedOfficialId)) {
      setSelectedOfficialId(defaultOfficialPresetId);
    }
  }, [officialPresets, selectedOfficialId, defaultOfficialPresetId]);

  useEffect(() => {
    const preset = officialPresets.find((item) => item.id === selectedOfficialId);
    setOfficialDraft(fromOfficialPreset(preset));
  }, [officialPresets, selectedOfficialId]);

  useEffect(() => {
    if (!runtimeProfiles.some((item) => item.id === selectedRuntimeId)) {
      setSelectedRuntimeId(defaultRuntimeProfileId);
    }
  }, [runtimeProfiles, selectedRuntimeId, defaultRuntimeProfileId]);

  useEffect(() => {
    const profile = runtimeProfiles.find((item) => item.id === selectedRuntimeId);
    setRuntimeDraft(fromRuntimeProfile(profile));
  }, [runtimeProfiles, selectedRuntimeId]);

  useEffect(() => {
    if (remoteBackupSync.history.length === 0) {
      setSelectedRemoteHistorySnapshotId(null);
      return;
    }

    if (
      selectedRemoteHistorySnapshotId &&
      remoteBackupSync.history.some(
        (backup) => backup.snapshot_id === selectedRemoteHistorySnapshotId
      )
    ) {
      return;
    }

    setSelectedRemoteHistorySnapshotId(remoteBackupSync.history[0]?.snapshot_id ?? null);
  }, [remoteBackupSync.history, selectedRemoteHistorySnapshotId]);

  useEffect(() => {
    setLocalMergeImportArmed(false);
    setLocalReplaceImportArmed(false);
  }, [pendingBackupFile, backupInspection]);

  useEffect(() => {
    setRemoteMergeImportArmed(false);
    setRemoteReplaceImportArmed(false);
  }, [remoteBackupPullResult, remoteBackupPulledPreviewGuardPresentation?.importEnabled]);

  useEffect(() => {
    setLocalMergeImportArmed(false);
    setLocalReplaceImportArmed(false);
    setRemoteMergeImportArmed(false);
    setRemoteReplaceImportArmed(false);
  }, [importRollbackAnchor]);

  useEffect(() => {
    if (open) {
      setActiveSection("general");
      setImportRollbackAnchor(readImportRollbackAnchor());
    }
  }, [open]);

  useEffect(() => {
    if (!open || !importRollbackAnchor) {
      setRollbackAnchorCurrentLocalEnvelope(null);
      return;
    }

    if (importRollbackAnchor.resultEnvelope) {
      setRollbackAnchorCurrentLocalEnvelope(importRollbackAnchor.resultEnvelope);
    } else {
      setRollbackAnchorCurrentLocalEnvelope(null);
    }

    let cancelled = false;

    void exportCurrentAppBackupEnvelope()
      .then((envelope) => {
        if (cancelled) {
          return;
        }
        setRollbackAnchorCurrentLocalEnvelope(envelope);
      })
      .catch(() => {
        if (!cancelled && !importRollbackAnchor.resultEnvelope) {
          setRollbackAnchorCurrentLocalEnvelope(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, importRollbackAnchor]);

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTarget = closeButtonRef.current ?? modalRef.current;
    requestAnimationFrame(() => focusTarget?.focus());

    return () => {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    setSessionModel(sessionOverride.model ?? "");
    setSessionTemperature(
      sessionOverride.temperature != null ? String(sessionOverride.temperature) : ""
    );
    setSessionMaxTokens(
      sessionOverride.maxTokens != null ? String(sessionOverride.maxTokens) : ""
    );
    setSessionTimeoutMs(
      sessionOverride.timeoutMs != null ? String(sessionOverride.timeoutMs) : ""
    );
    setSessionRetryAttempts(
      sessionOverride.retryAttempts != null
        ? String(sessionOverride.retryAttempts)
        : ""
    );
  }, [sessionOverride]);

  const handleModalKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = getFocusableElements(modalRef.current);
    if (focusableElements.length === 0) {
      event.preventDefault();
      modalRef.current?.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusIsInsideModal =
      !!activeElement && !!modalRef.current?.contains(activeElement);

    if (event.shiftKey) {
      if (!focusIsInsideModal || activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      }
      return;
    }

    if (!focusIsInsideModal || activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  if (!open) {
    return null;
  }

  const handleExportBackup = async () => {
    const blob = await exportCurrentAppBackup();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = BACKUP_FILENAME;
    anchor.click();
    URL.revokeObjectURL(url);
    setBackupMessage("备份已导出");
  };

  const handleImportBackupSelect = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const inspected = await inspectBackup(file);
      setPendingBackupFile(file);
      setBackupInspection(inspected);
      setBackupMessage("已读取备份文件，请选择导入策略");
    } catch {
      setPendingBackupFile(null);
      setBackupInspection(null);
      setBackupMessage("备份读取失败，请检查文件格式");
    } finally {
      event.target.value = "";
    }
  };

  const handleImportBackup = async (mode: BackupImportMode) => {
    if (!pendingBackupFile) {
      return;
    }

    setLocalMergeImportArmed(false);
    setLocalReplaceImportArmed(false);

    try {
      const anchor = await captureCurrentAppImportRollbackAnchor({
        source: "local_file",
        importMode: mode,
        sourceDetail: pendingBackupFile.name
      });
      setImportRollbackAnchor(anchor);
    } catch (error) {
      setBackupMessage(
        error instanceof Error
          ? error.message
          : "导入前恢复锚点创建失败，本次导入已取消"
      );
      return;
    }

    setImportingBackup(true);
    setRemoteSyncImportInProgress(true);
    try {
      await importAppBackupToLocalStorage(pendingBackupFile, { mode });
      const updatedAnchor = await recordCurrentAppImportRollbackResult();
      setImportRollbackAnchor(updatedAnchor);
      if (updatedAnchor.resultEnvelope) {
        setRollbackAnchorCurrentLocalEnvelope(updatedAnchor.resultEnvelope);
      }
      setBackupMessage(
        mode === "merge"
          ? "备份合并导入成功，正在刷新"
          : "备份覆盖导入成功，正在刷新"
      );
      setTimeout(() => {
        window.location.reload();
      }, 300);
    } catch {
      setBackupMessage("备份导入失败，请检查文件格式");
    } finally {
      setRemoteSyncImportInProgress(false);
      setImportingBackup(false);
    }
  };

  const handleRestoreImportRollbackAnchor = async () => {
    setLocalMergeImportArmed(false);
    setLocalReplaceImportArmed(false);
    setRemoteMergeImportArmed(false);
    setRemoteReplaceImportArmed(false);
    setRollbackAnchorBusy(true);
    setRemoteSyncImportInProgress(true);
    try {
      await restoreImportRollbackAnchorToLocalStorage();
      setImportRollbackAnchor(null);
      setRollbackAnchorCurrentLocalEnvelope(null);
      setBackupMessage("已恢复到导入前本地状态，正在刷新");
      setTimeout(() => {
        window.location.reload();
      }, 300);
    } catch (error) {
      setImportRollbackAnchor(readImportRollbackAnchor());
      setBackupMessage(
        error instanceof Error ? error.message : "恢复导入前本地状态失败"
      );
    } finally {
      setRemoteSyncImportInProgress(false);
      setRollbackAnchorBusy(false);
    }
  };

  const handleClearImportRollbackAnchor = () => {
    setLocalMergeImportArmed(false);
    setLocalReplaceImportArmed(false);
    setRemoteMergeImportArmed(false);
    setRemoteReplaceImportArmed(false);
    clearImportRollbackAnchor();
    setImportRollbackAnchor(null);
    setRollbackAnchorCurrentLocalEnvelope(null);
    setBackupMessage("已清除此恢复锚点");
  };

  const handleSaveRemoteBackupAdminToken = async () => {
    const token = remoteBackupAdminTokenDraft.trim();
    if (!token) {
      setBackupMessage("请输入网关管理员令牌");
      return;
    }

    setRemoteBackupBusyAction("save-token");
    try {
      await setRemoteBackupAdminToken(token);
      setRemoteBackupAdminTokenDraft("");
      setBackupMessage("网关管理员令牌已保存");
    } catch (error) {
      setBackupMessage(
        error instanceof Error ? error.message : "管理员令牌保存失败"
      );
    } finally {
      setRemoteBackupBusyAction(null);
    }
  };

  const handleUploadRemoteBackup = async (mode: "guarded" | "force" = "guarded") => {
    if (!remoteBackupActions.upload.enabled || !remoteBackupActions.gatewayProfile) {
      setBackupMessage(
        remoteBackupActions.upload.reason ?? "当前无法上传到网关"
      );
      return;
    }

    if (
      mode === "guarded" &&
      shouldEscalateManualRemoteOverwrite(remoteBackupSync.status) &&
      remoteBackupSync.lastComparison
    ) {
      setRemoteBackupSyncResult({
        status: "force_upload_required",
        latestRemoteBackup: remoteBackupSync.latestRemoteBackup,
        comparison: remoteBackupSync.lastComparison,
        checkedAt: new Date().toISOString()
      });
      setBackupMessage(
        "默认上传不会自动覆盖当前云端快照；如确认本地为准，请点击“仍然覆盖云端快照”。"
      );
      return;
    }

    setRemoteBackupBusyAction(mode === "force" ? "force-upload" : "upload");
    beginRemoteBackupSyncUpload();
    try {
      const adminToken = await readRemoteBackupAdminToken();
      if (!adminToken) {
        throw new Error("请先保存网关管理员令牌");
      }

      const envelope = await exportCurrentAppBackupEnvelope();
      const localSummary =
        remoteBackupSync.lastComparison?.local_snapshot.summary ??
        createComparableSummaryFromBackupEnvelope(envelope);
      if (mode === "guarded") {
        const guardedResponse = await uploadGatewayBackupGuarded({
          baseUrl: remoteBackupActions.gatewayProfile.baseUrl,
          adminToken,
          envelope,
          expectedRemoteSnapshotId:
            remoteBackupSync.latestRemoteBackup?.snapshot_id ?? null,
          expectedRemoteChecksum: remoteBackupSync.latestRemoteBackup?.checksum
        });

        if (guardedResponse.guarded_write === "conflict") {
          const historyResponse = await fetchGatewayBackupHistory({
            baseUrl: remoteBackupActions.gatewayProfile.baseUrl,
            adminToken,
            limit: 5
          }).catch(() => ({
            history: remoteBackupSync.history,
            build: guardedResponse.build
          }));

          setRemoteBackupSyncResult({
            status: "force_upload_required",
            latestRemoteBackup:
              historyResponse.history[0] ??
              guardedResponse.actual_remote_snapshot?.summary ??
              remoteBackupSync.latestRemoteBackup,
            history: historyResponse.history,
            comparison: createRemoteBackupGuardedConflictComparison({
              localSummary,
              response: guardedResponse,
              fallbackRemoteBackup: remoteBackupSync.latestRemoteBackup
            }),
            checkedAt: new Date().toISOString()
          });
          setBackupMessage(
            "云端快照已变化，默认上传未覆盖；如确认本地为准，请点击“仍然覆盖云端快照”。"
          );
          return;
        }

        setRemoteBackupSyncResult({
          latestRemoteBackup: guardedResponse.backup,
          history: [guardedResponse.backup],
          comparison: createRemoteBackupIdenticalComparison({
            localSummary,
            remoteBackup: guardedResponse.backup,
            build: guardedResponse.build
          }),
          checkedAt: new Date().toISOString()
        });
        setBackupMessage(
          formatRemoteBackupActionMessage("push", guardedResponse.backup)
        );
        return;
      }

      const response = await uploadGatewayBackup({
        baseUrl: remoteBackupActions.gatewayProfile.baseUrl,
        adminToken,
        envelope
      });

      setBackupMessage(formatRemoteBackupActionMessage("push", response.backup));
      setRemoteBackupSyncResult({
        latestRemoteBackup: response.backup,
        history: [response.backup],
        comparison: createRemoteBackupIdenticalComparison({
          localSummary,
          remoteBackup: response.backup,
          build: response.build
        }),
        checkedAt: new Date().toISOString()
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "上传到网关失败";
      setRemoteBackupSyncError(message);
      setBackupMessage(message);
    } finally {
      setRemoteBackupBusyAction(null);
    }
  };

  const handleCheckRemoteBackupSync = async () => {
    if (!remoteBackupActions.check.enabled || !remoteBackupActions.gatewayProfile) {
      setBackupMessage(
        remoteBackupActions.check.reason ?? "当前无法检查云端状态"
      );
      return;
    }

    setRemoteBackupBusyAction("check");
    beginRemoteBackupSyncCheck();
    try {
      const adminToken = await readRemoteBackupAdminToken();
      if (!adminToken) {
        throw new Error("请先保存网关管理员令牌");
      }

      const envelope = await exportCurrentAppBackupEnvelope();
      const localSummary = createComparableSummaryFromBackupEnvelope(envelope);
      const [historyResponse, comparison] = await Promise.all([
        fetchGatewayBackupHistory({
          baseUrl: remoteBackupActions.gatewayProfile.baseUrl,
          adminToken,
          limit: 5
        }),
        compareGatewayBackup({
          baseUrl: remoteBackupActions.gatewayProfile.baseUrl,
          adminToken,
          localSummary
        })
      ]);

      setRemoteBackupSyncResult({
        latestRemoteBackup:
          historyResponse.history[0] ?? comparison.remote_snapshot?.summary ?? null,
        history: historyResponse.history,
        comparison,
        checkedAt: new Date().toISOString()
      });
      setBackupMessage("云端状态检查完成");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "检查云端状态失败";
      setRemoteBackupSyncError(message);
      setBackupMessage(message);
    } finally {
      setRemoteBackupBusyAction(null);
    }
  };

  const handlePullRemoteBackup = async (snapshotId?: string) => {
    if (!remoteBackupActions.pull.enabled || !remoteBackupActions.gatewayProfile) {
      setBackupMessage(remoteBackupActions.pull.reason ?? "当前无法从网关拉取");
      return;
    }

    setRemoteBackupBusyAction("pull");
    try {
      const adminToken = await readRemoteBackupAdminToken();
      if (!adminToken) {
        throw new Error("请先保存网关管理员令牌");
      }

      const envelope = await exportCurrentAppBackupEnvelope();
      const localSummary =
        remoteBackupSync.lastComparison?.local_snapshot.summary ??
        createComparableSummaryFromBackupEnvelope(envelope);
      const response = await downloadGatewayBackup({
        baseUrl: remoteBackupActions.gatewayProfile.baseUrl,
        adminToken,
        snapshotId
      });
      setRemoteBackupPullResult({
        ...response,
        pullSource: snapshotId ? "selected_history" : "latest",
        localSummaryAtPull: localSummary,
        localEnvelopeAtPull: envelope
      });
      setBackupMessage(
        snapshotId
          ? formatRemoteBackupSelectedPullMessage(response.backup)
          : formatRemoteBackupActionMessage("pull", response.backup)
      );
    } catch (error) {
      setBackupMessage(
        error instanceof Error ? error.message : "从网关拉取失败"
      );
    } finally {
      setRemoteBackupBusyAction(null);
    }
  };

  const handleUpdateRemoteBackupProtection = async (
    action: "protect" | "unprotect"
  ) => {
    if (!selectedRemoteHistoryBackup) {
      setBackupMessage("请先选择一个云端保留快照");
      return;
    }

    if (!remoteBackupActions.check.enabled || !remoteBackupActions.gatewayProfile) {
      setBackupMessage(
        remoteBackupActions.check.reason ?? "当前无法更新快照保护状态"
      );
      return;
    }

    setRemoteBackupBusyAction(action);
    try {
      const adminToken = await readRemoteBackupAdminToken();
      if (!adminToken) {
        throw new Error("请先保存网关管理员令牌");
      }

      if (action === "protect") {
        const response = await protectGatewayBackupSnapshot({
          baseUrl: remoteBackupActions.gatewayProfile.baseUrl,
          adminToken,
          snapshotId: selectedRemoteHistoryBackup.snapshot_id
        });

        if (response.protection_status === "limit_reached") {
          setBackupMessage(formatRemoteBackupProtectionLimitMessage(response));
          return;
        }

        applyRemoteBackupSnapshotUpdate(response.backup);
        setRemoteBackupPullResult((current) =>
          current?.backup.snapshot_id === response.backup.snapshot_id
            ? {
                ...current,
                backup: {
                  ...current.backup,
                  ...response.backup
                }
              }
            : current
        );
        setBackupMessage(
          formatRemoteBackupProtectionActionMessage("protect", response.backup)
        );
        return;
      }

      const response = await unprotectGatewayBackupSnapshot({
        baseUrl: remoteBackupActions.gatewayProfile.baseUrl,
        adminToken,
        snapshotId: selectedRemoteHistoryBackup.snapshot_id
      });

      applyRemoteBackupSnapshotUpdate(response.backup);
      setRemoteBackupPullResult((current) =>
        current?.backup.snapshot_id === response.backup.snapshot_id
          ? {
              ...current,
              backup: {
                ...current.backup,
                ...response.backup
              }
            }
          : current
      );
      setBackupMessage(
        formatRemoteBackupProtectionActionMessage("unprotect", response.backup)
      );
    } catch (error) {
      setBackupMessage(
        error instanceof Error
          ? error.message
          : action === "protect"
            ? "保护快照失败"
            : "取消保护失败"
      );
    } finally {
      setRemoteBackupBusyAction(null);
    }
  };

  const handleImportPulledRemoteBackup = async (mode: BackupImportMode) => {
    if (!remoteBackupPullResult) {
      setBackupMessage(remoteBackupActions.restore.reason ?? "请先从网关拉取最新备份");
      return;
    }

    setRemoteMergeImportArmed(false);
    setRemoteReplaceImportArmed(false);

    try {
      const anchor = await captureCurrentAppImportRollbackAnchor({
        source:
          remoteBackupPullResult.pullSource === "latest"
            ? "remote_latest"
            : "remote_selected_history",
        importMode: mode,
        sourceDetail: remoteBackupPullResult.backup.snapshot_id
      });
      setImportRollbackAnchor(anchor);
    } catch (error) {
      setBackupMessage(
        error instanceof Error
          ? error.message
          : "导入前恢复锚点创建失败，本次导入已取消"
      );
      return;
    }

    setRemoteBackupBusyAction(`restore-${mode}`);
    setRemoteSyncImportInProgress(true);
    try {
      await importRemoteBackupToLocalStorage(remoteBackupPullResult.backup, {
        mode
      });
      const updatedAnchor = await recordCurrentAppImportRollbackResult();
      setImportRollbackAnchor(updatedAnchor);
      if (updatedAnchor.resultEnvelope) {
        setRollbackAnchorCurrentLocalEnvelope(updatedAnchor.resultEnvelope);
      }
      setBackupMessage(
        mode === "merge"
          ? "已将网关备份合并导入，正在刷新"
          : "已用网关备份覆盖本地数据，正在刷新"
      );
      setTimeout(() => {
        window.location.reload();
      }, 300);
    } catch (error) {
      setBackupMessage(
        error instanceof Error ? error.message : "导入网关备份失败"
      );
    } finally {
      setRemoteSyncImportInProgress(false);
      setRemoteBackupBusyAction(null);
    }
  };

  const handleLocalMergeImport = () => {
    if (localMergeImportGuardPresentation.shouldArmFirst) {
      setLocalReplaceImportArmed(false);
      setLocalMergeImportArmed(true);
      return;
    }

    setLocalMergeImportArmed(false);
    setLocalReplaceImportArmed(false);
    void handleImportBackup("merge");
  };

  const handleLocalReplaceImport = () => {
    if (localReplaceImportGuardPresentation.shouldArmFirst) {
      setLocalMergeImportArmed(false);
      setLocalReplaceImportArmed(true);
      return;
    }

    setLocalMergeImportArmed(false);
    setLocalReplaceImportArmed(false);
    void handleImportBackup("replace");
  };

  const handleCancelLocalImport = () => {
    setLocalMergeImportArmed(false);
    setLocalReplaceImportArmed(false);
    setPendingBackupFile(null);
    setBackupInspection(null);
    setBackupMessage("已取消本次导入");
  };

  const handleToggleSelectedRemoteHistoryProtection = () => {
    if (!selectedRemoteHistoryBackup) {
      return;
    }

    void handleUpdateRemoteBackupProtection(
      selectedRemoteHistoryBackup.is_protected ? "unprotect" : "protect"
    );
  };

  const handlePullSelectedRemoteHistory = () => {
    if (!selectedRemoteHistoryBackup) {
      return;
    }

    void handlePullRemoteBackup(selectedRemoteHistoryBackup.snapshot_id);
  };

  const handleClearRemoteBackupAdminTokenAction = () => {
    clearRemoteBackupAdminToken();
    setRemoteBackupAdminTokenDraft("");
    setBackupMessage("已清除网关管理员令牌");
  };

  const handleRemoteMergeImport = () => {
    if (remoteMergeImportGuardPresentation.shouldArmFirst) {
      setRemoteReplaceImportArmed(false);
      setRemoteMergeImportArmed(true);
      return;
    }

    setRemoteMergeImportArmed(false);
    setRemoteReplaceImportArmed(false);
    void handleImportPulledRemoteBackup("merge");
  };

  const handleRemoteReplaceImport = () => {
    if (remoteReplaceImportGuardPresentation.shouldArmFirst) {
      setRemoteMergeImportArmed(false);
      setRemoteReplaceImportArmed(true);
      return;
    }

    setRemoteMergeImportArmed(false);
    setRemoteReplaceImportArmed(false);
    void handleImportPulledRemoteBackup("replace");
  };

  const handleClearRemotePullResult = () => {
    setRemoteMergeImportArmed(false);
    setRemoteReplaceImportArmed(false);
    setRemoteBackupPullResult(null);
    setBackupMessage("已清除本次网关拉取结果");
  };

  return (
    <div className="settings-drawer-backdrop" onClick={onClose}>
      <aside
        ref={modalRef}
        className="settings-drawer settings-modal"
        data-testid="settings-modal"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleModalKeyDown}
      >
        <header className="settings-drawer-header">
          <h2>设置</h2>
          <button ref={closeButtonRef} type="button" onClick={onClose}>
            关闭
          </button>
        </header>
        <div className="settings-modal-body">
          <nav className="settings-nav" aria-label="设置分区">
            {SETTINGS_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`settings-nav-button${
                  activeSection === section.id ? " settings-nav-button-active" : ""
                }`}
                aria-pressed={activeSection === section.id}
                onClick={() => setActiveSection(section.id)}
              >
                {section.label}
              </button>
            ))}
          </nav>
          <div className="settings-content">
        {activeSection === "general" ? (
        <section className="settings-section settings-section-general">
          <h3>通用</h3>
          <label>
            默认模式
            <select
              value={defaultMode}
              onChange={(event) =>
                setDefaultMode(event.target.value as ChatMode)
              }
            >
              <option value="byok">BYOK</option>
              <option value="official">官方</option>
            </select>
          </label>
          <label>
            默认运行时
            <select
              value={defaultRuntimeProfileId}
              onChange={(event) => setDefaultRuntimeProfile(event.target.value)}
            >
              {runtimeProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {`${profile.name} (${profile.target})`}
                </option>
              ))}
            </select>
          </label>
          <div className="settings-inline-actions">
            <select
              value={selectedRuntimeId}
              onChange={(event) => setSelectedRuntimeId(event.target.value)}
            >
              {runtimeProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {`${profile.name} (${profile.target})`}
                </option>
              ))}
            </select>
          </div>
          <label>
            运行时名称
            <input
              value={runtimeDraft.name}
              onChange={(event) =>
                setRuntimeDraft((prev) => ({
                  ...prev,
                  name: event.target.value
                }))
              }
            />
          </label>
          <label>
            运行时类型
            <select
              value={runtimeDraft.target}
              onChange={(event) =>
                setRuntimeDraft((prev) => ({
                  ...prev,
                  target: event.target.value as "gateway" | "direct"
                }))
              }
              disabled={
                runtimeDraft.id === "runtime_gateway" ||
                runtimeDraft.id === "runtime_direct"
              }
            >
              <option value="gateway">gateway</option>
              <option value="direct">direct</option>
            </select>
          </label>
          <label>
            基础地址（gateway 必填，direct 可选）
            <input
              placeholder={
                runtimeDraft.target === "gateway"
                  ? "https://your-gateway-domain"
                  : "https://openrouter.ai/api/v1"
              }
              value={runtimeDraft.baseUrl}
              onChange={(event) =>
                setRuntimeDraft((prev) => ({
                  ...prev,
                  baseUrl: event.target.value
                }))
              }
            />
          </label>
          <div className="settings-inline-actions">
            <button
              type="button"
              disabled={savingRuntime}
              onClick={() => {
                setSavingRuntime(true);
                const id = upsertRuntimeProfile({
                  id: runtimeDraft.id,
                  name: runtimeDraft.name,
                  target: runtimeDraft.target,
                  baseUrl: runtimeDraft.baseUrl
                });
                setSelectedRuntimeId(id);
                setSavingRuntime(false);
              }}
            >
              保存运行时
            </button>
            <button
              type="button"
              onClick={() => setDefaultRuntimeProfile(selectedRuntimeId)}
            >
              设为默认运行时
            </button>
          </div>
          <div className="settings-inline-actions">
            <span>当前模式：{currentMode}</span>
            <button type="button" onClick={() => onApplyMode(defaultMode)}>
              应用默认模式到当前会话
            </button>
          </div>
        </section>

        ) : null}

        {activeSection === "models" ? (
        <>
        <section className="settings-section" data-testid="settings-byok-section">
          <h3>BYOK 预设</h3>
          {byokRuntimeIssue ? (
            <article className="settings-warning" data-testid="byok-runtime-issue">
              <p>{`检测到密钥不可用：${byokRuntimeIssue.presetName}`}</p>
              <p>{byokRuntimeIssue.message}</p>
              <div className="settings-inline-actions">
                <button
                  type="button"
                  onClick={() => setSelectedByokId(byokRuntimeIssue.presetId)}
                >
                  定位到受影响预设
                </button>
                <button type="button" onClick={() => setByokRuntimeIssue(null)}>
                  忽略提示
                </button>
              </div>
            </article>
          ) : null}
          <div className="settings-inline-actions">
            <select
              value={selectedByokId}
              onChange={(event) => setSelectedByokId(event.target.value)}
            >
              {byokPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setSelectedByokId("__new__");
                setByokDraft(makeEmptyByokDraft());
              }}
            >
              新增
            </button>
          </div>
          <label>
            名称
            <input
              value={byokDraft.name}
              onChange={(event) =>
                setByokDraft((prev) => ({
                  ...prev,
                  name: event.target.value
                }))
              }
            />
          </label>
          <label>模型<input
              data-testid="byok-model-input"
              value={byokDraft.model}
              onChange={(event) =>
                setByokDraft((prev) => ({
                  ...prev,
                  model: event.target.value
                }))
              }
            />
          </label>
          <label>接口地址<input
              data-testid="byok-endpoint-input"
              value={byokDraft.endpoint}
              onChange={(event) =>
                setByokDraft((prev) => ({
                  ...prev,
                  endpoint: event.target.value
                }))
              }
            />
          </label>
          <label>
            API Key（留空表示不更新）
            <input
              data-testid="byok-key-input"
              type="password"
              value={byokDraft.apiKey}
              placeholder="••••••••"
              onChange={(event) =>
                setByokDraft((prev) => ({
                  ...prev,
                  apiKey: event.target.value
                }))
              }
            />
          </label>
          <div className="settings-grid-3">
            <label>温度<input
                type="number"
                step="0.1"
                value={byokDraft.temperature}
                onChange={(event) =>
                  setByokDraft((prev) => ({
                    ...prev,
                    temperature: event.target.value
                  }))
                }
              />
            </label>
            <label>最大 Tokens<input
                type="number"
                value={byokDraft.maxTokens}
                onChange={(event) =>
                  setByokDraft((prev) => ({
                    ...prev,
                    maxTokens: event.target.value
                  }))
                }
              />
            </label>
            <label>超时（毫秒）<input
                type="number"
                value={byokDraft.timeoutMs}
                onChange={(event) =>
                  setByokDraft((prev) => ({
                    ...prev,
                    timeoutMs: event.target.value
                  }))
                }
              />
            </label>
          </div>
          <div className="settings-inline-actions">
            <button
              type="button"
              data-testid="byok-save-button"
              disabled={savingByok}
              onClick={async () => {
                setSavingByok(true);
                const id = await upsertByokPreset({
                  id: byokDraft.id,
                  name: byokDraft.name,
                  model: byokDraft.model,
                  endpoint: byokDraft.endpoint,
                  temperature: Number(byokDraft.temperature),
                  maxTokens: Number(byokDraft.maxTokens),
                  timeoutMs: Number(byokDraft.timeoutMs),
                  apiKey: byokDraft.apiKey
                });
                if (
                  byokDraft.apiKey.trim() &&
                  byokRuntimeIssue?.presetId === id
                ) {
                  setByokRuntimeIssue(null);
                }
                setSelectedByokId(id);
                setSavingByok(false);
              }}
            >
              保存 BYOK 预设
            </button>
            <button
              type="button"
              data-testid="byok-default-button"
              onClick={() => setDefaultByokPreset(selectedByokId)}
            >
              设为默认
            </button>
            <button
              type="button"
              onClick={() => removeByokPreset(selectedByokId)}
              disabled={byokPresets.length <= 1}
            >
              删除
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h3>官方预设</h3>
          <div className="settings-inline-actions">
            <select
              value={selectedOfficialId}
              onChange={(event) => setSelectedOfficialId(event.target.value)}
            >
              {officialPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setSelectedOfficialId("__new__");
                setOfficialDraft(makeEmptyOfficialDraft());
              }}
            >
              新增
            </button>
          </div>
          <label>
            名称
            <input
              value={officialDraft.name}
              onChange={(event) =>
                setOfficialDraft((prev) => ({
                  ...prev,
                  name: event.target.value
                }))
              }
            />
          </label>
          <label>模型<input
              value={officialDraft.model}
              onChange={(event) =>
                setOfficialDraft((prev) => ({
                  ...prev,
                  model: event.target.value
                }))
              }
            />
          </label>
          <div className="settings-grid-3">
            <label>温度<input
                type="number"
                step="0.1"
                value={officialDraft.temperature}
                onChange={(event) =>
                  setOfficialDraft((prev) => ({
                    ...prev,
                    temperature: event.target.value
                  }))
                }
              />
            </label>
            <label>最大 Tokens<input
                type="number"
                value={officialDraft.maxTokens}
                onChange={(event) =>
                  setOfficialDraft((prev) => ({
                    ...prev,
                    maxTokens: event.target.value
                  }))
                }
              />
            </label>
            <label>超时（毫秒）<input
                type="number"
                value={officialDraft.timeoutMs}
                onChange={(event) =>
                  setOfficialDraft((prev) => ({
                    ...prev,
                    timeoutMs: event.target.value
                  }))
                }
              />
            </label>
          </div>
          <div className="settings-inline-actions">
            <button
              type="button"
              disabled={savingOfficial}
              onClick={() => {
                setSavingOfficial(true);
                const id = upsertOfficialPreset({
                  id: officialDraft.id,
                  name: officialDraft.name,
                  model: officialDraft.model,
                  temperature: Number(officialDraft.temperature),
                  maxTokens: Number(officialDraft.maxTokens),
                  timeoutMs: Number(officialDraft.timeoutMs)
                });
                setSelectedOfficialId(id);
                setSavingOfficial(false);
              }}
            >
              保存官方预设
            </button>
            <button
              type="button"
              onClick={() => setDefaultOfficialPreset(selectedOfficialId)}
            >
              设为默认
            </button>
            <button
              type="button"
              onClick={() => removeOfficialPreset(selectedOfficialId)}
              disabled={officialPresets.length <= 1}
            >
              删除
            </button>
          </div>
        </section>

        </>
        ) : null}

        {activeSection === "session" ? (
        <section className="settings-section">
          <h3>会话覆盖（当前会话）</h3>
          {activeConversationId ? (
            <>
              <label>
                模型（留空跟随默认）
                <input
                  value={sessionModel}
                  onChange={(event) => setSessionModel(event.target.value)}
                />
              </label>
              <div className="settings-grid-4">
                <label>温度<input
                    type="number"
                    step="0.1"
                    value={sessionTemperature}
                    onChange={(event) => setSessionTemperature(event.target.value)}
                  />
                </label>
                <label>最大 Tokens<input
                    type="number"
                    value={sessionMaxTokens}
                    onChange={(event) => setSessionMaxTokens(event.target.value)}
                  />
                </label>
                <label>超时（毫秒）<input
                    type="number"
                    value={sessionTimeoutMs}
                    onChange={(event) => setSessionTimeoutMs(event.target.value)}
                  />
                </label>
                <label>
                  retry
                  <input
                    type="number"
                    value={sessionRetryAttempts}
                    onChange={(event) =>
                      setSessionRetryAttempts(event.target.value)
                    }
                  />
                </label>
              </div>
              <div className="settings-inline-actions">
                <button
                  type="button"
                  onClick={() =>
                    setSessionOverride(activeConversationId, {
                      model: sessionModel || undefined,
                      temperature:
                        sessionTemperature.trim() === ""
                          ? undefined
                          : Number(sessionTemperature),
                      maxTokens:
                        sessionMaxTokens.trim() === ""
                          ? undefined
                          : Number(sessionMaxTokens),
                      timeoutMs:
                        sessionTimeoutMs.trim() === ""
                          ? undefined
                          : Number(sessionTimeoutMs),
                      retryAttempts:
                        sessionRetryAttempts.trim() === ""
                          ? undefined
                          : Number(sessionRetryAttempts)
                    })
                  }
                >
                  保存会话覆盖
                </button>
                <button
                  type="button"
                  onClick={() => clearSessionOverride(activeConversationId)}
                >
                  清空会话覆盖
                </button>
              </div>
            </>
          ) : (
            <p className="settings-hint">未选中会话</p>
          )}
        </section>

        ) : null}

        {activeSection === "experiments" ? (
          <SettingsExperimentsSection
            experimentFlags={experimentFlags}
            retryAttempts={requestDefaults.retryAttempts}
            onSetExperimentFlag={setExperimentFlag}
            onSetDefaultRetryAttempts={setDefaultRetryAttempts}
          />

        ) : null}

        {activeSection === "data" ? (
          <SettingsDataSection
            backupInputRef={backupInputRef}
            pendingBackupFile={pendingBackupFile}
            backupInspection={backupInspection}
            localImportGuardWarning={localImportGuardWarning}
            importingBackup={importingBackup}
            localMergeImportGuardPresentation={localMergeImportGuardPresentation}
            localReplaceImportGuardPresentation={localReplaceImportGuardPresentation}
            localReplaceImportArmed={localReplaceImportArmed}
            importRollbackAnchorCapturedAt={importRollbackAnchor?.capturedAt ?? null}
            importRollbackAnchorPresentation={importRollbackAnchorPresentation}
            rollbackAnchorBusy={rollbackAnchorBusy}
            remoteBackupBusyAction={remoteBackupBusyAction}
            remoteBackupAdminTokenDraft={remoteBackupAdminTokenDraft}
            remoteBackupAdminTokenSaved={Boolean(remoteBackupAdminTokenCipher)}
            remoteBackupSyncMode={remoteBackupSyncPreferences.mode}
            remoteBackupActions={remoteBackupActions}
            remoteBackupSync={remoteBackupSync}
            remoteBackupSyncPresentation={remoteBackupSyncPresentation}
            remoteBackupHistorySummary={remoteBackupHistorySummary}
            latestRemoteHistorySnapshotId={latestRemoteHistorySnapshotId}
            selectedRemoteHistoryBackup={selectedRemoteHistoryBackup}
            selectedRemoteHistoryPresentation={selectedRemoteHistoryPresentation}
            selectedRemoteHistoryComparisonPresentation={
              selectedRemoteHistoryComparisonPresentation
            }
            remoteBackupLocalSummary={remoteBackupLocalSummary}
            remoteBackupPullResult={remoteBackupPullResult}
            remoteBackupPulledPreviewPresentation={
              remoteBackupPulledPreviewPresentation
            }
            remoteBackupPulledPreviewGuardPresentation={
              remoteBackupPulledPreviewGuardPresentation
            }
            remoteBackupPulledConversationImpactPresentation={
              remoteBackupPulledConversationImpactPresentation
            }
            remoteImportGuardWarning={remoteImportGuardWarning}
            remoteMergeImportGuardPresentation={
              remoteMergeImportGuardPresentation
            }
            remoteReplaceImportGuardPresentation={
              remoteReplaceImportGuardPresentation
            }
            remoteReplaceImportArmed={remoteReplaceImportArmed}
            backupMessage={backupMessage}
            debugEvents={debugEvents}
            onExportBackup={() => {
              void handleExportBackup();
            }}
            onLocalMergeImport={handleLocalMergeImport}
            onLocalReplaceImport={handleLocalReplaceImport}
            onCancelLocalImport={handleCancelLocalImport}
            onRestoreImportRollbackAnchor={() => {
              void handleRestoreImportRollbackAnchor();
            }}
            onClearImportRollbackAnchor={handleClearImportRollbackAnchor}
            onRemoteBackupAdminTokenDraftChange={setRemoteBackupAdminTokenDraft}
            onRemoteBackupSyncModeChange={setRemoteBackupSyncMode}
            onSelectRemoteHistorySnapshot={setSelectedRemoteHistorySnapshotId}
            onToggleRemoteHistoryProtection={
              handleToggleSelectedRemoteHistoryProtection
            }
            onPullSelectedHistorySnapshot={handlePullSelectedRemoteHistory}
            onSaveRemoteBackupAdminToken={() => {
              void handleSaveRemoteBackupAdminToken();
            }}
            onClearRemoteBackupAdminToken={handleClearRemoteBackupAdminTokenAction}
            onCheckRemoteBackupSync={() => {
              void handleCheckRemoteBackupSync();
            }}
            onUploadRemoteBackup={() => {
              void handleUploadRemoteBackup();
            }}
            onPullLatestRemoteBackup={() => {
              void handlePullRemoteBackup();
            }}
            onForceUploadRemoteBackup={() => {
              void handleUploadRemoteBackup("force");
            }}
            onRemoteMergeImport={handleRemoteMergeImport}
            onRemoteReplaceImport={handleRemoteReplaceImport}
            onClearRemotePullResult={handleClearRemotePullResult}
            onBackupInputChange={(event) => {
              void handleImportBackupSelect(event);
            }}
            onClearStoredSecrets={() => {
              void clearStoredSecrets();
            }}
            onClearDebugEvents={clearDebugEvents}
          />
        ) : null}
          </div>
        </div>
      </aside>
    </div>
  );
};

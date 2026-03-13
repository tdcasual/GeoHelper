import { ChangeEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

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
  downloadGatewayBackup,
  compareGatewayBackup,
  fetchGatewayBackupHistory,
  protectGatewayBackupSnapshot,
  unprotectGatewayBackupSnapshot,
  uploadGatewayBackup,
  uploadGatewayBackupGuarded
} from "../runtime/runtime-service";
import {
  createComparableSummaryFromBackupEnvelope,
  formatRemoteBackupActionMessage,
  formatRemoteBackupHistorySummary,
  formatRemoteBackupProtectionActionMessage,
  formatRemoteBackupProtectionLimitMessage,
  formatRemoteBackupSelectedPullMessage,
  formatRemoteBackupRestoreWarning,
  resolveRemoteBackupHistoryComparisonPresentation,
  resolveRemoteBackupHistorySelectionPresentation,
  resolveRemoteBackupSyncPresentation,
  resolveRemoteBackupActions,
  shouldRecommendRemoteHistoryResolution,
  shouldShowRemoteBackupForceUpload
} from "./settings-remote-backup";
import {
  BACKUP_FILENAME,
  BackupImportMode,
  BackupInspection,
  exportCurrentAppBackup,
  exportCurrentAppBackupEnvelope,
  inspectBackup,
  importAppBackupToLocalStorage,
  importRemoteBackupToLocalStorage
} from "../storage/backup";
import { setRemoteSyncImportInProgress } from "../storage/remote-sync";

interface SettingsDrawerProps {
  open: boolean;
  activeConversationId: string | null;
  currentMode: ChatMode;
  onClose: () => void;
  onApplyMode: (mode: ChatMode) => void;
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
  const [remoteBackupPullResult, setRemoteBackupPullResult] = useState<
    RuntimeBackupDownloadResponse | null
  >(null);
  const [selectedRemoteHistorySnapshotId, setSelectedRemoteHistorySnapshotId] =
    useState<string | null>(null);
  const [activeSection, setActiveSection] =
    useState<SettingsSectionId>("general");
  const [pendingBackupFile, setPendingBackupFile] = useState<File | null>(null);
  const [backupInspection, setBackupInspection] =
    useState<BackupInspection | null>(null);
  const [importingBackup, setImportingBackup] = useState(false);
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
  const selectedRemoteHistoryComparisonPresentation = useMemo(
    () =>
      resolveRemoteBackupHistoryComparisonPresentation(
        remoteBackupSync.lastComparison?.local_snapshot.summary ?? null,
        selectedRemoteHistoryBackup
      ),
    [remoteBackupSync.lastComparison, selectedRemoteHistoryBackup]
  );
  const remoteBackupHistorySummary = useMemo(
    () => formatRemoteBackupHistorySummary(remoteBackupSync.history),
    [remoteBackupSync.history]
  );
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
    if (open) {
      setActiveSection("general");
    }
  }, [open]);

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

    setImportingBackup(true);
    setRemoteSyncImportInProgress(true);
    try {
      await importAppBackupToLocalStorage(pendingBackupFile, { mode });
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
      const localSummary = createComparableSummaryFromBackupEnvelope(envelope);
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

      const response = await downloadGatewayBackup({
        baseUrl: remoteBackupActions.gatewayProfile.baseUrl,
        adminToken,
        snapshotId
      });
      setRemoteBackupPullResult(response);
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

    setRemoteBackupBusyAction(`restore-${mode}`);
    setRemoteSyncImportInProgress(true);
    try {
      await importRemoteBackupToLocalStorage(remoteBackupPullResult.backup, {
        mode
      });
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
        <section className="settings-section">
          <h3>实验开关</h3>
          <label className="settings-checkbox">
            <input
              data-testid="flag-show-agent-steps"
              type="checkbox"
              checked={experimentFlags.showAgentSteps}
              onChange={(event) =>
                setExperimentFlag("showAgentSteps", event.target.checked)
              }
            />
            显示代理步骤
          </label>
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={experimentFlags.autoRetryEnabled}
              onChange={(event) =>
                setExperimentFlag("autoRetryEnabled", event.target.checked)
              }
            />
            自动重试
          </label>
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={experimentFlags.requestTimeoutEnabled}
              onChange={(event) =>
                setExperimentFlag("requestTimeoutEnabled", event.target.checked)
              }
            />
            请求超时控制
          </label>
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={experimentFlags.strictValidationEnabled}
              onChange={(event) =>
                setExperimentFlag("strictValidationEnabled", event.target.checked)
              }
            />
            严格模式校验
          </label>
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={experimentFlags.fallbackSingleAgentEnabled}
              onChange={(event) =>
                setExperimentFlag(
                  "fallbackSingleAgentEnabled",
                  event.target.checked
                )
              }
            />
            失败回退单代理
          </label>
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={experimentFlags.debugLogPanelEnabled}
              onChange={(event) =>
                setExperimentFlag("debugLogPanelEnabled", event.target.checked)
              }
            />
            调试日志面板
          </label>
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={experimentFlags.performanceSamplingEnabled}
              onChange={(event) =>
                setExperimentFlag(
                  "performanceSamplingEnabled",
                  event.target.checked
                )
              }
            />
            性能采样上报
          </label>
          <label>
            默认重试次数
            <input
              type="number"
              value={requestDefaults.retryAttempts}
              onChange={(event) =>
                setDefaultRetryAttempts(Number(event.target.value))
              }
            />
          </label>
        </section>

        ) : null}

        {activeSection === "data" ? (
        <>
        <section className="settings-section">
          <h3>备份与恢复</h3>
          <div className="settings-inline-actions">
            <button type="button" onClick={handleExportBackup}>
              导出备份
            </button>
            <button
              type="button"
              onClick={() => backupInputRef.current?.click()}
            >
              导入备份
            </button>
          </div>
          {pendingBackupFile && backupInspection ? (
            <article className="settings-import-preview">
              <p>{`文件：${pendingBackupFile.name}`}</p>
              <p>{`schema：v${backupInspection.schemaVersion}`}</p>
              <p>{`创建时间：${new Date(backupInspection.createdAt).toLocaleString(
                "zh-CN"
              )}`}</p>
              <p>{`会话数：${backupInspection.conversationCount}`}</p>
              <p>{`来源版本：${backupInspection.appVersion}`}</p>
              {backupInspection.migrationHint === "older" ? (
                <p className="settings-warning-text">
                  备份版本较旧，将按兼容方式导入
                </p>
              ) : null}
              {backupInspection.migrationHint === "newer" ? (
                <p className="settings-warning-text">
                  备份版本高于当前应用，导入后可能存在字段降级
                </p>
              ) : null}
              <div className="settings-inline-actions">
                <button
                  type="button"
                  disabled={importingBackup}
                  onClick={() => handleImportBackup("merge")}
                >
                  合并导入（推荐）
                </button>
                <button
                  type="button"
                  disabled={importingBackup}
                  onClick={() => handleImportBackup("replace")}
                >
                  覆盖导入
                </button>
                <button
                  type="button"
                  disabled={importingBackup}
                  onClick={() => {
                    setPendingBackupFile(null);
                    setBackupInspection(null);
                    setBackupMessage("已取消本次导入");
                  }}
                >
                  取消
                </button>
              </div>
            </article>
          ) : null}

          <section className="settings-section">
            <h3>网关远端备份</h3>
            <label>
              管理员令牌
              <input
                type="password"
                placeholder={
                  remoteBackupAdminTokenCipher
                    ? "已保存管理员令牌（重新输入可覆盖）"
                    : "x-admin-token"
                }
                value={remoteBackupAdminTokenDraft}
                onChange={(event) =>
                  setRemoteBackupAdminTokenDraft(event.target.value)
                }
              />
            </label>
            <label>
              轻量云同步
              <select
                value={remoteBackupSyncPreferences.mode}
                onChange={(event) =>
                  setRemoteBackupSyncMode(
                    event.target.value as
                      | "off"
                      | "remind_only"
                      | "delayed_upload"
                  )
                }
              >
                <option value="off">关闭</option>
                <option value="remind_only">仅提醒（启动检查）</option>
                <option value="delayed_upload">延迟上传</option>
              </select>
            </label>
            <p className="settings-hint">
              {remoteBackupActions.gatewayProfile
                ? `远端网关：${remoteBackupActions.gatewayProfile.name}（${remoteBackupActions.gatewayProfile.baseUrl}）`
                : remoteBackupActions.upload.reason}
            </p>
            <p className="settings-hint">
              启动检查只拉取元数据；延迟上传也不会自动拉取或自动导入。
            </p>
            <article
              className="settings-import-preview"
              data-testid="remote-backup-sync-status"
            >
              <p>{`同步状态：${remoteBackupSyncPresentation.statusLabel}`}</p>
              <p>{remoteBackupSyncPresentation.description}</p>
              {remoteBackupSyncPresentation.latestSummary ? (
                <p>{remoteBackupSyncPresentation.latestSummary}</p>
              ) : (
                <p>云端最新快照：尚未获取摘要</p>
              )}
              {remoteBackupSync.latestRemoteBackup ? (
                <p>{`快照 ID：${remoteBackupSync.latestRemoteBackup.snapshot_id}`}</p>
              ) : null}
              {remoteBackupSyncPresentation.checkedAtLabel ? (
                <p>{remoteBackupSyncPresentation.checkedAtLabel}</p>
              ) : null}
            </article>
            {remoteBackupSync.history.length > 0 ? (
              <article
                className="settings-import-preview"
                data-testid="remote-backup-history"
              >
                <p>{remoteBackupHistorySummary}</p>
                <div className="settings-remote-backup-history-list">
                  {remoteBackupSync.history.map((backup, index) => {
                    const isSelected =
                      backup.snapshot_id === selectedRemoteHistoryBackup?.snapshot_id;
                    const isLatest =
                      backup.snapshot_id === latestRemoteHistorySnapshotId || index === 0;

                    return (
                      <button
                        key={backup.snapshot_id}
                        type="button"
                        className={`settings-remote-backup-history-item${
                          isSelected
                            ? " settings-remote-backup-history-item-selected"
                            : ""
                        }`}
                        onClick={() =>
                          setSelectedRemoteHistorySnapshotId(backup.snapshot_id)
                        }
                      >
                        <span>{isLatest ? "最新" : "历史"}</span>
                        {backup.is_protected ? <span>已保护</span> : null}
                        <span>{`${backup.conversation_count} 个会话`}</span>
                        <span>{backup.snapshot_id}</span>
                      </button>
                    );
                  })}
                </div>
                {selectedRemoteHistoryPresentation ? (
                  <div data-testid="remote-backup-selected-history">
                    <p>{selectedRemoteHistoryPresentation.statusLabel}</p>
                    <p>{selectedRemoteHistoryPresentation.snapshotIdLabel}</p>
                    <p>{selectedRemoteHistoryPresentation.deviceIdLabel}</p>
                    <p>{selectedRemoteHistoryPresentation.updatedAtLabel}</p>
                    <p>{selectedRemoteHistoryPresentation.conversationCountLabel}</p>
                    <p>{selectedRemoteHistoryPresentation.protectionLabel}</p>
                    {selectedRemoteHistoryPresentation.protectedAtLabel ? (
                      <p>{selectedRemoteHistoryPresentation.protectedAtLabel}</p>
                    ) : null}
                    {selectedRemoteHistoryComparisonPresentation ? (
                      <>
                        <p>{selectedRemoteHistoryComparisonPresentation.relationLabel}</p>
                        <p>{selectedRemoteHistoryComparisonPresentation.recommendation}</p>
                      </>
                    ) : null}
                    {shouldRecommendRemoteHistoryResolution(
                      remoteBackupSync.status
                    ) ? (
                      <p className="settings-hint">
                        建议先拉取当前选中的快照预览；如这是关键恢复点，可先保护当前选中的快照，再决定合并、覆盖或仍然覆盖云端。
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {selectedRemoteHistoryBackup ? (
                  <div className="settings-inline-actions">
                    <button
                      type="button"
                      disabled={
                        Boolean(remoteBackupBusyAction) ||
                        !remoteBackupActions.check.enabled
                      }
                      onClick={() => {
                        void handleUpdateRemoteBackupProtection(
                          selectedRemoteHistoryBackup.is_protected
                            ? "unprotect"
                            : "protect"
                        );
                      }}
                    >
                      {selectedRemoteHistoryBackup.is_protected ? "取消保护" : "保护此快照"}
                    </button>
                    {selectedRemoteHistoryBackup.snapshot_id !==
                    latestRemoteHistorySnapshotId ? (
                    <button
                      type="button"
                      disabled={
                        Boolean(remoteBackupBusyAction) || !remoteBackupActions.pull.enabled
                      }
                      onClick={() => {
                        void handlePullRemoteBackup(
                          selectedRemoteHistoryBackup.snapshot_id
                        );
                      }}
                    >
                      拉取所选历史快照
                    </button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ) : null}
            {!remoteBackupActions.upload.enabled && remoteBackupActions.upload.reason ? (
              <p className="settings-warning-text">
                {remoteBackupActions.upload.reason}
              </p>
            ) : null}
            <div className="settings-inline-actions">
              <button
                type="button"
                disabled={Boolean(remoteBackupBusyAction) || !remoteBackupAdminTokenDraft.trim()}
                onClick={handleSaveRemoteBackupAdminToken}
              >
                保存管理员令牌
              </button>
              <button
                type="button"
                disabled={Boolean(remoteBackupBusyAction) || !remoteBackupAdminTokenCipher}
                onClick={() => {
                  clearRemoteBackupAdminToken();
                  setRemoteBackupAdminTokenDraft("");
                  setBackupMessage("已清除网关管理员令牌");
                }}
              >
                清除管理员令牌
              </button>
            </div>
            <div className="settings-inline-actions">
              <button
                type="button"
                disabled={Boolean(remoteBackupBusyAction) || !remoteBackupActions.check.enabled}
                onClick={handleCheckRemoteBackupSync}
              >
                检查云端状态
              </button>
              <button
                type="button"
                disabled={Boolean(remoteBackupBusyAction) || !remoteBackupActions.upload.enabled}
                onClick={() => {
                  void handleUploadRemoteBackup();
                }}
              >
                上传最新快照
              </button>
              <button
                type="button"
                disabled={Boolean(remoteBackupBusyAction) || !remoteBackupActions.pull.enabled}
                onClick={() => {
                  void handlePullRemoteBackup();
                }}
              >
                拉取最新快照
              </button>
            </div>
            {shouldShowRemoteBackupForceUpload(remoteBackupSync.status) &&
            remoteBackupActions.upload.enabled ? (
              <div className="settings-inline-actions">
                <button
                  type="button"
                  className="top-bar-button-danger"
                  disabled={Boolean(remoteBackupBusyAction)}
                  onClick={() => {
                    void handleUploadRemoteBackup("force");
                  }}
                >
                  仍然覆盖云端快照
                </button>
              </div>
            ) : null}
            {remoteBackupPullResult ? (
              <article className="settings-import-preview">
                <p>{`拉取时间：${new Date(remoteBackupPullResult.backup.stored_at).toLocaleString("zh-CN")}`}</p>
                <p>{`schema：v${remoteBackupPullResult.backup.schema_version}`}</p>
                <p>{`创建时间：${new Date(remoteBackupPullResult.backup.created_at).toLocaleString("zh-CN")}`}</p>
                <p>{`快照 ID：${remoteBackupPullResult.backup.snapshot_id}`}</p>
                <p>{`设备 ID：${remoteBackupPullResult.backup.device_id}`}</p>
                <p>{`会话数：${remoteBackupPullResult.backup.conversation_count}`}</p>
                <p>{`来源版本：${remoteBackupPullResult.backup.app_version}`}</p>
                <p className="settings-warning-text">
                  {formatRemoteBackupRestoreWarning(remoteBackupPullResult.backup)}
                </p>
                <div className="settings-inline-actions">
                  <button
                    type="button"
                    disabled={Boolean(remoteBackupBusyAction) || !remoteBackupActions.restore.enabled}
                    onClick={() => handleImportPulledRemoteBackup("merge")}
                  >
                    拉取后导入（合并）
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(remoteBackupBusyAction) || !remoteBackupActions.restore.enabled}
                    onClick={() => handleImportPulledRemoteBackup("replace")}
                  >
                    拉取后覆盖导入
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(remoteBackupBusyAction)}
                    onClick={() => {
                      setRemoteBackupPullResult(null);
                      setBackupMessage("已清除本次网关拉取结果");
                    }}
                  >
                    清除本次拉取
                  </button>
                </div>
              </article>
            ) : null}
          </section>
          <input
            ref={backupInputRef}
            type="file"
            accept="application/json"
            hidden
            onChange={handleImportBackupSelect}
          />
          {backupMessage ? <p className="settings-hint">{backupMessage}</p> : null}
        </section>

        <section className="settings-section">
          <h3>安全</h3>
          <div className="settings-inline-actions">
            <button type="button" onClick={() => clearStoredSecrets()}>
              清除本地加密密钥与 BYOK 密文
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h3>调试日志</h3>
          <div className="settings-inline-actions">
            <button type="button" onClick={clearDebugEvents}>
              清空日志
            </button>
          </div>
          <div className="debug-log-panel">
            {debugEvents.length === 0 ? (
              <div className="settings-hint">暂无日志</div>
            ) : (
              debugEvents.map((item) => (
                <article key={item.id} className={`debug-log-${item.level}`}>
                  <time>{new Date(item.time).toLocaleTimeString("zh-CN")}</time>
                  <span>{item.message}</span>
                </article>
              ))
            )}
          </div>
        </section>
        </>
        ) : null}
          </div>
        </div>
      </aside>
    </div>
  );
};

import {
  KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import type { ChatMode } from "../runtime/types";
import { useSettingsStore } from "../state/settings-store";
import {
  type ByokDraft,
  fromByokPreset,
  fromOfficialPreset,
  fromRuntimeProfile,
  type OfficialDraft,
  type RuntimeDraft
} from "./settings-drawer/settings-drawer-drafts";
import { SettingsDataSection } from "./settings-drawer/SettingsDataSection";
import { SettingsExperimentsSection } from "./settings-drawer/SettingsExperimentsSection";
import { SettingsGeneralSection } from "./settings-drawer/SettingsGeneralSection";
import { SettingsModelsSection } from "./settings-drawer/SettingsModelsSection";
import { SettingsSessionSection } from "./settings-drawer/SettingsSessionSection";
import { useRemoteBackupControls } from "./settings-drawer/useRemoteBackupControls";

interface SettingsDrawerProps {
  open: boolean;
  activeConversationId: string | null;
  currentMode: ChatMode;
  onClose: () => void;
  onApplyMode: (mode: ChatMode) => void;
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
  const defaultPlatformAgentProfileId = useSettingsStore(
    (state) => state.defaultPlatformAgentProfileId
  );
  const platformRunProfileCatalog = useSettingsStore(
    (state) => state.platformRunProfileCatalog
  );
  const platformBundleCatalog = useSettingsStore(
    (state) => state.platformBundleCatalog
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
  const upsertRuntimeProfile = useSettingsStore(
    (state) => state.upsertRuntimeProfile
  );
  const setDefaultRuntimeProfile = useSettingsStore(
    (state) => state.setDefaultRuntimeProfile
  );
  const setDefaultPlatformAgentProfile = useSettingsStore(
    (state) => state.setDefaultPlatformAgentProfile
  );
  const refreshPlatformRunProfiles = useSettingsStore(
    (state) => state.refreshPlatformRunProfiles
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
  const setByokRuntimeIssue = useSettingsStore(
    (state) => state.setByokRuntimeIssue
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
  const [activeSection, setActiveSection] =
    useState<SettingsSectionId>("general");
  const modalRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const remoteBackupControls = useRemoteBackupControls({ open });

  useEffect(() => {
    if (!byokPresets.some((item) => item.id === selectedByokId)) {
      setSelectedByokId(defaultByokPresetId);
    }
  }, [byokPresets, defaultByokPresetId, selectedByokId]);

  useEffect(() => {
    const preset = byokPresets.find((item) => item.id === selectedByokId);
    setByokDraft(fromByokPreset(preset));
  }, [byokPresets, selectedByokId]);

  useEffect(() => {
    if (!officialPresets.some((item) => item.id === selectedOfficialId)) {
      setSelectedOfficialId(defaultOfficialPresetId);
    }
  }, [defaultOfficialPresetId, officialPresets, selectedOfficialId]);

  useEffect(() => {
    const preset = officialPresets.find((item) => item.id === selectedOfficialId);
    setOfficialDraft(fromOfficialPreset(preset));
  }, [officialPresets, selectedOfficialId]);

  useEffect(() => {
    if (!runtimeProfiles.some((item) => item.id === selectedRuntimeId)) {
      setSelectedRuntimeId(defaultRuntimeProfileId);
    }
  }, [defaultRuntimeProfileId, runtimeProfiles, selectedRuntimeId]);

  useEffect(() => {
    const profile = runtimeProfiles.find((item) => item.id === selectedRuntimeId);
    setRuntimeDraft(fromRuntimeProfile(profile));
  }, [runtimeProfiles, selectedRuntimeId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setActiveSection("general");
    void refreshPlatformRunProfiles();
  }, [defaultRuntimeProfileId, open, refreshPlatformRunProfiles]);

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
              <SettingsGeneralSection
                currentMode={currentMode}
                defaultMode={defaultMode}
                defaultRuntimeProfileId={defaultRuntimeProfileId}
                defaultPlatformAgentProfileId={defaultPlatformAgentProfileId}
                runtimeProfiles={runtimeProfiles}
                platformRunProfileCatalog={platformRunProfileCatalog}
                platformBundleCatalog={platformBundleCatalog}
                selectedRuntimeId={selectedRuntimeId}
                runtimeDraft={runtimeDraft}
                savingRuntime={savingRuntime}
                setDefaultMode={setDefaultMode}
                setDefaultRuntimeProfile={setDefaultRuntimeProfile}
                setDefaultPlatformAgentProfile={setDefaultPlatformAgentProfile}
                setSelectedRuntimeId={setSelectedRuntimeId}
                setRuntimeDraft={setRuntimeDraft}
                setSavingRuntime={setSavingRuntime}
                upsertRuntimeProfile={upsertRuntimeProfile}
                refreshPlatformRunProfiles={refreshPlatformRunProfiles}
                onApplyMode={onApplyMode}
              />
            ) : null}

            {activeSection === "models" ? (
              <SettingsModelsSection
                byokPresets={byokPresets}
                officialPresets={officialPresets}
                selectedByokId={selectedByokId}
                selectedOfficialId={selectedOfficialId}
                byokDraft={byokDraft}
                officialDraft={officialDraft}
                savingByok={savingByok}
                savingOfficial={savingOfficial}
                byokRuntimeIssue={byokRuntimeIssue}
                setSelectedByokId={setSelectedByokId}
                setSelectedOfficialId={setSelectedOfficialId}
                setByokDraft={setByokDraft}
                setOfficialDraft={setOfficialDraft}
                setSavingByok={setSavingByok}
                setSavingOfficial={setSavingOfficial}
                setByokRuntimeIssue={setByokRuntimeIssue}
                upsertByokPreset={upsertByokPreset}
                removeByokPreset={removeByokPreset}
                setDefaultByokPreset={setDefaultByokPreset}
                upsertOfficialPreset={upsertOfficialPreset}
                removeOfficialPreset={removeOfficialPreset}
                setDefaultOfficialPreset={setDefaultOfficialPreset}
              />
            ) : null}

            {activeSection === "session" ? (
              <SettingsSessionSection
                activeConversationId={activeConversationId}
                sessionModel={sessionModel}
                sessionTemperature={sessionTemperature}
                sessionMaxTokens={sessionMaxTokens}
                sessionTimeoutMs={sessionTimeoutMs}
                sessionRetryAttempts={sessionRetryAttempts}
                setSessionModel={setSessionModel}
                setSessionTemperature={setSessionTemperature}
                setSessionMaxTokens={setSessionMaxTokens}
                setSessionTimeoutMs={setSessionTimeoutMs}
                setSessionRetryAttempts={setSessionRetryAttempts}
                setSessionOverride={setSessionOverride}
                clearSessionOverride={clearSessionOverride}
              />
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
                {...remoteBackupControls}
                debugEvents={debugEvents}
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

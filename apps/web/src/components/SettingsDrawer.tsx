import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

import { ChatMode } from "../services/api-client";
import {
  ByokPreset,
  OfficialPreset,
  useSettingsStore
} from "../state/settings-store";
import {
  BACKUP_FILENAME,
  exportCurrentAppBackup,
  importAppBackupToLocalStorage
} from "../storage/backup";

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

export const SettingsDrawer = ({
  open,
  activeConversationId,
  currentMode,
  onClose,
  onApplyMode
}: SettingsDrawerProps) => {
  const defaultMode = useSettingsStore((state) => state.defaultMode);
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
  const [byokDraft, setByokDraft] = useState<ByokDraft>(
    fromByokPreset(byokPresets.find((item) => item.id === defaultByokPresetId))
  );
  const [officialDraft, setOfficialDraft] = useState<OfficialDraft>(
    fromOfficialPreset(
      officialPresets.find((item) => item.id === defaultOfficialPresetId)
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
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const backupInputRef = useRef<HTMLInputElement | null>(null);

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

  const handleImportBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      await importAppBackupToLocalStorage(file);
      setBackupMessage("备份导入成功，正在刷新");
      setTimeout(() => {
        window.location.reload();
      }, 300);
    } catch {
      setBackupMessage("备份导入失败，请检查文件格式");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div className="settings-drawer-backdrop" onClick={onClose}>
      <aside
        className="settings-drawer"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="settings-drawer-header">
          <h2>设置</h2>
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </header>

        <section className="settings-section">
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
              <option value="official">Official</option>
            </select>
          </label>
          <div className="settings-inline-actions">
            <span>当前模式：{currentMode}</span>
            <button type="button" onClick={() => onApplyMode(defaultMode)}>
              应用默认模式到当前会话
            </button>
          </div>
        </section>

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
          <label>
            Model
            <input
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
          <label>
            Endpoint
            <input
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
            <label>
              temperature
              <input
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
            <label>
              max tokens
              <input
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
            <label>
              timeout(ms)
              <input
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
          <h3>Official 预设</h3>
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
          <label>
            Model
            <input
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
            <label>
              temperature
              <input
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
            <label>
              max tokens
              <input
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
            <label>
              timeout(ms)
              <input
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
              保存 Official 预设
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

        <section className="settings-section">
          <h3>会话覆盖（当前会话）</h3>
          {activeConversationId ? (
            <>
              <label>
                model（留空跟随默认）
                <input
                  value={sessionModel}
                  onChange={(event) => setSessionModel(event.target.value)}
                />
              </label>
              <div className="settings-grid-4">
                <label>
                  temperature
                  <input
                    type="number"
                    step="0.1"
                    value={sessionTemperature}
                    onChange={(event) => setSessionTemperature(event.target.value)}
                  />
                </label>
                <label>
                  max tokens
                  <input
                    type="number"
                    value={sessionMaxTokens}
                    onChange={(event) => setSessionMaxTokens(event.target.value)}
                  />
                </label>
                <label>
                  timeout(ms)
                  <input
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
          <input
            ref={backupInputRef}
            type="file"
            accept="application/json"
            hidden
            onChange={handleImportBackup}
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
      </aside>
    </div>
  );
};

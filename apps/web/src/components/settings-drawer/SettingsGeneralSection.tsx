import type { Dispatch, SetStateAction } from "react";

import type { ChatMode } from "../../runtime/types";
import type { RuntimeProfile } from "../../state/settings-store";
import type { RuntimeDraft } from "./settings-drawer-drafts";

interface SettingsGeneralSectionProps {
  currentMode: ChatMode;
  defaultMode: ChatMode;
  defaultRuntimeProfileId: string;
  runtimeProfiles: RuntimeProfile[];
  selectedRuntimeId: string;
  runtimeDraft: RuntimeDraft;
  savingRuntime: boolean;
  setDefaultMode: (mode: ChatMode) => void;
  setDefaultRuntimeProfile: (id: string) => void;
  setSelectedRuntimeId: Dispatch<SetStateAction<string>>;
  setRuntimeDraft: Dispatch<SetStateAction<RuntimeDraft>>;
  setSavingRuntime: Dispatch<SetStateAction<boolean>>;
  upsertRuntimeProfile: (input: {
    id?: string;
    name: string;
    target: "gateway" | "direct";
    baseUrl: string;
  }) => string;
  onApplyMode: (mode: ChatMode) => void;
}

export const SettingsGeneralSection = ({
  currentMode,
  defaultMode,
  defaultRuntimeProfileId,
  runtimeProfiles,
  selectedRuntimeId,
  runtimeDraft,
  savingRuntime,
  setDefaultMode,
  setDefaultRuntimeProfile,
  setSelectedRuntimeId,
  setRuntimeDraft,
  setSavingRuntime,
  upsertRuntimeProfile,
  onApplyMode
}: SettingsGeneralSectionProps) => (
  <section className="settings-section settings-section-general">
    <h3>通用</h3>
    <label>
      默认模式
      <select
        value={defaultMode}
        onChange={(event) => setDefaultMode(event.target.value as ChatMode)}
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
);

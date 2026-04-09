import type { Dispatch, SetStateAction } from "react";

import type { ChatMode } from "../../runtime/types";
import type { PlatformBundleCatalogState } from "../../state/platform-bundle-catalog";
import type { PlatformRunProfileCatalogState } from "../../state/platform-run-profile-catalog";
import type {
  RuntimeProfile,
  UpsertRuntimeProfileInput
} from "../../state/settings-store";
import type { RuntimeDraft } from "./settings-drawer-drafts";

interface SettingsGeneralSectionProps {
  currentMode: ChatMode;
  defaultMode: ChatMode;
  defaultRuntimeProfileId: string;
  defaultPlatformAgentProfileId: string;
  runtimeProfiles: RuntimeProfile[];
  platformRunProfileCatalog: PlatformRunProfileCatalogState;
  platformBundleCatalog: PlatformBundleCatalogState;
  selectedRuntimeId: string;
  runtimeDraft: RuntimeDraft;
  savingRuntime: boolean;
  setDefaultMode: (mode: ChatMode) => void;
  setDefaultRuntimeProfile: (id: string) => void;
  setDefaultPlatformAgentProfile: (id: string) => void;
  setSelectedRuntimeId: Dispatch<SetStateAction<string>>;
  setRuntimeDraft: Dispatch<SetStateAction<RuntimeDraft>>;
  setSavingRuntime: Dispatch<SetStateAction<boolean>>;
  upsertRuntimeProfile: (input: UpsertRuntimeProfileInput) => string;
  refreshPlatformRunProfiles: () => Promise<void>;
  onApplyMode: (mode: ChatMode) => void;
}

const buildCatalogSourceLabel = (
  source: PlatformRunProfileCatalogState["source"]
): string => (source === "control_plane" ? "Control Plane" : "本地内置");

export const SettingsGeneralSection = ({
  currentMode,
  defaultMode,
  defaultRuntimeProfileId,
  defaultPlatformAgentProfileId,
  runtimeProfiles,
  platformRunProfileCatalog,
  platformBundleCatalog,
  selectedRuntimeId,
  runtimeDraft,
  savingRuntime,
  setDefaultMode,
  setDefaultRuntimeProfile,
  setDefaultPlatformAgentProfile,
  setSelectedRuntimeId,
  setRuntimeDraft,
  setSavingRuntime,
  upsertRuntimeProfile,
  refreshPlatformRunProfiles,
  onApplyMode
}: SettingsGeneralSectionProps) => {
  const selectedPlatformProfile = platformRunProfileCatalog.profiles.find(
    (profile) => profile.id === defaultPlatformAgentProfileId
  );
  const catalogProfiles = selectedPlatformProfile
    ? platformRunProfileCatalog.profiles
    : [
        {
          id: defaultPlatformAgentProfileId,
          name: `${defaultPlatformAgentProfileId}（待同步）`,
          description: "当前选择暂未出现在已加载目录中，成功连接 control-plane 后会自动修复。",
          agentId: "pending",
          workflowId: "pending",
          defaultBudget: {
            maxModelCalls: 1,
            maxToolCalls: 1,
            maxDurationMs: 1000
          }
        },
        ...platformRunProfileCatalog.profiles
      ];
  const bundleCountLabel = `${platformBundleCatalog.bundles.length} bundles`;

  return (
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
      <label>
        默认平台链路
        <select
          data-testid="platform-run-profile-select"
          value={defaultPlatformAgentProfileId}
          onChange={(event) => setDefaultPlatformAgentProfile(event.target.value)}
        >
          {catalogProfiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
      </label>
      <p className="settings-hint">
        {`目录来源：${buildCatalogSourceLabel(platformRunProfileCatalog.source)}`}
      </p>
      <p className="settings-hint">
        {selectedPlatformProfile?.description ??
          "当前选择暂未出现在已加载目录中，连接 control-plane 后会自动修复。"}
      </p>
      {platformRunProfileCatalog.status === "loading" ? (
        <p className="settings-hint">正在刷新平台链路目录…</p>
      ) : null}
      {platformRunProfileCatalog.status === "error" &&
      platformRunProfileCatalog.error ? (
        <p className="settings-warning-text">
          {`control-plane 目录拉取失败：${platformRunProfileCatalog.error}。当前回退到本地内置目录。`}
        </p>
      ) : null}
      <div className="settings-inline-actions">
        <button
          type="button"
          data-testid="platform-run-profile-refresh"
          disabled={platformRunProfileCatalog.status === "loading"}
          onClick={() => {
            void refreshPlatformRunProfiles();
          }}
        >
          刷新平台目录
        </button>
      </div>
      <div className="settings-audit-panel">
        <div className="settings-audit-panel-header">
          <strong>Portable Bundles</strong>
          <span className="settings-audit-count">{bundleCountLabel}</span>
        </div>
        {platformBundleCatalog.status === "loading" ? (
          <p className="settings-hint">正在刷新 bundle portability 审计…</p>
        ) : null}
        {platformBundleCatalog.status === "error" && platformBundleCatalog.error ? (
          <p className="settings-warning-text">
            {`bundle 审计拉取失败：${platformBundleCatalog.error}`}
          </p>
        ) : null}
        {platformBundleCatalog.status !== "loading" &&
        platformBundleCatalog.bundles.length === 0 ? (
          <p className="settings-hint">
            当前 control-plane 未返回 portable bundle 审计数据。
          </p>
        ) : null}
        {platformBundleCatalog.bundles.length > 0 ? (
          <ul className="settings-bundle-list">
            {platformBundleCatalog.bundles.map((bundle) => {
              const hostRequirements =
                bundle.hostRequirements.length > 0
                  ? bundle.hostRequirements.join(", ")
                  : "none";
              const hostBoundTools =
                bundle.openClawCompatibility.hostBoundTools.length > 0
                  ? bundle.openClawCompatibility.hostBoundTools.join(", ")
                  : "none";

              return (
                <li key={bundle.bundleId} className="settings-bundle-item">
                  <div className="settings-bundle-row">
                    <strong>{bundle.agentId}</strong>
                    <span className="settings-bundle-mode">
                      {bundle.openClawCompatibility.recommendedImportMode}
                    </span>
                  </div>
                  <p className="settings-hint">{bundle.bundleId}</p>
                  <p className="settings-hint">{`host requirements: ${hostRequirements}`}</p>
                  <p className="settings-hint">{`host-bound tools: ${hostBoundTools}`}</p>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
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
      {runtimeDraft.target === "gateway" ? (
        <>
          <label>
            Gateway 地址
            <input
              placeholder="https://your-gateway-domain"
              value={runtimeDraft.gatewayBaseUrl}
              onChange={(event) =>
                setRuntimeDraft((prev) => ({
                  ...prev,
                  gatewayBaseUrl: event.target.value
                }))
              }
            />
          </label>
          <label>
            Control Plane 地址（留空则复用 Gateway）
            <input
              placeholder="https://your-control-plane-domain"
              value={runtimeDraft.controlPlaneBaseUrl}
              onChange={(event) =>
                setRuntimeDraft((prev) => ({
                  ...prev,
                  controlPlaneBaseUrl: event.target.value
                }))
              }
            />
          </label>
        </>
      ) : (
        <label>
          Provider 地址（可选）
          <input
            placeholder="https://openrouter.ai/api/v1"
            value={runtimeDraft.providerBaseUrl}
            onChange={(event) =>
              setRuntimeDraft((prev) => ({
                ...prev,
                providerBaseUrl: event.target.value
              }))
            }
          />
        </label>
      )}
      <div className="settings-inline-actions">
        <button
          type="button"
          disabled={savingRuntime}
          onClick={() => {
            setSavingRuntime(true);
            const id = upsertRuntimeProfile(
              runtimeDraft.target === "gateway"
                ? {
                    id: runtimeDraft.id,
                    name: runtimeDraft.name,
                    target: "gateway",
                    gatewayBaseUrl: runtimeDraft.gatewayBaseUrl,
                    controlPlaneBaseUrl: runtimeDraft.controlPlaneBaseUrl
                  }
                : {
                    id: runtimeDraft.id,
                    name: runtimeDraft.name,
                    target: "direct",
                    providerBaseUrl: runtimeDraft.providerBaseUrl
                  }
            );
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
};

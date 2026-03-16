import type { Dispatch, SetStateAction } from "react";

import type {
  ByokPreset,
  ByokRuntimeIssue,
  OfficialPreset
} from "../../state/settings-store";
import {
  type ByokDraft,
  makeEmptyByokDraft,
  makeEmptyOfficialDraft,
  type OfficialDraft
} from "./settings-drawer-drafts";

interface SettingsModelsSectionProps {
  byokPresets: ByokPreset[];
  officialPresets: OfficialPreset[];
  selectedByokId: string;
  selectedOfficialId: string;
  byokDraft: ByokDraft;
  officialDraft: OfficialDraft;
  savingByok: boolean;
  savingOfficial: boolean;
  byokRuntimeIssue: ByokRuntimeIssue | null;
  setSelectedByokId: Dispatch<SetStateAction<string>>;
  setSelectedOfficialId: Dispatch<SetStateAction<string>>;
  setByokDraft: Dispatch<SetStateAction<ByokDraft>>;
  setOfficialDraft: Dispatch<SetStateAction<OfficialDraft>>;
  setSavingByok: Dispatch<SetStateAction<boolean>>;
  setSavingOfficial: Dispatch<SetStateAction<boolean>>;
  setByokRuntimeIssue: (issue: ByokRuntimeIssue | null) => void;
  upsertByokPreset: (input: {
    id?: string;
    name: string;
    model: string;
    endpoint: string;
    temperature: number;
    maxTokens: number;
    timeoutMs: number;
    apiKey?: string;
  }) => Promise<string>;
  removeByokPreset: (id: string) => void;
  setDefaultByokPreset: (id: string) => void;
  upsertOfficialPreset: (input: {
    id?: string;
    name: string;
    model: string;
    temperature: number;
    maxTokens: number;
    timeoutMs: number;
  }) => string;
  removeOfficialPreset: (id: string) => void;
  setDefaultOfficialPreset: (id: string) => void;
}

export const SettingsModelsSection = ({
  byokPresets,
  officialPresets,
  selectedByokId,
  selectedOfficialId,
  byokDraft,
  officialDraft,
  savingByok,
  savingOfficial,
  byokRuntimeIssue,
  setSelectedByokId,
  setSelectedOfficialId,
  setByokDraft,
  setOfficialDraft,
  setSavingByok,
  setSavingOfficial,
  setByokRuntimeIssue,
  upsertByokPreset,
  removeByokPreset,
  setDefaultByokPreset,
  upsertOfficialPreset,
  removeOfficialPreset,
  setDefaultOfficialPreset
}: SettingsModelsSectionProps) => (
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
      <label>
        模型
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
        接口地址
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
          温度
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
          最大 Tokens
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
          超时（毫秒）
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
            if (byokDraft.apiKey.trim() && byokRuntimeIssue?.presetId === id) {
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
      <label>
        模型
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
          温度
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
          最大 Tokens
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
          超时（毫秒）
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
);

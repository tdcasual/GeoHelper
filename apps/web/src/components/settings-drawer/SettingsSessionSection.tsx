import type { Dispatch, SetStateAction } from "react";

import type { SessionOverride } from "../../state/settings-store";

interface SettingsSessionSectionProps {
  activeConversationId: string | null;
  sessionModel: string;
  sessionTemperature: string;
  sessionMaxTokens: string;
  sessionTimeoutMs: string;
  sessionRetryAttempts: string;
  setSessionModel: Dispatch<SetStateAction<string>>;
  setSessionTemperature: Dispatch<SetStateAction<string>>;
  setSessionMaxTokens: Dispatch<SetStateAction<string>>;
  setSessionTimeoutMs: Dispatch<SetStateAction<string>>;
  setSessionRetryAttempts: Dispatch<SetStateAction<string>>;
  setSessionOverride: (conversationId: string, patch: SessionOverride) => void;
  clearSessionOverride: (conversationId: string) => void;
}

export const SettingsSessionSection = ({
  activeConversationId,
  sessionModel,
  sessionTemperature,
  sessionMaxTokens,
  sessionTimeoutMs,
  sessionRetryAttempts,
  setSessionModel,
  setSessionTemperature,
  setSessionMaxTokens,
  setSessionTimeoutMs,
  setSessionRetryAttempts,
  setSessionOverride,
  clearSessionOverride
}: SettingsSessionSectionProps) => (
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
          <label>
            温度
            <input
              type="number"
              step="0.1"
              value={sessionTemperature}
              onChange={(event) => setSessionTemperature(event.target.value)}
            />
          </label>
          <label>
            最大 Tokens
            <input
              type="number"
              value={sessionMaxTokens}
              onChange={(event) => setSessionMaxTokens(event.target.value)}
            />
          </label>
          <label>
            超时（毫秒）
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
              onChange={(event) => setSessionRetryAttempts(event.target.value)}
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
);

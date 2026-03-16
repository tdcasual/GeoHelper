import type { SettingsDataSectionProps } from "../SettingsDataSection";

type DataMaintenanceSectionProps = Pick<
  SettingsDataSectionProps,
  "debugEvents" | "onClearStoredSecrets" | "onClearDebugEvents"
>;

export const DataMaintenanceSection = ({
  debugEvents,
  onClearStoredSecrets,
  onClearDebugEvents
}: DataMaintenanceSectionProps) => (
  <>
    <section className="settings-section">
      <h3>安全</h3>
      <div className="settings-inline-actions">
        <button type="button" onClick={() => void onClearStoredSecrets()}>
          清除本地加密密钥与 BYOK 密文
        </button>
      </div>
    </section>

    <section className="settings-section">
      <h3>调试日志</h3>
      <div className="settings-inline-actions">
        <button type="button" onClick={onClearDebugEvents}>
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
);

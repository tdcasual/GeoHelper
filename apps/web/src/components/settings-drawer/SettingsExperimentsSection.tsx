import type { ExperimentFlags } from "../../state/settings-store";

interface SettingsExperimentsSectionProps {
  experimentFlags: ExperimentFlags;
  retryAttempts: number;
  onSetExperimentFlag: <K extends keyof ExperimentFlags>(
    key: K,
    value: ExperimentFlags[K]
  ) => void;
  onSetDefaultRetryAttempts: (count: number) => void;
}

export const SettingsExperimentsSection = ({
  experimentFlags,
  retryAttempts,
  onSetExperimentFlag,
  onSetDefaultRetryAttempts
}: SettingsExperimentsSectionProps) => (
  <section className="settings-section">
    <h3>实验开关</h3>
    <label className="settings-checkbox">
      <input
        data-testid="flag-show-agent-steps"
        type="checkbox"
        checked={experimentFlags.showAgentSteps}
        onChange={(event) =>
          onSetExperimentFlag("showAgentSteps", event.target.checked)
        }
      />
      显示代理步骤
    </label>
    <label className="settings-checkbox">
      <input
        type="checkbox"
        checked={experimentFlags.autoRetryEnabled}
        onChange={(event) =>
          onSetExperimentFlag("autoRetryEnabled", event.target.checked)
        }
      />
      自动重试
    </label>
    <label className="settings-checkbox">
      <input
        type="checkbox"
        checked={experimentFlags.requestTimeoutEnabled}
        onChange={(event) =>
          onSetExperimentFlag("requestTimeoutEnabled", event.target.checked)
        }
      />
      请求超时控制
    </label>
    <label className="settings-checkbox">
      <input
        type="checkbox"
        checked={experimentFlags.strictValidationEnabled}
        onChange={(event) =>
          onSetExperimentFlag("strictValidationEnabled", event.target.checked)
        }
      />
      严格模式校验
    </label>
    <label className="settings-checkbox">
      <input
        type="checkbox"
        checked={experimentFlags.fallbackSingleAgentEnabled}
        onChange={(event) =>
          onSetExperimentFlag("fallbackSingleAgentEnabled", event.target.checked)
        }
      />
      失败回退单代理
    </label>
    <label className="settings-checkbox">
      <input
        type="checkbox"
        checked={experimentFlags.debugLogPanelEnabled}
        onChange={(event) =>
          onSetExperimentFlag("debugLogPanelEnabled", event.target.checked)
        }
      />
      调试日志面板
    </label>
    <label className="settings-checkbox">
      <input
        type="checkbox"
        checked={experimentFlags.performanceSamplingEnabled}
        onChange={(event) =>
          onSetExperimentFlag("performanceSamplingEnabled", event.target.checked)
        }
      />
      性能采样上报
    </label>
    <label>
      默认重试次数
      <input
        type="number"
        value={retryAttempts}
        onChange={(event) => onSetDefaultRetryAttempts(Number(event.target.value))}
      />
    </label>
  </section>
);

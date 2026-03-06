import { ChatMode } from "../runtime/types";

interface ModelModeSwitcherProps {
  mode: ChatMode;
  officialEnabled: boolean;
  onChange: (mode: ChatMode) => void;
}

export const ModelModeSwitcher = ({
  mode,
  officialEnabled,
  onChange
}: ModelModeSwitcherProps) => (
  <label className="mode-switcher">
    <span>模式</span>
    <select
      aria-label="模式"
      value={mode}
      onChange={(event) => onChange(event.target.value as ChatMode)}
    >
      <option value="byok">BYOK</option>
      <option value="official" disabled={!officialEnabled}>
        官方
      </option>
    </select>
  </label>
);

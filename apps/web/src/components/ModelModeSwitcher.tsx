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
    <span>Mode</span>
    <select
      value={mode}
      onChange={(event) => onChange(event.target.value as ChatMode)}
    >
      <option value="byok">BYOK</option>
      <option value="official" disabled={!officialEnabled}>
        Official
      </option>
    </select>
  </label>
);

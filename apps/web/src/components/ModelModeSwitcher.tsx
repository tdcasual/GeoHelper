import { ChatMode } from "../services/api-client";

interface ModelModeSwitcherProps {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
}

export const ModelModeSwitcher = ({
  mode,
  onChange
}: ModelModeSwitcherProps) => (
  <label className="mode-switcher">
    <span>Mode</span>
    <select
      value={mode}
      onChange={(event) => onChange(event.target.value as ChatMode)}
    >
      <option value="byok">BYOK</option>
      <option value="official">Official</option>
    </select>
  </label>
);

import { FormEvent, useState } from "react";

interface TokenGateDialogProps {
  open: boolean;
  onSubmit: (token: string) => Promise<void>;
  onClose: () => void;
}

export const TokenGateDialog = ({
  open,
  onSubmit,
  onClose
}: TokenGateDialogProps) => {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return null;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      await onSubmit(token);
      setToken("");
    } catch {
      setError("Token 校验失败");
    }
  };

  return (
    <div className="token-gate-overlay" role="dialog" aria-modal="true">
      <form className="token-gate-card" onSubmit={handleSubmit}>
        <h2>Official Token</h2>
        <input
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="输入预设 Token"
        />
        {error ? <p className="token-gate-error">{error}</p> : null}
        <div className="token-gate-actions">
          <button type="submit">验证并继续</button>
          <button type="button" onClick={onClose}>
            取消
          </button>
        </div>
      </form>
    </div>
  );
};

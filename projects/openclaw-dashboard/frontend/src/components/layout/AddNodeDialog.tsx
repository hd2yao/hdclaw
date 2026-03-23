import { type FormEvent, useEffect, useState } from 'react';

interface AddNodeDialogProps {
  open: boolean;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: { name: string; url: string; token?: string }) => Promise<void>;
}

export function AddNodeDialog({ open, submitting, error, onClose, onSubmit }: AddNodeDialogProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValidationError(null);
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    const trimmedToken = token.trim();

    if (!trimmedName) {
      setValidationError('Node name is required.');
      return;
    }
    if (!/^wss?:\/\//i.test(trimmedUrl)) {
      setValidationError('URL must start with ws:// or wss://');
      return;
    }

    setValidationError(null);
    await onSubmit({
      name: trimmedName,
      url: trimmedUrl,
      token: trimmedToken ? trimmedToken : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(10,22,21,0.52)] p-4" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Connect OpenClaw node"
        className="w-full max-w-xl rounded-[24px] border border-[rgba(16,38,37,0.20)] bg-[rgba(255,251,244,0.97)] p-5 shadow-[0_28px_70px_rgba(14,20,20,0.35)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="text-xs uppercase tracking-[0.24em] text-[var(--accent-brass)]">Node onboarding</div>
        <h2 className="font-display mt-1 text-[36px] font-bold leading-[0.98] text-[var(--text-strong)]">Connect OpenClaw node</h2>
        <p className="mt-2 text-sm text-[var(--text-soft)]">
          This only registers a monitoring target. It does not send control commands to agents.
        </p>

        <form className="mt-4 space-y-3" onSubmit={(event) => void handleSubmit(event)}>
          <label className="block">
            <span className="text-xs uppercase tracking-[0.12em] text-[var(--text-soft)]">Node name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="openclaw-shanghai-1"
              className="mt-1 w-full rounded-[12px] border border-[rgba(16,38,37,0.15)] bg-white/70 px-3 py-2 text-sm text-[var(--text-strong)] outline-none focus:border-[var(--accent-brass)]"
              disabled={submitting}
            />
          </label>

          <label className="block">
            <span className="text-xs uppercase tracking-[0.12em] text-[var(--text-soft)]">Gateway URL</span>
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="ws://127.0.0.1:18890"
              className="mt-1 w-full rounded-[12px] border border-[rgba(16,38,37,0.15)] bg-white/70 px-3 py-2 text-sm text-[var(--text-strong)] outline-none focus:border-[var(--accent-brass)]"
              disabled={submitting}
            />
          </label>

          <label className="block">
            <span className="text-xs uppercase tracking-[0.12em] text-[var(--text-soft)]">Node token</span>
            <input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="optional-if-node-allows-anonymous"
              className="mt-1 w-full rounded-[12px] border border-[rgba(16,38,37,0.15)] bg-white/70 px-3 py-2 text-sm text-[var(--text-strong)] outline-none focus:border-[var(--accent-brass)]"
              disabled={submitting}
            />
          </label>

          {validationError ? (
            <div className="rounded-[10px] border border-[rgba(201,104,77,0.30)] bg-[rgba(201,104,77,0.10)] px-3 py-2 text-sm text-[#9d3a23]">
              {validationError}
            </div>
          ) : null}
          {error ? (
            <div className="rounded-[10px] border border-[rgba(201,104,77,0.30)] bg-[rgba(201,104,77,0.10)] px-3 py-2 text-sm text-[#9d3a23]">
              {error}
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[rgba(16,38,37,0.16)] px-4 py-2 text-sm text-[var(--text-strong)] transition hover:bg-[rgba(16,38,37,0.05)]"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-full bg-[rgba(18,49,49,0.90)] px-4 py-2 text-sm font-semibold text-[var(--text-light)] transition hover:bg-[rgba(18,49,49,0.80)] disabled:opacity-70"
              disabled={submitting}
            >
              {submitting ? 'Connecting...' : 'Connect node'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

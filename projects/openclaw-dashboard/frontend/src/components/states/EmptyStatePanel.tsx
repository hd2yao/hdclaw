interface EmptyStatePanelProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyStatePanel({ title, description, actionLabel, onAction }: EmptyStatePanelProps) {
  return (
    <section className="rounded-[20px] border border-dashed border-[rgba(16,38,37,0.24)] bg-[rgba(255,251,244,0.86)] p-6 text-[var(--text-strong)]">
      <h3 className="font-display text-[28px] font-bold leading-[1.05] text-[var(--text-strong)]">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-[var(--text-soft)]">{description}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 rounded-full border border-[rgba(18,49,49,0.20)] bg-[rgba(18,49,49,0.88)] px-4 py-2 text-sm font-semibold text-[var(--text-light)] transition hover:bg-[rgba(18,49,49,0.78)]"
        >
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}

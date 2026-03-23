interface EmptyStatePanelProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyStatePanel({ title, description, actionLabel, onAction }: EmptyStatePanelProps) {
  return (
    <section className="rounded-2xl border border-dashed border-white/20 bg-white/[0.03] p-6 text-slate-300">
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 rounded-full border border-cyan-400/40 bg-cyan-400/15 px-4 py-2 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-400/25"
        >
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}

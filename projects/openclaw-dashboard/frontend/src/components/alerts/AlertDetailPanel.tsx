import type { DashboardAlert } from '../../types/dashboard';
import { formatAbsoluteTime, formatRelativeTime } from '../../lib/utils';
import { StatusBadge } from '../states/StatusBadge';

interface AlertDetailPanelProps {
  alert: DashboardAlert | null;
}

export function AlertDetailPanel({ alert }: AlertDetailPanelProps) {
  if (!alert) {
    return (
      <section className="rounded-[28px] border border-[rgba(16,38,37,0.12)] bg-[rgba(255,251,244,0.88)] p-5 text-sm text-[var(--text-soft)]">
        Select an alert to inspect associated node, agent and timeline context.
      </section>
    );
  }

  return (
    <section
      className="rounded-[28px] p-5"
      style={{ backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.04), transparent 26%), linear-gradient(180deg, #1b4140, #123131)' }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-[var(--accent-brass)]">Alert Detail</div>
          <h3 className="font-display mt-2 text-[46px] font-bold leading-[0.95] text-[var(--text-light)]">{alert.summary}</h3>
        </div>
        <StatusBadge status={alert.severity} />
      </div>

      <dl className="mt-5 grid gap-3 text-sm text-[var(--text-light)] sm:grid-cols-2">
        <div className="rounded-[14px] border border-white/10 bg-[rgba(255,255,255,0.08)] p-3">
          <dt className="text-xs uppercase tracking-[0.2em] text-[rgba(248,244,236,0.65)]">Node</dt>
          <dd className="mt-1 text-[34px] font-bold leading-none">{alert.nodeName}</dd>
        </div>
        <div className="rounded-[14px] border border-white/10 bg-[rgba(255,255,255,0.08)] p-3">
          <dt className="text-xs uppercase tracking-[0.2em] text-[rgba(248,244,236,0.65)]">Agent</dt>
          <dd className="mt-1 text-[34px] font-bold leading-none">{alert.agentId ?? '--'}</dd>
        </div>
        <div className="rounded-[14px] border border-white/10 bg-[rgba(255,255,255,0.08)] p-3">
          <dt className="text-xs uppercase tracking-[0.2em] text-[rgba(248,244,236,0.65)]">Started</dt>
          <dd className="mt-1 text-[34px] font-bold leading-none">{formatAbsoluteTime(alert.createdAt)}</dd>
          <dd className="text-xs text-[rgba(248,244,236,0.65)]">{formatRelativeTime(alert.createdAt)}</dd>
        </div>
        <div className="rounded-[14px] border border-white/10 bg-[rgba(255,255,255,0.08)] p-3">
          <dt className="text-xs uppercase tracking-[0.2em] text-[rgba(248,244,236,0.65)]">Recovered</dt>
          <dd className="mt-1 text-[34px] font-bold leading-none">{alert.recovered ? 'Yes' : 'No'}</dd>
        </div>
      </dl>

      <div className="mt-4 rounded-[14px] border border-white/10 bg-[rgba(255,255,255,0.08)] p-4 text-sm text-[rgba(248,244,236,0.76)]">
        {alert.detail ?? 'No extra context from upstream event.'}
      </div>
    </section>
  );
}

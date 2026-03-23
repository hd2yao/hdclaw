import type { DashboardAlert } from '../../types/dashboard';
import { formatAbsoluteTime, formatRelativeTime } from '../../lib/utils';
import { StatusBadge } from '../states/StatusBadge';

interface AlertDetailPanelProps {
  alert: DashboardAlert | null;
}

export function AlertDetailPanel({ alert }: AlertDetailPanelProps) {
  if (!alert) {
    return (
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
        Select an alert to inspect associated node, agent and timeline context.
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Alert Detail</div>
          <h3 className="mt-2 text-xl font-semibold text-white">{alert.summary}</h3>
        </div>
        <StatusBadge status={alert.severity} />
      </div>

      <dl className="mt-5 grid gap-3 text-sm text-slate-300">
        <div className="rounded-xl bg-slate-900/70 p-3">
          <dt className="text-xs uppercase tracking-[0.2em] text-slate-500">Node</dt>
          <dd className="mt-1">{alert.nodeName}</dd>
        </div>
        <div className="rounded-xl bg-slate-900/70 p-3">
          <dt className="text-xs uppercase tracking-[0.2em] text-slate-500">Agent</dt>
          <dd className="mt-1">{alert.agentId ?? '--'}</dd>
        </div>
        <div className="rounded-xl bg-slate-900/70 p-3">
          <dt className="text-xs uppercase tracking-[0.2em] text-slate-500">Occurred</dt>
          <dd className="mt-1">{formatAbsoluteTime(alert.createdAt)}</dd>
          <dd className="text-xs text-slate-500">{formatRelativeTime(alert.createdAt)}</dd>
        </div>
      </dl>

      <div className="mt-4 rounded-xl border border-white/10 bg-slate-900/70 p-4 text-sm text-slate-300">
        {alert.detail ?? 'No extra context from upstream event.'}
      </div>
    </section>
  );
}

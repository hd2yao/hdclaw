import type { HealthState, SessionState } from '../../types/dashboard';
import { cn } from '../../lib/utils';

const palette: Record<HealthState | SessionState, string> = {
  online: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  degraded: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  offline: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
  running: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  completed: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  error: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  queued: 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
};

export function StatusBadge({ status }: { status: HealthState | SessionState }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1', palette[status])}>
      {status}
    </span>
  );
}

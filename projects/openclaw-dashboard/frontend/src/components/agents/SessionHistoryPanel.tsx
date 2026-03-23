import type { AgentTimelineEvent, DashboardAgentSummary, TimelineWindow } from '../../types/dashboard';
import { formatAbsoluteTime } from '../../lib/utils';
import { StatusBadge } from '../states/StatusBadge';
import { cn } from '../../lib/utils';

interface SessionHistoryPanelProps {
  agent: DashboardAgentSummary | null;
  events: AgentTimelineEvent[];
  window: TimelineWindow;
  onWindowChange: (window: TimelineWindow) => void;
}

export function SessionHistoryPanel({ agent, events, window, onWindowChange }: SessionHistoryPanelProps) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-glow">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Agent Timeline</div>
          <div className="text-lg font-semibold text-white">{agent?.name ?? 'Select an agent'}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onWindowChange('1h')}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] transition',
              window === '1h' ? 'border-cyan-300/60 bg-cyan-300/20 text-cyan-100' : 'border-white/20 text-slate-300',
            )}
          >
            1h
          </button>
          <button
            type="button"
            onClick={() => onWindowChange('24h')}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] transition',
              window === '24h' ? 'border-cyan-300/60 bg-cyan-300/20 text-cyan-100' : 'border-white/20 text-slate-300',
            )}
          >
            24h
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {events.map((event, index) => (
          <article key={`${event.createdAt}-${event.summary}-${index}`} className="rounded-xl border border-white/10 bg-slate-900/70 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">{event.summary}</div>
                <div className="mt-1 text-xs text-slate-500">{event.eventType}</div>
              </div>
              <StatusBadge status={event.status ?? 'unknown'} />
            </div>
            {event.detail ? <div className="mt-2 text-sm text-slate-300">{event.detail}</div> : null}
            <div className="mt-3 text-xs text-slate-500">{formatAbsoluteTime(event.createdAt)}</div>
          </article>
        ))}
        {!events.length ? (
          <div className="rounded-2xl border border-dashed border-white/15 p-6 text-sm text-slate-500">
            No timeline events in the current window.
          </div>
        ) : null}
      </div>
    </section>
  );
}

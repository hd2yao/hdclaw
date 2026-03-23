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
    <section
      className="rounded-[28px] p-5"
      style={{ backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.04), transparent 26%), linear-gradient(180deg, #1b4140, #123131)' }}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-[var(--accent-brass)]">Selected Timeline</div>
          <div className="font-display text-[30px] font-bold leading-[1.04] text-[var(--text-light)] md:text-[34px]">{agent?.name ?? 'Select an agent'}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onWindowChange('1h')}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] transition',
              window === '1h' ? 'bg-[rgba(18,49,49,0.88)] text-[var(--text-light)]' : 'bg-white/10 text-[rgba(248,244,236,0.70)]',
            )}
          >
            1h
          </button>
          <button
            type="button"
            onClick={() => onWindowChange('24h')}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] transition',
              window === '24h' ? 'bg-[rgba(18,49,49,0.88)] text-[var(--text-light)]' : 'bg-white/10 text-[rgba(248,244,236,0.70)]',
            )}
          >
            24h
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {events.map((event, index) => (
          <article key={`${event.createdAt}-${event.summary}-${index}`} className="rounded-[14px] border-l-2 border-l-[rgba(184,138,67,0.4)] bg-transparent p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.12em] text-[rgba(248,244,236,0.65)]">{formatAbsoluteTime(event.createdAt)}</div>
                <div className="mt-2 text-lg font-semibold text-[var(--text-light)]">{event.summary}</div>
                <div className="mt-1 text-sm text-[rgba(248,244,236,0.76)]">{event.eventType}</div>
              </div>
              <StatusBadge status={event.status ?? 'unknown'} />
            </div>
            {event.detail ? <div className="mt-2 text-sm text-[rgba(248,244,236,0.76)]">{event.detail}</div> : null}
          </article>
        ))}
        {!events.length ? (
          <div className="rounded-[20px] border border-dashed border-white/30 p-6 text-sm text-[rgba(248,244,236,0.70)]">
            No timeline events in the current window.
          </div>
        ) : null}
      </div>
    </section>
  );
}

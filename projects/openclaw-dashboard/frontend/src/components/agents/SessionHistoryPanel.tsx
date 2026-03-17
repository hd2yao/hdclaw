import type { AgentSummary, SessionEvent } from '../../types/dashboard';
import { StatusBadge } from '../states/StatusBadge';

interface SessionHistoryPanelProps {
  agent: AgentSummary | null;
  events: SessionEvent[];
}

export function SessionHistoryPanel({ agent, events }: SessionHistoryPanelProps) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-glow">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm text-slate-400">Session History</div>
          <div className="text-lg font-semibold text-white">{agent?.name ?? 'Select an agent'}</div>
        </div>
        {agent ? <StatusBadge status={agent.status} /> : null}
      </div>

      <div className="space-y-3">
        {events.map((event) => (
          <div key={event.id} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-white">{event.summary}</div>
              <StatusBadge status={event.status} />
            </div>
            <div className="mt-2 text-sm text-slate-400">{event.detail}</div>
            <div className="mt-3 text-xs uppercase tracking-[0.24em] text-slate-500">{new Date(event.timestamp).toLocaleString()}</div>
          </div>
        ))}
        {!events.length && <div className="rounded-2xl border border-dashed border-white/10 p-6 text-sm text-slate-500">没有历史不是好消息，只说明你还没把日志接进来。</div>}
      </div>
    </section>
  );
}

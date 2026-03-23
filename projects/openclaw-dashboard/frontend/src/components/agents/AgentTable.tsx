import type { DashboardAgentSummary } from '../../types/dashboard';
import { cn, formatDurationSince, formatRelativeTime } from '../../lib/utils';
import { StatusBadge } from '../states/StatusBadge';

interface AgentTableProps {
  agents: DashboardAgentSummary[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
}

export function AgentTable({ agents, selectedAgentId, onSelectAgent }: AgentTableProps) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-glow">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Agent Board</div>
          <div className="text-lg font-semibold text-white">Task summary + phase timeline anchor</div>
        </div>
        <div className="text-sm text-slate-500">{agents.length} agents</div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10">
        <div className="grid grid-cols-[1.8fr,0.8fr,1.8fr,1fr,0.8fr,0.9fr] bg-slate-900/90 px-4 py-3 text-xs uppercase tracking-[0.2em] text-slate-500">
          <div>Agent</div>
          <div>Status</div>
          <div>Task</div>
          <div>Phase</div>
          <div>Duration</div>
          <div>Updated</div>
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          {agents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => onSelectAgent(agent.id)}
              className={cn(
                'grid w-full grid-cols-[1.8fr,0.8fr,1.8fr,1fr,0.8fr,0.9fr] items-center gap-2 border-t border-white/5 px-4 py-3 text-left text-sm transition hover:bg-white/[0.04]',
                selectedAgentId === agent.id && 'bg-cyan-300/12',
              )}
            >
              <div>
                <div className="font-medium text-white">{agent.name}</div>
                <div className="text-xs text-slate-500">{agent.model ?? 'unknown model'}</div>
              </div>
              <div><StatusBadge status={agent.status} /></div>
              <div className="truncate text-slate-300">{agent.taskSummary ?? '--'}</div>
              <div className="truncate text-slate-300">{agent.taskPhase ?? '--'}</div>
              <div className="text-slate-400">{formatDurationSince(agent.taskStartedAt)}</div>
              <div className="text-slate-500">{formatRelativeTime(agent.updatedAt)}</div>
            </button>
          ))}
          {agents.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">This node currently has no agents.</div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

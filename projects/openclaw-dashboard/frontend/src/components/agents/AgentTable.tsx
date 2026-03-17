import type { AgentSummary } from '../../types/dashboard';
import { formatPercent, formatRelativeTime } from '../../lib/utils';
import { StatusBadge } from '../states/StatusBadge';
import { cn } from '../../lib/utils';

interface AgentTableProps {
  agents: AgentSummary[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
}

export function AgentTable({ agents, selectedAgentId, onSelectAgent }: AgentTableProps) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-glow">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <div className="text-sm text-slate-400">Agents</div>
          <div className="text-lg font-semibold text-white">虚拟化列表入口（支持 100+ agents）</div>
        </div>
        <div className="text-sm text-slate-500">下一步接入 react-virtualized / TanStack Virtual</div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10">
        <div className="grid grid-cols-[2.1fr,1.3fr,0.9fr,0.9fr,1fr,1fr] bg-slate-900/90 px-4 py-3 text-xs uppercase tracking-[0.2em] text-slate-500">
          <div>Agent</div>
          <div>Session</div>
          <div>Status</div>
          <div>CPU</div>
          <div>Memory</div>
          <div>Updated</div>
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          {agents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => onSelectAgent(agent.id)}
              className={cn(
                'grid w-full grid-cols-[2.1fr,1.3fr,0.9fr,0.9fr,1fr,1fr] items-center border-t border-white/5 px-4 py-3 text-left text-sm transition hover:bg-white/[0.04]',
                selectedAgentId === agent.id && 'bg-cyan-400/10',
              )}
            >
              <div>
                <div className="font-medium text-white">{agent.name}</div>
                <div className="text-xs text-slate-500">{agent.role}</div>
              </div>
              <div className="truncate text-slate-300">{agent.sessionId}</div>
              <div><StatusBadge status={agent.status} /></div>
              <div className="text-slate-300">{formatPercent(agent.cpu)}</div>
              <div className="text-slate-300">{formatPercent(agent.memory)}</div>
              <div className="text-slate-500">{formatRelativeTime(agent.updatedAt)}</div>
            </button>
          ))}
          {agents.length === 0 && <div className="p-8 text-center text-sm text-slate-500">This node has no active agents.</div>}
        </div>
      </div>
    </section>
  );
}

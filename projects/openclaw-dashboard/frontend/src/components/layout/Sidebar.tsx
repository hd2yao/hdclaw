import { ActivitySquare, Bot, Server } from 'lucide-react';
import type { DashboardOverviewNode } from '../../types/dashboard';
import { StatusBadge } from '../states/StatusBadge';
import { cn, formatPercent, formatRelativeTime } from '../../lib/utils';

interface SidebarProps {
  nodes: DashboardOverviewNode[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

export function Sidebar({ nodes, selectedNodeId, onSelectNode }: SidebarProps) {
  const recentOutput = nodes
    .flatMap((node) =>
      node.agents
        .filter((agent) => agent.taskSummary && agent.taskSummary !== 'Idle')
        .slice(0, 2)
        .map((agent) => ({
          id: `${node.id}-${agent.id}`,
          text: `${agent.taskSummary} · ${agent.name}`,
        })),
    )
    .slice(0, 3);

  return (
    <aside
      className="h-full p-7 text-[var(--text-light)]"
      style={{
        backgroundImage:
          'linear-gradient(180deg, rgba(255,255,255,0.06), transparent 20%), linear-gradient(180deg, #143636 0%, #0d2425 100%)',
      }}
    >
      <div className="mb-5 border-b border-white/10 pb-5">
        <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[rgba(248,244,236,0.70)]">
          <Server className="h-4 w-4" /> Node Fleet
        </div>
        <h1 className="font-display text-[42px] font-bold leading-[0.95] text-[var(--text-light)]">OpenClaw Monitor</h1>
        <p className="mt-3 text-sm text-[rgba(248,244,236,0.76)]">Select a node to inspect agents, timeline, and resource pressure.</p>
      </div>

      <div className="space-y-3">
        {nodes.map((node) => {
          const onlineAgents = node.agents.filter((agent) => agent.status !== 'offline').length;
          const busyAgents = node.agents.filter((agent) => agent.busy).length;

          return (
            <button
              key={node.id}
              type="button"
              aria-selected={selectedNodeId === node.id}
              onClick={() => onSelectNode(node.id)}
              className={cn(
                'w-full rounded-[20px] border border-white/10 bg-white/5 p-4 text-left transition',
                selectedNodeId === node.id
                  ? 'border-[rgba(121,199,167,0.32)] bg-[linear-gradient(157deg,rgba(121,199,167,0.24),rgba(184,138,67,0.18))]'
                  : 'hover:border-white/20',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[29px] font-bold leading-[1.05] text-[var(--text-light)]">{node.name}</div>
                  <div className="mt-1 text-xs text-[rgba(248,244,236,0.70)]">{node.url}</div>
                </div>
                <StatusBadge status={node.status} />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-[14px] bg-[rgba(0,0,0,0.18)] p-2.5">
                  <div className="flex items-center gap-1 text-xs text-[rgba(248,244,236,0.70)]">
                    <Bot className="h-3.5 w-3.5" /> Agents
                  </div>
                  <div className="mt-1 text-2xl font-bold text-[var(--text-light)]">{onlineAgents}/{node.agents.length}</div>
                </div>
                <div className="rounded-[14px] bg-[rgba(0,0,0,0.18)] p-2.5">
                  <div className="flex items-center gap-1 text-xs text-[rgba(248,244,236,0.70)]">
                    <ActivitySquare className="h-3.5 w-3.5" /> Busy
                  </div>
                  <div className="mt-1 text-2xl font-bold text-[var(--text-light)]">{busyAgents}</div>
                </div>
              </div>

              <div className="mt-3 text-xs text-[rgba(248,244,236,0.70)]">
                Last heartbeat {formatRelativeTime(node.lastSeenAt)}
                {node.resources ? ` · CPU ${formatPercent(node.resources.cpuPercent)}` : ''}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        <div className="mb-2 text-xs uppercase tracking-[0.2em] text-[rgba(248,244,236,0.70)]">Recent Output</div>
        <ul className="space-y-2 pl-5 text-sm text-[rgba(248,244,236,0.76)]">
          {recentOutput.length ? (
            recentOutput.map((item) => (
              <li key={item.id} className="leading-5">
                {item.text}
              </li>
            ))
          ) : (
            <li className="list-none pl-0 text-xs text-[rgba(248,244,236,0.60)]">
              No recent task summary yet.
            </li>
          )}
        </ul>
      </div>
    </aside>
  );
}

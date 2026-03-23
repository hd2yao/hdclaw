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
  return (
    <aside className="h-full rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-4 border-b border-white/10 pb-4">
        <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500">
          <Server className="h-4 w-4" /> Node Fleet
        </div>
        <h1 className="text-2xl font-semibold text-white">OpenClaw Monitor</h1>
        <p className="mt-1 text-sm text-slate-400">Select a node to inspect agents, timeline, and resource pressure.</p>
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
                'w-full rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-left transition hover:border-white/20',
                selectedNodeId === node.id && 'border-cyan-300/60 bg-cyan-300/12',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-white">{node.name}</div>
                  <div className="text-xs text-slate-500">{node.url}</div>
                </div>
                <StatusBadge status={node.status} />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-slate-950/70 p-2">
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <Bot className="h-3.5 w-3.5" /> Agents
                  </div>
                  <div className="mt-1 font-semibold text-slate-100">{onlineAgents}/{node.agents.length}</div>
                </div>
                <div className="rounded-lg bg-slate-950/70 p-2">
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <ActivitySquare className="h-3.5 w-3.5" /> Busy
                  </div>
                  <div className="mt-1 font-semibold text-slate-100">{busyAgents}</div>
                </div>
              </div>

              <div className="mt-3 text-xs text-slate-500">
                Last heartbeat {formatRelativeTime(node.lastSeenAt)}
                {node.resources ? ` · CPU ${formatPercent(node.resources.cpuPercent)}` : ''}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

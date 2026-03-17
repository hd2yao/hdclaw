import { ActivitySquare, Bot, Server } from 'lucide-react';
import type { NodeSummary } from '../../types/dashboard';
import { StatusBadge } from '../states/StatusBadge';
import { cn, formatPercent } from '../../lib/utils';

interface SidebarProps {
  nodes: NodeSummary[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

export function Sidebar({ nodes, selectedNodeId, onSelectNode }: SidebarProps) {
  return (
    <aside className="flex h-full min-w-[320px] max-w-[360px] flex-col border-r border-white/10 bg-slate-950/80 backdrop-blur">
      <div className="border-b border-white/10 p-5">
        <div className="mb-2 flex items-center gap-2 text-sm text-slate-400">
          <Server className="h-4 w-4" /> OpenClaw Nodes
        </div>
        <h1 className="text-2xl font-semibold text-white">Fleet Dashboard</h1>
        <p className="mt-2 text-sm text-slate-400">一眼看穿节点生死、agent 堆积和资源压力。</p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {nodes.map((node) => (
          <button
            key={node.id}
            type="button"
            onClick={() => onSelectNode(node.id)}
            className={cn(
              'w-full rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left shadow-glow transition hover:border-cyan-400/40 hover:bg-white/[0.05]',
              selectedNodeId === node.id && 'border-cyan-400/50 bg-cyan-400/10',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm text-slate-400">{node.region}</div>
                <div className="mt-1 text-lg font-semibold text-white">{node.name}</div>
              </div>
              <StatusBadge status={node.status} />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-slate-900/70 p-3">
                <div className="flex items-center gap-2 text-slate-400"><Bot className="h-4 w-4" /> Agents</div>
                <div className="mt-2 text-lg font-semibold text-white">{node.agentsOnline}/{node.totalAgents}</div>
              </div>
              <div className="rounded-xl bg-slate-900/70 p-3">
                <div className="flex items-center gap-2 text-slate-400"><ActivitySquare className="h-4 w-4" /> Load</div>
                <div className="mt-2 text-lg font-semibold text-white">{formatPercent(node.cpu)}</div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}

import { Cpu, MemoryStick, MessagesSquare, PlugZap } from 'lucide-react';
import type { NodeSummary } from '../../types/dashboard';
import { formatPercent, formatRelativeTime } from '../../lib/utils';
import { StatusBadge } from '../states/StatusBadge';

const metrics = [
  { key: 'cpu', label: 'CPU', icon: Cpu },
  { key: 'memory', label: 'Memory', icon: MemoryStick },
];

export function NodeOverview({ node }: { node: NodeSummary }) {
  return (
    <section className="grid gap-4 xl:grid-cols-[1.4fr,1fr]">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-glow">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm text-slate-400">Node Detail</div>
            <div className="mt-1 text-2xl font-semibold text-white">{node.name}</div>
            <div className="mt-2 text-sm text-slate-400">{node.endpoint}</div>
          </div>
          <StatusBadge status={node.status} />
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {metrics.map(({ key, label, icon: Icon }) => (
            <div key={key} className="rounded-2xl bg-slate-900/70 p-4">
              <div className="flex items-center gap-2 text-sm text-slate-400"><Icon className="h-4 w-4" /> {label}</div>
              <div className="mt-3 text-3xl font-semibold text-white">{formatPercent(node[key as 'cpu' | 'memory'])}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-glow">
          <div className="flex items-center gap-2 text-sm text-slate-400"><MessagesSquare className="h-4 w-4" /> Message Traffic</div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Metric label="Sent" value={node.messages.sent.toLocaleString()} />
            <Metric label="Recv" value={node.messages.received.toLocaleString()} />
            <Metric label="Errors" value={node.messages.errors.toLocaleString()} />
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-glow">
          <div className="flex items-center gap-2 text-sm text-slate-400"><PlugZap className="h-4 w-4" /> Heartbeat</div>
          <div className="mt-3 text-2xl font-semibold text-white">{formatRelativeTime(node.lastHeartbeat)}</div>
          <div className="mt-2 text-sm text-slate-500">如果这个时间越来越长，说明不是系统稳定，是节点快死了。</div>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-900/70 p-3">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-semibold text-white">{value}</div>
    </div>
  );
}

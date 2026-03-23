import { MessagesSquare, PlugZap, Server, Workflow } from 'lucide-react';
import type { ReactNode } from 'react';
import type { DashboardNodeDetail } from '../../types/dashboard';
import { formatAbsoluteTime, formatPercent, formatRelativeTime } from '../../lib/utils';
import { StatusBadge } from '../states/StatusBadge';

interface NodeOverviewProps {
  node: DashboardNodeDetail;
}

export function NodeOverview({ node }: NodeOverviewProps) {
  return (
    <section className="grid gap-4 xl:grid-cols-[1.4fr,1fr]">
      <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-glow">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Node Detail</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">{node.name}</h2>
            <div className="mt-2 text-sm text-slate-400">{node.url}</div>
          </div>
          <StatusBadge status={node.status} />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Metric label="Gateway" value={node.gateway?.status ?? 'unknown'} icon={<Workflow className="h-4 w-4" />} />
          <Metric label="Port" value={node.gateway?.port ? String(node.gateway.port) : '--'} icon={<Server className="h-4 w-4" />} />
          <Metric label="CPU" value={formatPercent(node.resources?.cpuPercent)} icon={<Workflow className="h-4 w-4" />} />
          <Metric
            label="Memory"
            value={node.resources?.memoryUsedMb && node.resources?.memoryTotalMb
              ? `${Math.round(node.resources.memoryUsedMb)} / ${Math.round(node.resources.memoryTotalMb)} MB`
              : '--'}
            icon={<Workflow className="h-4 w-4" />}
          />
        </div>
      </article>

      <article className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-glow">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500">
          <MessagesSquare className="h-4 w-4" /> Message Counters
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Inbound" value={String(node.messages?.inbound ?? 0)} />
          <Metric label="Outbound" value={String(node.messages?.outbound ?? 0)} />
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500">
            <PlugZap className="h-4 w-4" /> Heartbeat
          </div>
          <div className="mt-2 text-lg font-semibold text-white">{formatRelativeTime(node.lastSeenAt)}</div>
          <div className="mt-1 text-xs text-slate-500">{formatAbsoluteTime(node.lastSeenAt)}</div>
        </div>
      </article>
    </section>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

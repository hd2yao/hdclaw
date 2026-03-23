import { MessagesSquare, PlugZap, Server, Workflow } from 'lucide-react';
import type { ReactNode } from 'react';
import type { DashboardNodeDetail } from '../../types/dashboard';
import { formatAbsoluteTime, formatPercent, formatRelativeTime } from '../../lib/utils';
import { StatusBadge } from '../states/StatusBadge';

interface NodeOverviewProps {
  node: DashboardNodeDetail;
}

export function NodeOverview({ node }: NodeOverviewProps) {
  const onlineAgents = node.agents.filter((agent) => agent.status !== 'offline').length;

  return (
    <section className="grid gap-4 xl:grid-cols-[1.4fr,1fr]">
      <article className="rounded-[28px] border border-[rgba(16,38,37,0.12)] bg-[rgba(255,251,244,0.88)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-[0.24em] text-[var(--accent-brass)]">Selected node</div>
            <h2 className="font-display mt-2 text-[32px] font-bold leading-[1.02] text-[var(--text-strong)] sm:text-[42px] [overflow-wrap:anywhere]">
              {node.name}
            </h2>
          </div>
          <StatusBadge status={node.status} />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Metric label="Endpoint" value={node.url} icon={<Server className="h-4 w-4" />} />
          <Metric label="Agents" value={`${onlineAgents} / ${node.agents.length} online`} icon={<Workflow className="h-4 w-4" />} />
          <Metric label="Messages" value={`${node.messages?.inbound ?? 0} / h`} icon={<MessagesSquare className="h-4 w-4" />} />
          <Metric label="Last drift" value={node.resources?.cpuPercent && node.resources.cpuPercent > 80 ? 'cpu elevated' : 'none in 24h'} icon={<Workflow className="h-4 w-4" />} />
        </div>
      </article>

      <article
        className="space-y-3 rounded-[28px] p-5"
        style={{ backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.04), transparent 26%), linear-gradient(180deg, #1b4140, #123131)' }}
      >
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[var(--accent-brass)]">
          <MessagesSquare className="h-4 w-4" /> Message Counters
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Inbound" value={String(node.messages?.inbound ?? 0)} />
          <Metric label="Outbound" value={String(node.messages?.outbound ?? 0)} />
        </div>
        <div className="rounded-[14px] border border-white/10 bg-[rgba(255,255,255,0.06)] p-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[rgba(248,244,236,0.65)]">
            <PlugZap className="h-4 w-4" /> Heartbeat
          </div>
          <div className="mt-2 text-2xl font-bold text-[var(--text-light)]">{formatRelativeTime(node.lastSeenAt)}</div>
          <div className="mt-1 text-xs text-[rgba(248,244,236,0.65)]">{formatAbsoluteTime(node.lastSeenAt)}</div>
        </div>
        <div className="rounded-[14px] border border-white/10 bg-[rgba(255,255,255,0.06)] p-3">
          <div className="text-xs uppercase tracking-[0.2em] text-[rgba(248,244,236,0.65)]">Load</div>
          <div className="mt-2 text-sm text-[var(--text-light)]">
            CPU {formatPercent(node.resources?.cpuPercent)} · Memory{' '}
            {node.resources?.memoryUsedMb && node.resources?.memoryTotalMb
              ? `${Math.round(node.resources.memoryUsedMb)} / ${Math.round(node.resources.memoryTotalMb)} MB`
              : '--'}
          </div>
        </div>
      </article>
    </section>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  const isDarkPanelMetric = label === 'Inbound' || label === 'Outbound';
  const isEndpoint = label === 'Endpoint';
  return (
    <div
      className="rounded-[14px] p-3"
      style={
        isDarkPanelMetric
          ? { border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.08)' }
          : { border: '1px solid rgba(16,38,37,0.12)', background: 'rgba(255,251,244,0.86)' }
      }
    >
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[var(--text-soft)]">
        {icon}
        {label}
      </div>
      <div
        className={
          isDarkPanelMetric
            ? 'mt-2 text-[34px] font-bold leading-[1.05] text-[var(--text-light)]'
            : isEndpoint
              ? 'mt-2 text-sm font-semibold leading-[1.35] text-[var(--text-strong)] [overflow-wrap:anywhere]'
              : 'mt-2 text-[26px] font-bold leading-[1.1] text-[var(--text-strong)]'
        }
      >
        {value}
      </div>
    </div>
  );
}

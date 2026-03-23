import type { DashboardSummary } from '../../types/dashboard';

interface GlobalSummaryProps {
  summary: DashboardSummary;
}

interface SummaryMetric {
  label: string;
  value: string;
  hint: string;
}

export function GlobalSummary({ summary }: GlobalSummaryProps) {
  const metrics: SummaryMetric[] = [
    {
      label: 'Online Nodes',
      value: String(summary.onlineNodes),
      hint: `Total ${summary.nodeCount} nodes`,
    },
    {
      label: 'Busy Agents',
      value: String(summary.busyAgents),
      hint: `${summary.idleAgents} idle now`,
    },
    {
      label: 'Active Risks',
      value: String(summary.degradedNodes + summary.offlineNodes),
      hint: `${summary.offlineNodes} offline / ${summary.degradedNodes} degraded`,
    },
    {
      label: 'Recent Output',
      value: String(summary.outputsLastHour),
      hint: `Stale agents ${summary.staleAgents}`,
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <article key={metric.label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-glow">
          <div className="text-xs uppercase tracking-[0.24em] text-slate-500">{metric.label}</div>
          <div className="mt-3 text-3xl font-semibold text-white">{metric.value}</div>
          <div className="mt-2 text-sm text-slate-400">{metric.hint}</div>
        </article>
      ))}
    </section>
  );
}

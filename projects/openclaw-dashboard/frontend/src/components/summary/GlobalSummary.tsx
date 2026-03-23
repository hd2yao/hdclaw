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
      {metrics.map((metric, index) => (
        <article
          key={metric.label}
          className="rounded-[20px] border border-[rgba(16,38,37,0.12)] p-4"
          style={index === 1 ? { backgroundImage: 'linear-gradient(149deg, rgba(184,138,67,0.18), rgba(121,199,167,0.18))' } : { backgroundColor: 'rgba(255,251,244,0.86)' }}
        >
          <div className="text-xs uppercase tracking-[0.2em] text-[var(--text-soft)]">{metric.label}</div>
          <div className="mt-2 text-[42px] font-bold leading-none text-[var(--text-strong)]">{metric.value}</div>
          <div className="mt-2 text-sm text-[var(--text-soft)]">{metric.hint}</div>
        </article>
      ))}
    </section>
  );
}

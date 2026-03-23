import { useMemo, useState } from 'react';
import { AlertDetailPanel } from '../components/alerts/AlertDetailPanel';
import { AlertFilterBar } from '../components/alerts/AlertFilterBar';
import { EmptyStatePanel } from '../components/states/EmptyStatePanel';
import { formatRelativeTime } from '../lib/utils';
import type { AlertFilter, DashboardAlert } from '../types/dashboard';
import { cn } from '../lib/utils';

interface AlertsPageProps {
  alerts: DashboardAlert[];
  nodes: Array<{ id: string; name: string }>;
}

export function AlertsPage({ alerts, nodes }: AlertsPageProps) {
  const [filter, setFilter] = useState<AlertFilter>('all');
  const [nodeFilter, setNodeFilter] = useState('');
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);

  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      if (filter !== 'all' && alert.severity !== filter) return false;
      if (nodeFilter && alert.nodeId !== nodeFilter) return false;
      return true;
    });
  }, [alerts, filter, nodeFilter]);

  const selectedAlert = filteredAlerts.find((alert) => alert.id === selectedAlertId) ?? filteredAlerts[0] ?? null;
  const severityAccent = (severity: DashboardAlert['severity']) => {
    if (severity === 'critical') return 'border-l-[var(--accent-red)]';
    if (severity === 'warning') return 'border-l-[var(--accent-amber)]';
    return 'border-l-[var(--accent-mint)]';
  };

  return (
    <section className="space-y-4">
      <AlertFilterBar
        filter={filter}
        nodeFilter={nodeFilter}
        nodes={nodes}
        onFilterChange={setFilter}
        onNodeFilterChange={setNodeFilter}
      />

      {!filteredAlerts.length ? (
        <EmptyStatePanel
          title="No alerts in this filter"
          description="Switch severity or node filter to inspect a wider incident window."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.2fr,1fr]">
          <section className="rounded-[28px] border border-[rgba(16,38,37,0.12)] bg-[rgba(255,251,244,0.88)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-[42px] font-bold leading-[0.95] text-[var(--text-strong)]">Incidents with enough context to act</h3>
              <span className="rounded-full bg-[rgba(18,49,49,0.88)] px-3 py-1 text-xs uppercase tracking-[0.1em] text-[var(--text-light)]">
                {filteredAlerts.length} active
              </span>
            </div>
            <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
              {filteredAlerts.map((alert) => (
                <button
                  key={alert.id}
                  type="button"
                  onClick={() => setSelectedAlertId(alert.id)}
                  className={cn(
                    'w-full rounded-[20px] border border-[rgba(16,38,37,0.20)] border-l-4 bg-[rgba(19,49,49,0.05)] p-3 text-left transition',
                    severityAccent(alert.severity),
                    selectedAlert?.id === alert.id && 'bg-[rgba(184,138,67,0.09)]',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.14em] text-[var(--accent-brass)]">
                        {alert.severity} · {alert.nodeName}
                      </div>
                      <div className="mt-1 text-lg font-semibold text-[var(--text-strong)]">{alert.summary}</div>
                      <div className="mt-1 text-sm text-[var(--text-soft)]">{alert.detail ?? 'No extra context.'}</div>
                    </div>
                    <div className="text-base text-[var(--text-strong)]">{formatRelativeTime(alert.createdAt)}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>
          <AlertDetailPanel alert={selectedAlert} />
        </div>
      )}
    </section>
  );
}

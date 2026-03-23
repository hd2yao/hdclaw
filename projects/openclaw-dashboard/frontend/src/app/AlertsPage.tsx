import { useMemo, useState } from 'react';
import { AlertDetailPanel } from '../components/alerts/AlertDetailPanel';
import { AlertFilterBar } from '../components/alerts/AlertFilterBar';
import { EmptyStatePanel } from '../components/states/EmptyStatePanel';
import { StatusBadge } from '../components/states/StatusBadge';
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
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Alerts / Events</h3>
              <span className="text-sm text-slate-400">{filteredAlerts.length} items</span>
            </div>
            <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
              {filteredAlerts.map((alert) => (
                <button
                  key={alert.id}
                  type="button"
                  onClick={() => setSelectedAlertId(alert.id)}
                  className={cn(
                    'w-full rounded-xl border border-white/10 bg-slate-900/70 p-3 text-left transition hover:border-white/20',
                    selectedAlert?.id === alert.id && 'border-cyan-300/60 bg-cyan-300/12',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{alert.summary}</div>
                      <div className="mt-1 text-xs text-slate-400">{alert.nodeName} · {alert.agentId ?? 'system'}</div>
                    </div>
                    <StatusBadge status={alert.severity} />
                  </div>
                  <div className="mt-2 text-xs text-slate-500">{formatRelativeTime(alert.createdAt)}</div>
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

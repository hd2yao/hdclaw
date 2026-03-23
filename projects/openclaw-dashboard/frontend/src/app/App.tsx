import { useMemo, useState } from 'react';
import { SessionHistoryPanel } from '../components/agents/SessionHistoryPanel';
import { AgentTable } from '../components/agents/AgentTable';
import { ResourceChart } from '../components/charts/ResourceChart';
import { Sidebar } from '../components/layout/Sidebar';
import { Topbar } from '../components/layout/Topbar';
import { NodeOverview } from '../components/nodes/NodeOverview';
import { EmptyStatePanel } from '../components/states/EmptyStatePanel';
import { DashboardSkeleton } from '../components/states/DashboardSkeleton';
import { GlobalSummary } from '../components/summary/GlobalSummary';
import { useDashboardSocket } from '../hooks/useDashboardSocket';
import type { DashboardNodeDetail } from '../types/dashboard';
import { AlertsPage } from './AlertsPage';

export default function App() {
  const [view, setView] = useState<'dashboard' | 'alerts'>('dashboard');
  const {
    overview,
    selectedNode,
    selectedNodeDetail,
    selectedAgent,
    timeline,
    timelineWindow,
    wsState,
    loading,
    timedOut,
    refreshing,
    stale,
    error,
    alerts,
    selectNode,
    selectAgent,
    setTimelineWindow,
    retry,
  } = useDashboardSocket();

  const activeNodeDetail = useMemo<DashboardNodeDetail | null>(() => {
    if (selectedNodeDetail && selectedNode && selectedNodeDetail.id === selectedNode.id) {
      return selectedNodeDetail;
    }
    if (!selectedNode) return null;
    return {
      ...selectedNode,
      resourceHistory: selectedNode.resources ? [selectedNode.resources] : [],
    };
  }, [selectedNode, selectedNodeDetail]);

  if (loading && !overview) {
    return <DashboardSkeleton />;
  }

  if (timedOut && !overview) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(14,116,144,0.25),transparent_45%),#020617] p-5">
        <div className="mx-auto max-w-4xl pt-24">
          <EmptyStatePanel
            title="Initial load timed out"
            description="Dashboard did not receive the first snapshot in 5 seconds. Retry after confirming backend and node connectivity."
            actionLabel="Retry"
            onAction={() => void retry()}
          />
        </div>
      </div>
    );
  }

  if (error && !overview) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(14,116,144,0.25),transparent_45%),#020617] p-5">
        <div className="mx-auto max-w-4xl pt-24">
          <EmptyStatePanel title="Failed to load dashboard" description={error} actionLabel="Retry" onAction={() => void retry()} />
        </div>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(14,116,144,0.25),transparent_45%),#020617] p-5">
        <div className="mx-auto max-w-4xl pt-24">
          <EmptyStatePanel title="No overview available" description="Backend returned no dashboard snapshot." />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(14,116,144,0.25),transparent_45%),#020617] p-4 text-slate-100 lg:p-5">
      <div className="mx-auto grid max-w-[1600px] gap-4 lg:grid-cols-[320px,1fr]">
        <Sidebar
          nodes={overview.nodes}
          selectedNodeId={selectedNode?.id ?? null}
          onSelectNode={selectNode}
        />

        <main className="space-y-4">
          <Topbar wsState={wsState} refreshing={refreshing} stale={stale} view={view} onViewChange={setView} />

          {view === 'alerts' ? (
            <AlertsPage
              alerts={alerts}
              nodes={overview.nodes.map((node) => ({ id: node.id, name: node.name }))}
            />
          ) : (
            <>
              <GlobalSummary summary={overview.summary} />

              {activeNodeDetail ? (
                <>
                  <NodeOverview node={activeNodeDetail} />
                  <ResourceChart history={activeNodeDetail.resourceHistory} />
                  <section className="grid gap-4 xl:grid-cols-[1.15fr,1fr]">
                    <AgentTable
                      agents={activeNodeDetail.agents}
                      selectedAgentId={selectedAgent?.id ?? null}
                      onSelectAgent={selectAgent}
                    />
                    <SessionHistoryPanel
                      agent={selectedAgent}
                      events={timeline}
                      window={timelineWindow}
                      onWindowChange={setTimelineWindow}
                    />
                  </section>
                </>
              ) : (
                <EmptyStatePanel
                  title="No node selected"
                  description="Select a node in the left rail to inspect its details, agents and timeline."
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

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
      <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3e9_0%,#f3ede2_100%)] p-5">
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
      <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3e9_0%,#f3ede2_100%)] p-5">
        <div className="mx-auto max-w-4xl pt-24">
          <EmptyStatePanel title="Failed to load dashboard" description={error} actionLabel="Retry" onAction={() => void retry()} />
        </div>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3e9_0%,#f3ede2_100%)] p-5">
        <div className="mx-auto max-w-4xl pt-24">
          <EmptyStatePanel title="No overview available" description="Backend returned no dashboard snapshot." />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="mx-auto max-w-[1480px] rounded-[34px] border border-[rgba(19,49,49,0.10)] bg-[rgba(255,251,244,0.7)] p-px shadow-[0_20px_60px_rgba(29,33,31,0.12)]">
        <div className="grid min-h-[calc(100vh-72px)] overflow-hidden rounded-[32px] lg:grid-cols-[320px,1fr]">
          <Sidebar
            nodes={overview.nodes}
            selectedNodeId={selectedNode?.id ?? null}
            onSelectNode={selectNode}
          />

          <main className="space-y-4 bg-[linear-gradient(180deg,rgba(255,254,251,0.70),rgba(241,234,219,0.78))] px-4 py-4 text-[var(--text-strong)] lg:px-6 lg:py-6">
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
    </div>
  );
}

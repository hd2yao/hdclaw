import { AgentTable } from '../components/agents/AgentTable';
import { SessionHistoryPanel } from '../components/agents/SessionHistoryPanel';
import { EmptyStatePanel } from '../components/states/EmptyStatePanel';
import type {
  AgentTimelineEvent,
  DashboardAgentSummary,
  DashboardNodeDetail,
  TimelineWindow,
} from '../types/dashboard';
import { formatRelativeTime } from '../lib/utils';

interface AgentWorkDetailPageProps {
  node: DashboardNodeDetail | null;
  selectedAgent: DashboardAgentSummary | null;
  selectedAgentId: string | null;
  timeline: AgentTimelineEvent[];
  timelineWindow: TimelineWindow;
  onSelectAgent: (agentId: string) => void;
  onTimelineWindowChange: (window: TimelineWindow) => void;
}

export function AgentWorkDetailPage({
  node,
  selectedAgent,
  selectedAgentId,
  timeline,
  timelineWindow,
  onSelectAgent,
  onTimelineWindowChange,
}: AgentWorkDetailPageProps) {
  if (!node) {
    return (
      <EmptyStatePanel
        title="Agent work detail unavailable"
        description="Select a node first, then inspect a specific agent's active task and timeline."
      />
    );
  }

  return (
    <section className="space-y-4">
      <article className="rounded-[20px] border border-[rgba(16,38,37,0.12)] bg-[rgba(255,251,244,0.88)] p-4">
        <div className="text-xs uppercase tracking-[0.24em] text-[var(--accent-brass)]">Agent work detail</div>
        <h2 className="font-display mt-1 text-[30px] font-bold leading-[1.04] text-[var(--text-strong)] md:text-[34px]">Agent work detail</h2>
        {selectedAgent ? (
          <div className="mt-2 grid gap-2 text-sm text-[var(--text-soft)] sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-[12px] bg-[rgba(18,49,49,0.06)] px-3 py-2">
              <div className="text-xs uppercase tracking-[0.1em]">Agent</div>
              <div className="mt-1 font-semibold text-[var(--text-strong)]">{selectedAgent.name}</div>
              <div className="text-xs">ID: {selectedAgent.id}</div>
            </div>
            <div className="rounded-[12px] bg-[rgba(18,49,49,0.06)] px-3 py-2">
              <div className="text-xs uppercase tracking-[0.1em]">Model</div>
              <div className="mt-1 font-semibold text-[var(--text-strong)]">{selectedAgent.model ?? 'unknown model'}</div>
            </div>
            <div className="rounded-[12px] bg-[rgba(18,49,49,0.06)] px-3 py-2">
              <div className="text-xs uppercase tracking-[0.1em]">Current task</div>
              <div className="mt-1 font-semibold text-[var(--text-strong)]">{selectedAgent.taskSummary ?? '--'}</div>
            </div>
            <div className="rounded-[12px] bg-[rgba(18,49,49,0.06)] px-3 py-2">
              <div className="text-xs uppercase tracking-[0.1em]">Updated</div>
              <div className="mt-1 font-semibold text-[var(--text-strong)]">{formatRelativeTime(selectedAgent.updatedAt)}</div>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-[var(--text-soft)]">Select one agent from the table to inspect timeline details.</p>
        )}
      </article>

      <section className="grid gap-4 xl:grid-cols-[1.15fr,1fr]">
        <AgentTable agents={node.agents} selectedAgentId={selectedAgentId} onSelectAgent={onSelectAgent} />
        <SessionHistoryPanel
          agent={selectedAgent}
          events={timeline}
          window={timelineWindow}
          onWindowChange={onTimelineWindowChange}
        />
      </section>
    </section>
  );
}

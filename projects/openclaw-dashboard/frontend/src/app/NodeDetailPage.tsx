import { AgentTable } from '../components/agents/AgentTable';
import { ResourceChart } from '../components/charts/ResourceChart';
import { NodeOverview } from '../components/nodes/NodeOverview';
import { EmptyStatePanel } from '../components/states/EmptyStatePanel';
import type { DashboardNodeDetail } from '../types/dashboard';

interface NodeDetailPageProps {
  node: DashboardNodeDetail | null;
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
}

export function NodeDetailPage({ node, selectedAgentId, onSelectAgent }: NodeDetailPageProps) {
  if (!node) {
    return (
      <EmptyStatePanel
        title="Node detail unavailable"
        description="Select a node from the left fleet list to inspect gateway, resources and agents."
      />
    );
  }

  const onlineAgents = node.agents.filter((agent) => agent.status !== 'offline').length;
  const busyAgents = node.agents.filter((agent) => agent.busy).length;

  return (
    <section className="space-y-4">
      <article className="rounded-[20px] border border-[rgba(16,38,37,0.12)] bg-[rgba(255,251,244,0.88)] p-4">
        <div className="text-xs uppercase tracking-[0.24em] text-[var(--accent-brass)]">Node detail</div>
        <h2 className="font-display mt-1 text-[30px] font-bold leading-[1.04] text-[var(--text-strong)] md:text-[34px]">Node detail</h2>
        <p className="mt-1 text-sm text-[var(--text-soft)]">
          Focused view of one OpenClaw node: gateway health, telemetry trend and agent roster.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs uppercase tracking-[0.1em] text-[var(--text-soft)]">
          <span className="rounded-full bg-[rgba(18,49,49,0.08)] px-3 py-1">Agents {onlineAgents}/{node.agents.length}</span>
          <span className="rounded-full bg-[rgba(18,49,49,0.08)] px-3 py-1">Busy {busyAgents}</span>
          <span className="rounded-full bg-[rgba(18,49,49,0.08)] px-3 py-1">Node {node.status}</span>
        </div>
      </article>

      <NodeOverview node={node} />
      <ResourceChart history={node.resourceHistory} />
      <AgentTable agents={node.agents} selectedAgentId={selectedAgentId} onSelectAgent={onSelectAgent} />
    </section>
  );
}

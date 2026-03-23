import { useDeferredValue, useEffect, useRef, useState, useTransition } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { DashboardAgentSummary } from '../../types/dashboard';
import { cn, formatDurationSince, formatRelativeTime } from '../../lib/utils';
import { StatusBadge } from '../states/StatusBadge';

interface AgentTableProps {
  agents: DashboardAgentSummary[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
}

type AgentStatusFilter = 'all' | 'busy' | 'idle' | 'offline' | 'unknown';

const STATUS_FILTER_OPTIONS: Array<{ value: AgentStatusFilter; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'busy', label: 'Busy' },
  { value: 'idle', label: 'Idle' },
  { value: 'offline', label: 'Offline' },
  { value: 'unknown', label: 'Unknown' },
];

export function AgentTable({ agents, selectedAgentId, onSelectAgent }: AgentTableProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AgentStatusFilter>('all');
  const [isPending, startTransition] = useTransition();
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const filteredAgents = agents.filter((agent) => {
    if (statusFilter !== 'all' && agent.status !== statusFilter) {
      return false;
    }
    if (!deferredSearch) {
      return true;
    }
    const searchable = `${agent.name} ${agent.model ?? ''} ${agent.taskSummary ?? ''} ${agent.taskPhase ?? ''}`.toLowerCase();
    return searchable.includes(deferredSearch);
  });

  const rowVirtualizer = useVirtualizer({
    count: filteredAgents.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 70,
    overscan: 8,
  });

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = 0;
  }, [deferredSearch, statusFilter]);

  return (
    <section className="rounded-[28px] border border-[rgba(16,38,37,0.12)] bg-[rgba(255,251,244,0.88)] p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-[var(--accent-brass)]">Agent Board</div>
          <div className="font-display text-[46px] font-bold leading-[0.95] text-[var(--text-strong)]">Live work summary</div>
        </div>
        <div className="rounded-full bg-[rgba(18,49,49,0.88)] px-3 py-2 text-xs uppercase tracking-[0.1em] text-[var(--text-light)]">
          {filteredAgents.length} agents
        </div>
      </div>

      <div className="mb-4 grid gap-2 md:grid-cols-[1.4fr,200px,auto]">
        <input
          type="search"
          value={search}
          onChange={(event) => {
            const value = event.target.value;
            startTransition(() => {
              setSearch(value);
            });
          }}
          placeholder="Search by agent / model / task..."
          className="w-full rounded-[14px] border border-[rgba(16,38,37,0.12)] bg-[rgba(255,255,255,0.6)] px-3 py-2 text-sm text-[var(--text-strong)] placeholder:text-[var(--text-soft)] focus:border-[var(--accent-brass)] focus:outline-none"
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as AgentStatusFilter)}
          className="rounded-[14px] border border-[rgba(16,38,37,0.12)] bg-[rgba(255,255,255,0.6)] px-3 py-2 text-sm text-[var(--text-strong)] focus:border-[var(--accent-brass)] focus:outline-none"
        >
          {STATUS_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="self-center text-xs uppercase tracking-[0.12em] text-[var(--text-soft)]">
          {isPending ? 'Filtering...' : 'Virtualized list enabled'}
        </div>
      </div>

      <div className="overflow-hidden rounded-[20px] border border-[rgba(16,38,37,0.12)] bg-[rgba(255,255,255,0.5)]">
        <div className="grid grid-cols-[1.8fr,0.8fr,1.8fr,1fr,0.8fr,0.9fr] border-b border-[rgba(19,32,31,0.08)] px-4 py-3 text-xs uppercase tracking-[0.16em] text-[var(--text-soft)]">
          <div>Agent</div>
          <div>Status</div>
          <div>Task</div>
          <div>Phase</div>
          <div>Duration</div>
          <div>Updated</div>
        </div>
        {agents.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--text-soft)]">This node currently has no agents.</div>
        ) : filteredAgents.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--text-soft)]">No agents match the current search/filter.</div>
        ) : (
          <div ref={scrollRef} className="max-h-[360px] overflow-y-auto">
            <div
              className="relative w-full"
              style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const agent = filteredAgents[virtualRow.index];
                if (!agent) return null;
                return (
                  <button
                    key={agent.id}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    type="button"
                    onClick={() => onSelectAgent(agent.id)}
                    className={cn(
                      'absolute left-0 top-0 grid w-full grid-cols-[1.8fr,0.8fr,1.8fr,1fr,0.8fr,0.9fr] items-center gap-2 border-t border-[rgba(19,32,31,0.08)] px-4 py-3 text-left text-sm transition hover:bg-[rgba(19,49,49,0.05)]',
                      selectedAgentId === agent.id && 'bg-[rgba(121,199,167,0.16)]',
                    )}
                    style={{
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div>
                      <div className="font-medium text-[var(--text-strong)]">{agent.name}</div>
                      <div className="text-xs text-[var(--text-soft)]">{agent.model ?? 'unknown model'}</div>
                    </div>
                    <div><StatusBadge status={agent.status} /></div>
                    <div className="truncate text-[var(--text-strong)]">{agent.taskSummary ?? '--'}</div>
                    <div className="truncate text-[var(--text-strong)]">{agent.taskPhase ?? '--'}</div>
                    <div className="text-[var(--text-soft)]">{formatDurationSince(agent.taskStartedAt)}</div>
                    <div className="text-[var(--text-soft)]">{formatRelativeTime(agent.updatedAt)}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

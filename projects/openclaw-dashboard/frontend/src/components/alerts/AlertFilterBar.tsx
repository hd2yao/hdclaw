import type { AlertFilter } from '../../types/dashboard';
import { cn } from '../../lib/utils';

interface AlertFilterBarProps {
  filter: AlertFilter;
  nodeFilter: string;
  nodes: Array<{ id: string; name: string }>;
  onFilterChange: (filter: AlertFilter) => void;
  onNodeFilterChange: (nodeId: string) => void;
}

const FILTER_OPTIONS: AlertFilter[] = ['all', 'critical', 'warning', 'recovered'];

export function AlertFilterBar({
  filter,
  nodeFilter,
  nodes,
  onFilterChange,
  onNodeFilterChange,
}: AlertFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[20px] border border-[rgba(16,38,37,0.12)] bg-[rgba(255,251,244,0.86)] p-3">
      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onFilterChange(option)}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition',
              filter === option
                ? 'bg-[rgba(18,49,49,0.88)] text-[var(--text-light)]'
                : 'bg-[rgba(18,49,49,0.12)] text-[var(--text-strong)]',
            )}
          >
            {option}
          </button>
        ))}
      </div>

      <label className="ml-auto flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-[var(--text-soft)]">
        Node
        <select
          value={nodeFilter}
          onChange={(event) => onNodeFilterChange(event.target.value)}
          className="rounded-full border border-[rgba(16,38,37,0.12)] bg-[rgba(255,255,255,0.6)] px-3 py-1.5 text-sm text-[var(--text-strong)] outline-none"
        >
          <option value="">All nodes</option>
          {nodes.map((node) => (
            <option key={node.id} value={node.id}>
              {node.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

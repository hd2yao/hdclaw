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
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onFilterChange(option)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition',
              filter === option
                ? 'border-cyan-300/60 bg-cyan-300/20 text-cyan-100'
                : 'border-white/15 text-slate-300 hover:border-white/30',
            )}
          >
            {option}
          </button>
        ))}
      </div>

      <label className="ml-auto flex items-center gap-2 text-xs text-slate-400">
        Node
        <select
          value={nodeFilter}
          onChange={(event) => onNodeFilterChange(event.target.value)}
          className="rounded-full border border-white/20 bg-slate-900/70 px-3 py-1.5 text-sm text-slate-200 outline-none"
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

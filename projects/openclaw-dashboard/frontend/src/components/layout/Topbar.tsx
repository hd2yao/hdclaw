import { Bell, Cable } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { WsState } from '../../types/dashboard';

interface TopbarProps {
  wsState: WsState;
  refreshing: boolean;
  stale: boolean;
  view: 'dashboard' | 'alerts';
  onViewChange: (view: 'dashboard' | 'alerts') => void;
  onOpenConnectDialog: () => void;
}

export function Topbar({ wsState, refreshing, stale, view, onViewChange, onOpenConnectDialog }: TopbarProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 rounded-[20px] border border-[rgba(16,38,37,0.12)] bg-[rgba(255,251,244,0.86)] px-5 py-4">
      <div>
        <div className="text-xs uppercase tracking-[0.24em] text-[var(--accent-brass)]">OpenClaw Command Desk</div>
        <div className="font-display mt-1 text-[38px] font-bold leading-[1.05] text-[var(--text-strong)]">
          Business pulse first, operations detail underneath
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div aria-live="polite" className="flex items-center gap-2 rounded-full bg-[rgba(18,49,49,0.88)] px-3 py-2 text-xs uppercase tracking-[0.08em] text-[var(--text-light)]">
          <Cable className="h-4 w-4 text-[var(--accent-mint)]" />
          <span className="capitalize">WS {wsState}</span>
        </div>
        {refreshing ? (
          <div className="rounded-full bg-[rgba(18,49,49,0.88)] px-3 py-2 text-xs uppercase tracking-[0.08em] text-[var(--text-light)]">
            refreshing
          </div>
        ) : null}
        {stale ? (
          <div className="rounded-full bg-[rgba(18,49,49,0.12)] px-3 py-2 text-xs uppercase tracking-[0.08em] text-[var(--text-strong)]">
            stale agents
          </div>
        ) : null}

        <nav className="flex items-center rounded-full border border-[rgba(16,38,37,0.12)] bg-[rgba(255,255,255,0.5)] p-1">
          <button
            type="button"
            onClick={() => onViewChange('dashboard')}
            className={cn(
              'rounded-full px-3 py-1.5 text-sm transition',
              view === 'dashboard'
                ? 'bg-[rgba(18,49,49,0.88)] text-[var(--text-light)]'
                : 'text-[var(--text-soft)] hover:text-[var(--text-strong)]',
            )}
          >
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => onViewChange('alerts')}
            className={cn(
              'rounded-full px-3 py-1.5 text-sm transition',
              view === 'alerts'
                ? 'bg-[rgba(18,49,49,0.88)] text-[var(--text-light)]'
                : 'text-[var(--text-soft)] hover:text-[var(--text-strong)]',
            )}
          >
            Alerts
          </button>
        </nav>

        <button
          type="button"
          onClick={onOpenConnectDialog}
          className="rounded-full bg-[rgba(18,49,49,0.88)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-light)] transition hover:bg-[rgba(18,49,49,0.78)]"
        >
          Connect Node
        </button>

        <div className="rounded-full border border-[rgba(16,38,37,0.12)] p-2 text-[var(--text-soft)]">
          <Bell className="h-4 w-4" />
        </div>
      </div>
    </header>
  );
}

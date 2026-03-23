import { Bell, Cable } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { WsState } from '../../types/dashboard';

interface TopbarProps {
  wsState: WsState;
  refreshing: boolean;
  stale: boolean;
  view: 'dashboard' | 'alerts';
  onViewChange: (view: 'dashboard' | 'alerts') => void;
}

export function Topbar({ wsState, refreshing, stale, view, onViewChange }: TopbarProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
      <div>
        <div className="text-xs uppercase tracking-[0.3em] text-slate-500">OpenClaw Monitoring Desk</div>
        <div className="mt-1 text-xl font-semibold text-white">Business pulse first, operations depth underneath</div>
      </div>

      <div className="flex items-center gap-2">
        <div aria-live="polite" className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-sm text-slate-300">
          <Cable className="h-4 w-4 text-cyan-300" />
          <span className="capitalize">WS {wsState}</span>
          {refreshing ? <span className="text-cyan-200">refreshing</span> : null}
          {stale ? <span className="text-amber-200">stale</span> : null}
        </div>

        <nav className="flex items-center rounded-full border border-white/10 bg-slate-900/70 p-1">
          <button
            type="button"
            onClick={() => onViewChange('dashboard')}
            className={cn(
              'rounded-full px-3 py-1.5 text-sm transition',
              view === 'dashboard' ? 'bg-cyan-300/20 text-cyan-100' : 'text-slate-300 hover:text-white',
            )}
          >
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => onViewChange('alerts')}
            className={cn(
              'rounded-full px-3 py-1.5 text-sm transition',
              view === 'alerts' ? 'bg-cyan-300/20 text-cyan-100' : 'text-slate-300 hover:text-white',
            )}
          >
            Alerts
          </button>
        </nav>

        <div className="rounded-full border border-white/10 p-2 text-slate-300">
          <Bell className="h-4 w-4" />
        </div>
      </div>
    </header>
  );
}

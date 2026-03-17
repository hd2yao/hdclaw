import { Bell, Cable, Search } from 'lucide-react';

export function Topbar({ wsState }: { wsState: 'connecting' | 'open' | 'closed' }) {
  return (
    <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
      <div>
        <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Realtime Control Plane</div>
        <div className="mt-1 text-2xl font-semibold text-white">Sessions, resource spikes, message flow.</div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-300">
          <Search className="h-4 w-4" /> Search node / agent / session
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-sm">
          <Cable className="h-4 w-4 text-cyan-300" />
          <span className="capitalize text-slate-200">WebSocket {wsState}</span>
        </div>
        <button type="button" className="rounded-full border border-white/10 p-2 text-slate-300 transition hover:bg-white/[0.06]">
          <Bell className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

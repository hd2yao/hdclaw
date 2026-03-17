import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ResourcePoint } from '../../types/dashboard';

export function ResourceChart({ data }: { data: ResourcePoint[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-glow">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-sm text-slate-400">Resource Utilization</div>
          <div className="text-lg font-semibold text-white">CPU / Memory Trend</div>
        </div>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="cpuFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="memoryFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a855f7" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
            <XAxis dataKey="timestamp" tickFormatter={(value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" domain={[0, 100]} unit="%" />
            <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: 'rgba(148,163,184,0.2)', borderRadius: 16 }} />
            <Area type="monotone" dataKey="cpu" stroke="#22d3ee" fill="url(#cpuFill)" strokeWidth={2} />
            <Area type="monotone" dataKey="memory" stroke="#a855f7" fill="url(#memoryFill)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

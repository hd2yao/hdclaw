import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DashboardNodeResources } from '../../types/dashboard';
import { toMemoryPercent } from '../../lib/utils';

interface ResourceChartProps {
  history: DashboardNodeResources[];
}

interface ResourcePoint {
  timestamp: string;
  cpu: number;
  memory: number;
}

export function ResourceChart({ history }: ResourceChartProps) {
  const chartData = useMemo<ResourcePoint[]>(() => {
    return [...history]
      .reverse()
      .map((item) => ({
        timestamp: item.collectedAt,
        cpu: Number.isFinite(item.cpuPercent) ? Number(item.cpuPercent) : 0,
        memory: toMemoryPercent(item.memoryUsedMb, item.memoryTotalMb) ?? 0,
      }));
  }, [history]);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-glow">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Resource Trend</div>
          <h3 className="mt-1 text-lg font-semibold text-white">CPU / Memory (last {chartData.length} points)</h3>
        </div>
      </div>

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="cpuFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="memoryFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(148,163,184,0.14)" vertical={false} />
            <XAxis
              dataKey="timestamp"
              tickFormatter={(value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              stroke="#94a3b8"
            />
            <YAxis stroke="#94a3b8" domain={[0, 100]} unit="%" />
            <Tooltip
              contentStyle={{
                backgroundColor: '#020617',
                borderColor: 'rgba(148,163,184,0.2)',
                borderRadius: 12,
              }}
            />
            <Area type="monotone" dataKey="cpu" stroke="#06b6d4" fill="url(#cpuFill)" strokeWidth={2} />
            <Area type="monotone" dataKey="memory" stroke="#f59e0b" fill="url(#memoryFill)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

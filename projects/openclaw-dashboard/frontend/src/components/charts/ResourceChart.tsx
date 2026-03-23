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
    <section
      className="rounded-[28px] p-5"
      style={{ backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.04), transparent 26%), linear-gradient(180deg, #1b4140, #123131)' }}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-[var(--accent-brass)]">Resource Trend</div>
          <h3 className="font-display mt-1 text-[42px] font-bold leading-[0.95] text-[var(--text-light)]">CPU / memory / queue depth</h3>
        </div>
        <span className="rounded-full bg-[rgba(18,49,49,0.88)] px-3 py-1 text-xs uppercase tracking-[0.1em] text-[var(--text-light)]">
          last {chartData.length}m
        </span>
      </div>

      <div className="h-72 rounded-[20px] border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] p-3">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="cpuFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#b88a43" stopOpacity={0.62} />
                <stop offset="100%" stopColor="#b88a43" stopOpacity={0.14} />
              </linearGradient>
              <linearGradient id="memoryFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#c9684d" stopOpacity={0.55} />
                <stop offset="100%" stopColor="#c9684d" stopOpacity={0.08} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(248,244,236,0.20)" vertical={false} />
            <XAxis
              dataKey="timestamp"
              tickFormatter={(value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              stroke="rgba(248,244,236,0.70)"
            />
            <YAxis stroke="rgba(248,244,236,0.70)" domain={[0, 100]} unit="%" />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(18,49,49,0.96)',
                borderColor: 'rgba(248,244,236,0.2)',
                borderRadius: 12,
                color: '#f8f4ec',
              }}
            />
            <Area type="monotone" dataKey="cpu" stroke="#b88a43" fill="url(#cpuFill)" strokeWidth={2} />
            <Area type="monotone" dataKey="memory" stroke="#c9684d" fill="url(#memoryFill)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

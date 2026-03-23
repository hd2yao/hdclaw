export function DashboardSkeleton() {
  return (
    <div className="min-h-screen animate-pulse p-5">
      <div className="mx-auto max-w-[1480px] rounded-[34px] border border-[rgba(19,49,49,0.10)] bg-[rgba(255,251,244,0.7)] p-px shadow-[0_20px_60px_rgba(29,33,31,0.12)]">
        <div className="grid overflow-hidden rounded-[32px] lg:grid-cols-[320px,1fr]">
          <aside className="space-y-3 bg-[linear-gradient(180deg,#143636,#0d2425)] p-6">
            <div className="h-4 w-24 rounded bg-white/15" />
            <div className="h-10 rounded bg-white/15" />
            <div className="h-24 rounded bg-white/15" />
            <div className="h-24 rounded bg-white/15" />
            <div className="h-24 rounded bg-white/15" />
          </aside>

          <main className="space-y-4 bg-[linear-gradient(180deg,rgba(255,254,251,0.70),rgba(241,234,219,0.78))] p-5">
            <div className="h-20 rounded-[20px] border border-[rgba(16,38,37,0.12)] bg-[rgba(255,251,244,0.86)]" />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="h-24 rounded-[20px] border border-[rgba(16,38,37,0.12)] bg-[rgba(255,251,244,0.86)]" />
              <div className="h-24 rounded-[20px] border border-[rgba(16,38,37,0.12)] bg-[rgba(255,251,244,0.86)]" />
              <div className="h-24 rounded-[20px] border border-[rgba(16,38,37,0.12)] bg-[rgba(255,251,244,0.86)]" />
              <div className="h-24 rounded-[20px] border border-[rgba(16,38,37,0.12)] bg-[rgba(255,251,244,0.86)]" />
            </div>
            <div className="grid gap-4 xl:grid-cols-[1.2fr,1fr]">
              <div className="h-48 rounded-[28px] border border-[rgba(16,38,37,0.12)] bg-[rgba(255,251,244,0.86)]" />
              <div className="h-48 rounded-[28px] bg-[linear-gradient(180deg,#1b4140,#123131)]" />
            </div>
            <div className="grid gap-4 xl:grid-cols-[1.2fr,1fr]">
              <div className="h-80 rounded-[28px] border border-[rgba(16,38,37,0.12)] bg-[rgba(255,251,244,0.86)]" />
              <div className="h-80 rounded-[28px] bg-[linear-gradient(180deg,#1b4140,#123131)]" />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="min-h-screen animate-pulse bg-[radial-gradient(circle_at_top,rgba(14,116,144,0.25),transparent_45%),#020617] p-5 text-slate-200">
      <div className="mx-auto grid max-w-[1600px] gap-4 lg:grid-cols-[320px,1fr]">
        <aside className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="h-4 w-24 rounded bg-white/10" />
          <div className="h-10 rounded bg-white/10" />
          <div className="h-24 rounded bg-white/10" />
          <div className="h-24 rounded bg-white/10" />
          <div className="h-24 rounded bg-white/10" />
        </aside>

        <main className="space-y-4">
          <div className="h-20 rounded-2xl border border-white/10 bg-white/[0.03]" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="h-24 rounded-2xl border border-white/10 bg-white/[0.03]" />
            <div className="h-24 rounded-2xl border border-white/10 bg-white/[0.03]" />
            <div className="h-24 rounded-2xl border border-white/10 bg-white/[0.03]" />
            <div className="h-24 rounded-2xl border border-white/10 bg-white/[0.03]" />
          </div>
          <div className="grid gap-4 xl:grid-cols-[1.2fr,1fr]">
            <div className="h-48 rounded-2xl border border-white/10 bg-white/[0.03]" />
            <div className="h-48 rounded-2xl border border-white/10 bg-white/[0.03]" />
          </div>
          <div className="grid gap-4 xl:grid-cols-[1.2fr,1fr]">
            <div className="h-80 rounded-2xl border border-white/10 bg-white/[0.03]" />
            <div className="h-80 rounded-2xl border border-white/10 bg-white/[0.03]" />
          </div>
        </main>
      </div>
    </div>
  );
}

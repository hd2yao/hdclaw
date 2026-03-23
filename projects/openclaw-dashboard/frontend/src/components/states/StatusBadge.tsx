import { cn } from '../../lib/utils';

const palette: Record<string, string> = {
  online: 'bg-[rgba(121,199,167,0.18)] text-[#0d6b51]',
  degraded: 'bg-[rgba(217,168,90,0.20)] text-[#8b5d15]',
  offline: 'bg-[rgba(201,104,77,0.18)] text-[#9d3a23]',
  busy: 'bg-[rgba(121,199,167,0.18)] text-[#0d6b51]',
  idle: 'bg-[rgba(19,49,49,0.12)] text-[#13201f]',
  running: 'bg-[rgba(121,199,167,0.18)] text-[#0d6b51]',
  completed: 'bg-[rgba(121,199,167,0.18)] text-[#0d6b51]',
  error: 'bg-[rgba(201,104,77,0.18)] text-[#9d3a23]',
  unknown: 'bg-[rgba(19,49,49,0.12)] text-[#13201f]',
  warning: 'bg-[rgba(217,168,90,0.20)] text-[#8b5d15]',
  critical: 'bg-[rgba(201,104,77,0.18)] text-[#9d3a23]',
  recovered: 'bg-[rgba(121,199,167,0.18)] text-[#0d6b51]',
};

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const style = palette[normalized] ?? palette.unknown;
  return (
    <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em]', style)}>
      {normalized}
    </span>
  );
}

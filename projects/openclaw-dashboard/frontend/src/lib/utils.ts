import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: Array<string | false | null | undefined>) {
  return twMerge(clsx(inputs));
}

export function formatPercent(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  return `${Math.round(value)}%`;
}

export function formatRelativeTime(value: string | null | undefined) {
  if (!value) return '--';
  const diff = Date.now() - new Date(value).getTime();
  const seconds = Math.max(1, Math.floor(diff / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function formatAbsoluteTime(value: string | null | undefined) {
  if (!value) return '--';
  return new Date(value).toLocaleString();
}

export function formatDurationSince(iso: string | null | undefined) {
  if (!iso) return '--';
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

export function toMemoryPercent(usedMb: number | null | undefined, totalMb: number | null | undefined): number | null {
  if (
    typeof usedMb !== 'number' ||
    !Number.isFinite(usedMb) ||
    typeof totalMb !== 'number' ||
    !Number.isFinite(totalMb) ||
    totalMb <= 0
  ) {
    return null;
  }

  return (usedMb / totalMb) * 100;
}

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRupiah(value: number | null | undefined): string {
  const v = value ?? 0;
  if (v >= 1e12) return `Rp ${(v / 1e12).toFixed(2).replace('.', ',')} T`;
  if (v >= 1e9) return `Rp ${(v / 1e9).toFixed(2).replace('.', ',')} M`;
  if (v >= 1e6) return `Rp ${(v / 1e6).toFixed(2).replace('.', ',')} Jt`;
  return `Rp ${v.toLocaleString('id-ID')}`;
}

export function formatPercent(value: number | null | undefined): string {
  const v = value ?? 0;
  const pct = v > 1 ? v : v * 100;
  return `${pct.toFixed(2).replace('.', ',')}%`;
}

export function formatRupiahFull(value: number | null | undefined): string {
  const v = value ?? 0;
  return `Rp ${v.toLocaleString('id-ID')}`;
}

export function formatRupiahShort(value: number | null | undefined): string {
  const v = value ?? 0;
  if (v >= 1e12) return `Rp${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `Rp${(v / 1e9).toFixed(2)}M`;
  if (v >= 1e6) return `Rp${(v / 1e6).toFixed(2)}Jt`;
  return `Rp${v.toLocaleString('id-ID')}`;
}

export function getAchPct(value: number | null | undefined): number {
  const v = value ?? 0;
  return v > 1 ? v : v * 100;
}

export function getStatusColor(statusWarna: string | null | undefined) {
  const s = (statusWarna ?? '').toLowerCase();
  if (s === 'hijau' || s === 'green') return 'bg-success/15 text-success border-success/30';
  if (s === 'oranye' || s === 'orange' || s === 'kuning' || s === 'yellow') return 'bg-warning/15 text-warning border-warning/30';
  if (s === 'merah' || s === 'red') return 'bg-destructive/15 text-destructive border-destructive/30';
  return 'bg-muted text-muted-foreground border-border';
}

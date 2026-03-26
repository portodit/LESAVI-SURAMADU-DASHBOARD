import React, { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { cn, formatRupiah, formatRupiahFull } from "@/shared/lib/utils";
import { ChevronRight, ChevronDown, Search, X, TrendingUp, TrendingDown, Minimize2, Expand, Columns2, AlignJustify } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface FunnelSnapshot { id: number; period: string; rowsImported: number; createdAt: string; snapshotDate?: string | null; }

interface LopRow {
  id: number; lopid: string; judulProyek: string; pelanggan: string; nilaiProyek: number;
  divisi: string; segmen: string | null; statusF: string | null; proses: string | null;
  statusProyek: string | null; kategoriKontrak: string | null; estimateBulan: string | null;
  namaAm: string | null; nikAm: string | null; reportDate: string | null;
}

interface FunnelData {
  totalLop: number; totalNilai: number; targetHo: number; targetFullHo: number;
  realFullHo: number; shortage: number; amCount: number; pelangganCount: number;
  unidentifiedLops?: number;
  byStatus: { status: string; count: number; totalNilai: number }[];
  byAm: { namaAm: string; nik: string; divisi: string; totalLop: number; totalNilai: number; byStatus: any[] }[];
  lops: LopRow[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PHASES = ["F0", "F1", "F2", "F3", "F4", "F5"];
const PHASE_LABELS: Record<string, string> = { F0:"Lead", F1:"Prospect", F2:"Quote", F3:"Negosiasi", F4:"Closing", F5:"Won/Closed" };
const PHASE_COLORS: Record<string, { pill: string; bar: string; text: string }> = {
  F0: { pill: "bg-sky-100 text-sky-800",    bar: "#38bdf8", text: "#0369a1" },
  F1: { pill: "bg-blue-100 text-blue-800",  bar: "#3b82f6", text: "#1d4ed8" },
  F2: { pill: "bg-indigo-100 text-indigo-800", bar: "#6366f1", text: "#4338ca" },
  F3: { pill: "bg-violet-100 text-violet-800", bar: "#7c3aed", text: "#5b21b6" },
  F4: { pill: "bg-orange-100 text-orange-800", bar: "#f97316", text: "#c2410c" },
  F5: { pill: "bg-emerald-100 text-emerald-800", bar: "#10b981", text: "#065f46" },
};

const MONTHS_ID  = ["","Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agt","Sep","Okt","Nov","Des"];
const MONTHS_FULL = ["","Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const MONTH_NUMS  = ["01","02","03","04","05","06","07","08","09","10","11","12"];

function fmtCompact(n: number): string {
  if (!n) return "–";
  if (n >= 1e12) return `${(n/1e12).toFixed(1)}T`;
  if (n >= 1e9)  return `${(n/1e9).toFixed(1)}M`;
  if (n >= 1e6)  return `${Math.round(n/1e6)} jt`;
  return String(n);
}
function periodLabel(p: string): string {
  const [y, m] = p.split("-");
  return `${MONTHS_ID[parseInt(m)] || m} ${y}`;
}

// ─── API ─────────────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
async function apiFetch<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { credentials: "include" });
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

// ─── SelectDropdown ───────────────────────────────────────────────────────────

function SelectDropdown({ label, value, onChange, options, disabled, className }: {
  label?: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; disabled?: boolean; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, minW: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
          dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const toggle = () => {
    if (disabled) return;
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, minW: r.width });
    }
    setOpen(o => !o);
  };
  const current = options.find(o => o.value === value);
  return (
    <div className={cn("flex flex-col gap-1", className)} ref={triggerRef}>
      {label && <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>}
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        className={cn(
          "h-9 px-3 bg-secondary/50 border border-border rounded-lg text-sm flex items-center gap-1.5 w-full disabled:opacity-40 transition-colors text-left",
          open && "border-primary/50 ring-2 ring-primary/20"
        )}
      >
        <span className="flex-1 truncate font-medium text-foreground">{current?.label ?? value}</span>
        <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && createPortal(
        <div ref={dropRef} style={{ position: "fixed", top: pos.top, left: pos.left, minWidth: pos.minW, zIndex: 9999 }}
          className="bg-card border border-border rounded-xl shadow-xl max-h-64 overflow-y-auto py-1">
          {options.map(opt => (
            <button key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); }}
              className={cn("w-full text-left px-3 py-2 text-sm hover:bg-secondary transition-colors flex items-center gap-2",
                opt.value === value ? "font-semibold text-primary bg-primary/5" : "text-foreground")}>
              {opt.value === value && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
              {opt.value !== value && <span className="w-1.5 shrink-0" />}
              {opt.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── CheckboxDropdown ─────────────────────────────────────────────────────────

function CheckboxDropdown({ label, options, selected, onChange, placeholder, labelFn, summaryLabel, className }: {
  label: string; options: string[]; selected: Set<string>; onChange: (next: Set<string>) => void;
  placeholder?: string; labelFn?: (v: string) => string; summaryLabel?: string; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const getLabel = (v: string) => labelFn ? labelFn(v) : v;
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
          dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const toggleItem = (item: string) => {
    const next = new Set(selected);
    if (next.has(item)) next.delete(item); else next.add(item);
    onChange(next);
  };
  const toggle = () => {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen(o => !o);
  };
  const unit = summaryLabel ?? "item";
  const displayText = selected.size === 0
    ? (placeholder ?? "Semua")
    : selected.size === options.length ? `Semua ${unit}`
    : selected.size === 1 ? getLabel([...selected][0])
    : `${selected.size} ${unit} dipilih`;

  return (
    <div className={cn("flex flex-col gap-1", className)} ref={triggerRef}>
      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>
      <button
        type="button"
        onClick={toggle}
        disabled={options.length === 0}
        className={cn(
          "h-9 px-3 bg-secondary/50 border border-border rounded-lg text-sm flex items-center gap-1.5 w-full disabled:opacity-40 transition-colors text-left",
          open && "border-primary/50 ring-2 ring-primary/20"
        )}
      >
        <span className="flex-1 truncate font-medium text-foreground">{displayText}</span>
        {selected.size > 0 && selected.size < options.length && (
          <span className="bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none shrink-0">{selected.size}</span>
        )}
        <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && createPortal(
        <div ref={dropRef} style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="bg-card border border-border rounded-xl shadow-xl min-w-[200px] max-w-[260px] overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-secondary/30">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
            <div className="flex gap-1.5">
              <button onClick={() => onChange(new Set(options))} className="text-[11px] text-primary font-semibold hover:underline">Semua</button>
              <span className="text-muted-foreground text-[11px]">·</span>
              <button onClick={() => onChange(new Set())} className="text-[11px] text-muted-foreground font-semibold hover:text-foreground hover:underline">Kosongkan</button>
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {options.map(opt => (
              <button key={opt} onClick={() => toggleItem(opt)}
                className={cn("w-full text-left px-3 py-2 text-sm hover:bg-secondary flex items-center gap-2 transition-colors",
                  selected.has(opt) ? "font-semibold text-primary bg-primary/5" : "text-foreground")}>
                <span className={cn("w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center",
                  selected.has(opt) ? "bg-primary border-primary" : "border-border")}>
                  {selected.has(opt) && <span className="text-white text-[8px] font-black">✓</span>}
                </span>
                {getLabel(opt)}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── PeriodeTreeDropdown — multi-year tree picker ─────────────────────────────

function PeriodeTreeDropdown({ label, filterYears, filterMonths, availableYears, onChange, className }: {
  label?: string;
  filterYears: Set<string>;
  filterMonths: Set<string>;
  availableYears: string[];
  onChange: (years: Set<string>, months: Set<string>) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set(filterYears));
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        dropRef.current && !dropRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const years = availableYears.length > 0 ? availableYears : [...filterYears];

  const toggle = () => {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen(o => !o);
  };

  const toggleExpand = (yr: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedYears(prev => { const n = new Set(prev); n.has(yr) ? n.delete(yr) : n.add(yr); return n; });
  };

  const toggleYear = (yr: string) => {
    const n = new Set(filterYears);
    if (n.has(yr)) {
      n.delete(yr);
      if (n.size === 0) n.add(yr); // keep at least one year
    } else {
      n.add(yr);
    }
    // Clear months when switching to multi-year
    onChange(n, n.size === 1 ? filterMonths : new Set());
  };

  const toggleMonth = (mo: string) => {
    if (filterYears.size !== 1) return; // months only for single year
    const n = new Set(filterMonths);
    n.has(mo) ? n.delete(mo) : n.add(mo);
    onChange(filterYears, n);
  };

  const singleYear = filterYears.size === 1 ? [...filterYears][0] : null;

  const displayText = (() => {
    const sortedYrs = [...filterYears].sort().reverse();
    if (filterYears.size === years.length && years.length > 1) return "Semua Tahun";
    if (singleYear) {
      if (filterMonths.size === 0) return `${singleYear} (semua bulan)`;
      if (filterMonths.size === 1) {
        const m = [...filterMonths][0];
        return `${MONTHS_ID[parseInt(m)]} ${singleYear}`;
      }
      return `${singleYear} · ${filterMonths.size} bulan`;
    }
    return sortedYrs.join(", ");
  })();

  return (
    <div className={cn("flex flex-col gap-1", className)} ref={triggerRef}>
      {label && <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>}
      <button type="button" onClick={toggle}
        className={cn("h-9 px-3 bg-secondary/50 border border-border rounded-lg text-sm flex items-center gap-1.5 w-full transition-colors text-left",
          open && "border-primary/50 ring-2 ring-primary/20")}>
        <span className="flex-1 truncate font-medium text-foreground">{displayText}</span>
        {filterYears.size > 1 && (
          <span className="bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none shrink-0">{filterYears.size}</span>
        )}
        {singleYear && filterMonths.size > 0 && (
          <span className="bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none shrink-0">{filterMonths.size}</span>
        )}
        <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && createPortal(
        <div ref={dropRef} style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="bg-card border border-border rounded-xl shadow-xl w-56 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-secondary/30">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Periode</span>
            <div className="flex gap-1.5">
              <button onClick={() => onChange(new Set(years), new Set())}
                className="text-[11px] text-primary font-semibold hover:underline">Semua</button>
              <span className="text-muted-foreground text-[11px]">·</span>
              <button onClick={() => { const latest = [...years].sort().reverse()[0]; onChange(new Set([latest]), new Set()); }}
                className="text-[11px] text-muted-foreground font-semibold hover:text-foreground hover:underline">Reset</button>
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {years.map(yr => {
              const isActive = filterYears.has(yr);
              const exp = expandedYears.has(yr);
              const isSingle = filterYears.size === 1 && isActive;
              const allMonthsSel = isSingle && filterMonths.size === 0;
              const someSel = isSingle && filterMonths.size > 0;
              return (
                <div key={yr}>
                  <div className="flex items-center gap-1 px-2 py-1.5 hover:bg-secondary/40 transition-colors">
                    <button type="button" onClick={e => toggleExpand(yr, e)}
                      className="p-0.5 text-muted-foreground hover:text-foreground shrink-0">
                      <ChevronRight className={cn("w-3 h-3 transition-transform", exp && "rotate-90")} />
                    </button>
                    <label className="flex items-center gap-2 flex-1 cursor-pointer select-none">
                      <input type="checkbox" checked={isActive}
                        ref={el => { if (el) el.indeterminate = someSel && !allMonthsSel; }}
                        onChange={() => toggleYear(yr)}
                        className="w-3.5 h-3.5 accent-primary cursor-pointer" />
                      <span className={cn("text-sm font-semibold", isActive ? "text-primary" : "text-foreground")}>{yr}</span>
                      {isSingle && filterMonths.size > 0 && (
                        <span className="text-[10px] text-muted-foreground">({filterMonths.size} bln)</span>
                      )}
                    </label>
                  </div>
                  {exp && isSingle && (
                    <div className="ml-6 pb-1">
                      {MONTH_NUMS.map((mo, idx) => {
                        const checked = filterMonths.has(mo);
                        return (
                          <label key={mo} className="flex items-center gap-2 px-2 py-1 hover:bg-secondary/30 cursor-pointer rounded select-none">
                            <input type="checkbox" checked={checked}
                              onChange={() => toggleMonth(mo)}
                              className="w-3.5 h-3.5 accent-primary cursor-pointer" />
                            <span className={cn("text-sm", checked ? "text-foreground font-medium" : "text-muted-foreground")}>
                              {MONTHS_FULL[idx + 1]}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {exp && !isSingle && (
                    <div className="ml-6 pb-1 px-2 py-1.5">
                      <span className="text-[11px] text-muted-foreground italic">Pilih 1 tahun untuk filter bulan</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── SVG Gauge ───────────────────────────────────────────────────────────────

function Gauge({ pct, targetHo, targetFullHo, real, mode }: { pct: number; targetHo: number; targetFullHo: number; real: number; mode: "ho" | "fullho" }) {
  const clamp = Math.min(Math.max(pct, 0), 100);
  const r = 54, cx = 80, cy = 70;
  const startAngle = -210, endAngle = 30;
  const totalDeg = endAngle - startAngle;
  const fillDeg = (clamp / 100) * totalDeg;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const arc = (start: number, end: number, radius: number) => {
    const s = toRad(start), e = toRad(end);
    const x1 = cx + radius * Math.cos(s), y1 = cy + radius * Math.sin(s);
    const x2 = cx + radius * Math.cos(e), y2 = cy + radius * Math.sin(e);
    const large = end - start > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
  };
  const color = clamp >= 100 ? "#10b981" : clamp >= 75 ? "#3b82f6" : clamp >= 50 ? "#f59e0b" : "#CC0000";
  const activeTarget = mode === "ho" ? targetHo : targetFullHo;
  const hasTarget = activeTarget > 0;
  const startX = cx + r * Math.cos(toRad(startAngle));
  const startY = cy + r * Math.sin(toRad(startAngle));
  const endX = cx + r * Math.cos(toRad(endAngle));
  const endY = cy + r * Math.sin(toRad(endAngle));

  const surplus = real >= activeTarget;
  return (
    <div className="flex items-center gap-4">
      <svg width="220" height="160" viewBox="0 0 160 115" className="shrink-0">
        <path d={arc(startAngle, endAngle, r)} fill="none" stroke="#e5e7eb" strokeWidth="18" strokeLinecap="round" />
        {hasTarget && clamp > 0 && (
          <path d={arc(startAngle, startAngle + fillDeg, r)} fill="none" stroke={color} strokeWidth="18" strokeLinecap="round" />
        )}
        {hasTarget ? (
          <>
            <text x={cx} y={cy - 4} textAnchor="middle" fontSize="22" fontWeight="800" fill={color} fontFamily="ui-monospace, monospace">
              {clamp.toFixed(1)}%
            </text>
            <text x={cx} y={cy + 12} textAnchor="middle" fontSize="9" fill="#6b7280">CAPAIAN</text>
          </>
        ) : (
          <>
            <text x={cx} y={cy - 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#6b7280">Target</text>
            <text x={cx} y={cy + 10} textAnchor="middle" fontSize="10" fill="#9ca3af">belum diset</text>
          </>
        )}
        <text x={startX} y={startY + 13} textAnchor="middle" fontSize="8" fill="#9ca3af">0%</text>
        <text x={endX} y={endY + 13} textAnchor="middle" fontSize="8" fill="#9ca3af">100%</text>
      </svg>
      <div className="flex-1 space-y-2 text-sm min-w-0">
        <div className="flex justify-between items-center gap-2">
          <span className="text-xs font-semibold text-foreground">Real Pipeline</span>
          <span className="font-black text-foreground tabular-nums">{formatRupiah(real)}</span>
        </div>
        {hasTarget && (
          <>
            <div className="flex justify-between items-center gap-2">
              <span className="text-xs font-semibold text-foreground">{mode === "ho" ? "Target HO" : "Target Full HO"}</span>
              <span className="font-black tabular-nums text-foreground">{formatRupiah(activeTarget)}</span>
            </div>
            <div className="pt-2 border-t-2 border-border flex justify-between items-center gap-2">
              <span className={cn("text-xs font-black uppercase tracking-wide", surplus ? "text-emerald-600" : "text-red-600")}>
                {surplus ? "Kelebihan" : "Kekurangan"}
              </span>
              <span className={cn("font-black tabular-nums text-base", surplus ? "text-emerald-600" : "text-red-600")}>
                {surplus ? "+" : "-"}{formatRupiah(Math.abs(activeTarget - real))}
              </span>
            </div>
          </>
        )}
        {!hasTarget && (
          <p className="text-xs text-muted-foreground text-center pt-1">
            Input target di menu <span className="font-semibold">Import Data → Target HO</span>
          </p>
        )}
      </div>
    </div>
  );
}

// ─── LOP per Fase Bar Chart ───────────────────────────────────────────────────

function FaseBarChart({ data }: { data: FunnelData | undefined }) {
  if (!data) return null;
  const phaseMap: Record<string, { count: number; nilai: number }> = {};
  for (const p of PHASES) phaseMap[p] = { count: 0, nilai: 0 };
  for (const s of (data.byStatus || [])) {
    if (phaseMap[s.status]) { phaseMap[s.status].count = s.count; phaseMap[s.status].nilai = s.totalNilai; }
  }
  const maxCount = Math.max(...PHASES.map(p => phaseMap[p].count), 1);

  return (
    <div className="space-y-2">
      {PHASES.map(phase => {
        const d = phaseMap[phase];
        const pct = (d.count / maxCount) * 100;
        const c = PHASE_COLORS[phase];
        return (
          <div key={phase} className="flex items-center gap-2">
            <div className="w-6 shrink-0">
              <span className="text-xs font-black font-mono" style={{ color: c.text }}>{phase}</span>
            </div>
            <div className="flex-1 bg-secondary rounded h-6 overflow-hidden">
              <div className="h-full rounded transition-all duration-500" style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: c.bar }} />
            </div>
            <span className="text-xs font-black font-mono w-16 shrink-0" style={{ color: c.text }}>
              {d.count} proyek
            </span>
            <span className="text-xs font-bold font-mono text-muted-foreground w-20 text-right shrink-0">{fmtCompact(d.nilai)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── KPI Cards ───────────────────────────────────────────────────────────────

function MiniSparkline({ color, fill }: { color: string; fill: string }) {
  const pts = [28, 22, 30, 18, 26, 14, 20, 8, 16, 4];
  const w = 88, h = 38, pad = 2;
  const xs = pts.map((_, i) => pad + (i / (pts.length - 1)) * (w - pad * 2));
  const ys = pts.map(v => pad + (v / 32) * (h - pad * 2));
  const line = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const area = `${line} L${xs[xs.length-1].toFixed(1)},${(h-pad).toFixed(1)} L${xs[0].toFixed(1)},${(h-pad).toFixed(1)} Z`;
  const gid = `sg-${color.replace(/[^a-z]/g, "")}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fill} stopOpacity="0.45" />
          <stop offset="100%" stopColor={fill} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function KpiGrid({ data }: { data: FunnelData | undefined }) {
  if (!data) return null;
  const kpis = [
    {
      label: "Total LOP",
      value: data.totalLop.toLocaleString("id-ID"),
      sub: "proyek aktif",
      color: "text-foreground",
      spark: { color: "#10b981", fill: "#10b981" },
    },
    {
      label: "Total Nilai Pipeline",
      value: formatRupiah(data.totalNilai),
      sub: "nilai seluruh LOP",
      color: "text-blue-600",
      spark: { color: "#3b82f6", fill: "#3b82f6" },
    },
    {
      label: "Jumlah Pelanggan",
      value: data.pelangganCount.toLocaleString("id-ID"),
      sub: "unique customer",
      color: "text-amber-600",
      spark: { color: "#f59e0b", fill: "#f59e0b" },
    },
  ];
  return (
    <div className="grid grid-cols-3 gap-3">
      {kpis.map(k => (
        <div key={k.label} className="bg-secondary/50 border border-border rounded-xl p-4 flex items-center gap-3 overflow-hidden">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">{k.label}</div>
            <div className={cn("text-3xl font-black tabular-nums leading-tight tracking-tight", k.color)}>{k.value}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{k.sub}</div>
          </div>
          <div className="shrink-0 opacity-90">
            <MiniSparkline color={k.spark.color} fill={k.spark.fill} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Phase Badge ─────────────────────────────────────────────────────────────

function PhaseBadge({ phase, showLabel = false }: { phase: string; showLabel?: boolean }) {
  const c = PHASE_COLORS[phase] || { pill: "bg-muted text-muted-foreground" };
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold", c.pill)}>
      {phase}{showLabel && PHASE_LABELS[phase] ? <span className="font-normal opacity-80 hidden md:inline">· {PHASE_LABELS[phase]}</span> : null}
    </span>
  );
}

// ─── Kontrak Badge ────────────────────────────────────────────────────────────

function kategoriColor(k: string | null): string {
  if (!k) return "bg-slate-100 text-slate-500 border-slate-200";
  const v = k.toLowerCase();
  if (v.includes("new gtma")) return "bg-blue-100 text-blue-800 border-blue-200";
  if (v.includes("gtma")) return "bg-cyan-100 text-cyan-800 border-cyan-200";
  if (v.includes("own channel")) return "bg-violet-100 text-violet-800 border-violet-200";
  if (v.includes("new")) return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (v.includes("uncategorized") || v.includes("uncat")) return "bg-slate-100 text-slate-600 border-slate-200";
  return "bg-amber-100 text-amber-800 border-amber-200";
}
function KontrakBadge({ k }: { k: string | null }) {
  if (!k) return <span className="text-muted-foreground text-xs">–</span>;
  return <span className={`inline-block px-2 py-0.5 rounded text-[11px] border font-bold whitespace-nowrap ${kategoriColor(k)}`}>{k}</span>;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FunnelPage() {
  const [importId, setImportId] = useState<number | null>(null);
  const [filterDivisi, setFilterDivisi] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<Set<string>>(new Set());
  const [filterKontrak, setFilterKontrak] = useState<Set<string>>(new Set());
  const [filterAm, setFilterAm] = useState<Set<string>>(new Set());
  const [filterYears, setFilterYears] = useState<Set<string>>(new Set(["2026"]));
  const [filterMonths, setFilterMonths] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [expandedAm, setExpandedAm] = useState<Record<string, boolean>>({});
  const [expandedPhase, setExpandedPhase] = useState<Record<string, boolean>>({});
  const [allExpanded, setAllExpanded] = useState(false);
  const [filterTarget, setFilterTarget] = useState<"ho" | "fullho">("fullho");
  const [viewMode, setViewMode] = useState<"all" | "split">("all");

  const { data: snapshots = [] } = useQuery<FunnelSnapshot[]>({
    queryKey: ["funnel-snapshots"],
    queryFn: () => apiFetch("/api/funnel/snapshots"),
    staleTime: 60_000,
  });

  const snapshotOptions = useMemo(() =>
    [...snapshots]
      .sort((a, b) => b.id - a.id)
      .map(s => ({
        value: String(s.id),
        label: s.snapshotDate
          ? format(new Date(s.snapshotDate), "d MMM yyyy", { locale: idLocale })
          : s.createdAt
            ? format(new Date(s.createdAt), "d MMM yyyy HH:mm", { locale: idLocale })
            : periodLabel(s.period),
      })),
    [snapshots]
  );

  const selectedSnapshot = useMemo(() => snapshots.find(s => s.id === importId), [snapshots, importId]);

  useEffect(() => {
    if (snapshotOptions.length > 0 && importId === null) {
      setImportId(Number(snapshotOptions[0].value));
    }
  }, [snapshotOptions.length > 0 && snapshotOptions[0]?.value]);

  useEffect(() => {
    if (selectedSnapshot) {
      const yr = selectedSnapshot.period.slice(0, 4);
      setFilterYears(new Set([yr]));
      setFilterMonths(new Set());
    }
  }, [selectedSnapshot?.id]);

  const { data, isLoading } = useQuery<FunnelData>({
    queryKey: ["funnel-data", importId, filterDivisi],
    queryFn: () => {
      const p = new URLSearchParams();
      if (importId) p.set("import_id", String(importId));
      if (filterDivisi !== "all") p.set("divisi", filterDivisi);
      return apiFetch(`/api/funnel?${p.toString()}`);
    },
    enabled: importId !== null || snapshots.length === 0,
    staleTime: 30_000,
  });

  // Available years derived from loaded data
  const availableYears = useMemo(() => {
    if (!data) return [...filterYears];
    const yearSet = new Set<string>();
    for (const l of data.lops) {
      if (!l.reportDate) continue;
      const yr = String(l.reportDate).slice(0, 4);
      if (/^\d{4}$/.test(yr)) yearSet.add(yr);
    }
    const sorted = [...yearSet].sort().reverse();
    return sorted.length > 0 ? sorted : [...filterYears];
  }, [data]);

  // Period-filtered LOPs: filter by selected years + months (months only for single year)
  const periodFilteredLops = useMemo(() => {
    if (!data) return [];
    const singleYear = filterYears.size === 1 ? [...filterYears][0] : null;
    return data.lops.filter(l => {
      if (!l.reportDate) return false;
      const rd = String(l.reportDate).slice(0, 10);
      const yr = rd.slice(0, 4);
      if (!filterYears.has(yr)) return false;
      if (singleYear && filterMonths.size > 0 && !filterMonths.has(rd.slice(5, 7))) return false;
      return true;
    });
  }, [data, filterYears, filterMonths]);

  const periodStats = useMemo(() => {
    const lops = periodFilteredLops;
    const byStatusMap: Record<string, { status: string; count: number; totalNilai: number }> = {};
    for (const l of lops) {
      const s = l.statusF || "Unknown";
      if (!byStatusMap[s]) byStatusMap[s] = { status: s, count: 0, totalNilai: 0 };
      byStatusMap[s].count++;
      byStatusMap[s].totalNilai += l.nilaiProyek || 0;
    }
    return {
      totalLop: lops.length,
      totalNilai: lops.reduce((s, l) => s + (l.nilaiProyek || 0), 0),
      pelangganCount: new Set(lops.map(l => l.pelanggan).filter(Boolean)).size,
      realFullHo: lops.reduce((s, l) => s + (l.nilaiProyek || 0), 0),
      byStatus: Object.values(byStatusMap),
    };
  }, [periodFilteredLops]);

  const amOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of periodFilteredLops) { if (l.nikAm && l.namaAm && l.namaAm.trim() !== "") map.set(l.nikAm, l.namaAm); }
    return Array.from(map.keys()).sort((a, b) => (map.get(a) || "").localeCompare(map.get(b) || ""));
  }, [periodFilteredLops]);

  const amLabelFn = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of periodFilteredLops) { if (l.nikAm && l.namaAm) map.set(l.nikAm, l.namaAm); }
    return (nik: string) => map.get(nik) || nik;
  }, [periodFilteredLops]);

  const kontrakOptions = useMemo(() => {
    return [...new Set(periodFilteredLops.map(l => l.kategoriKontrak).filter(Boolean) as string[])].sort();
  }, [periodFilteredLops]);

  const filteredLops = useMemo(() => {
    const q = search.toLowerCase();
    return periodFilteredLops.filter(l => {
      if (filterAm.size > 0 && (!l.nikAm || !filterAm.has(l.nikAm))) return false;
      if (filterStatus.size > 0 && (!l.statusF || !filterStatus.has(l.statusF))) return false;
      if (filterKontrak.size > 0 && (!l.kategoriKontrak || !filterKontrak.has(l.kategoriKontrak))) return false;
      if (q) {
        const hay = `${l.judulProyek} ${l.pelanggan} ${l.lopid} ${l.namaAm}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [periodFilteredLops, filterAm, filterStatus, filterKontrak, search]);

  const groupedByAm = useMemo(() => {
    const amMap = new Map<string, { namaAm: string; nikAm: string; divisi: string; phases: Map<string, LopRow[]> }>();
    for (const l of filteredLops) {
      const key = l.nikAm || l.namaAm || "Unknown";
      if (!amMap.has(key)) amMap.set(key, { namaAm: l.namaAm || key, nikAm: l.nikAm || "", divisi: l.divisi || "", phases: new Map() });
      const e = amMap.get(key)!;
      if (!e.divisi && l.divisi) e.divisi = l.divisi;
      const phase = l.statusF || "Unknown";
      if (!e.phases.has(phase)) e.phases.set(phase, []);
      e.phases.get(phase)!.push(l);
    }
    return Array.from(amMap.values()).sort((a, b) => {
      const totA = Array.from(a.phases.values()).flat().reduce((s, l) => s + (l.nilaiProyek || 0), 0);
      const totB = Array.from(b.phases.values()).flat().reduce((s, l) => s + (l.nilaiProyek || 0), 0);
      return totB - totA;
    });
  }, [filteredLops]);

  // Resolve divisi dari LOPs dalam phases jika AM-level divisi kosong
  function resolveAmDivisi(am: { divisi: string; phases: Map<string, LopRow[]> }): string {
    if (am.divisi) return am.divisi;
    const counts: Record<string, number> = {};
    for (const lops of am.phases.values())
      for (const l of lops) if (l.divisi) counts[l.divisi] = (counts[l.divisi] || 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  }

  // ── Split-mode per-divisi stats ──────────────────────────────────────────────
  const dpsGrouped = useMemo(() => groupedByAm.filter(am => resolveAmDivisi(am) === "DPS"), [groupedByAm]);
  const dssGrouped = useMemo(() => groupedByAm.filter(am => resolveAmDivisi(am) === "DSS"), [groupedByAm]);

  function computeDivisiStatsFromGroup(grp: typeof dpsGrouped) {
    const allLops: LopRow[] = [];
    for (const am of grp) for (const lops of am.phases.values()) allLops.push(...lops);
    const byStatusMap: Record<string, { status: string; count: number; totalNilai: number }> = {};
    for (const l of allLops) {
      const s = l.statusF || "Unknown";
      if (!byStatusMap[s]) byStatusMap[s] = { status: s, count: 0, totalNilai: 0 };
      byStatusMap[s].count++;
      byStatusMap[s].totalNilai += l.nilaiProyek || 0;
    }
    return {
      totalLop: allLops.length,
      totalNilai: allLops.reduce((s, l) => s + (l.nilaiProyek || 0), 0),
      pelangganCount: new Set(allLops.map(l => l.pelanggan).filter(Boolean)).size,
      byStatus: Object.values(byStatusMap),
    };
  }
  const dpsStats = useMemo(() => computeDivisiStatsFromGroup(dpsGrouped), [dpsGrouped]);
  const dssStats = useMemo(() => computeDivisiStatsFromGroup(dssGrouped), [dssGrouped]);

  const lastAutoExpandId = useRef<number | null>(undefined as any);
  useEffect(() => {
    if (groupedByAm.length === 0) return;
    if (importId === lastAutoExpandId.current) return;
    lastAutoExpandId.current = importId;
    setExpandedAm({}); setExpandedPhase({}); setAllExpanded(false);
  }, [groupedByAm, importId]);

  function toggleAmRow(key: string) {
    setExpandedAm(p => ({ ...p, [key]: !p[key] }));
  }
  function handleAmExpandIcon(amKey: string, phases: string[]) {
    const isNowExpanding = !expandedAm[amKey];
    setExpandedAm(p => ({ ...p, [amKey]: isNowExpanding }));
    if (isNowExpanding) {
      const pk: Record<string, boolean> = {};
      for (const ph of phases) pk[`${amKey}|${ph}`] = true;
      setExpandedPhase(p => ({ ...p, ...pk }));
    } else {
      setExpandedPhase(p => {
        const n = { ...p };
        for (const ph of phases) delete n[`${amKey}|${ph}`];
        return n;
      });
    }
  }
  function togglePhaseRow(key: string) { setExpandedPhase(p => ({ ...p, [key]: !p[key] })); }

  function handleToggleAll() {
    const next = !allExpanded;
    setAllExpanded(next);
    if (next) {
      const ak: Record<string, boolean> = {}, pk: Record<string, boolean> = {};
      for (const am of groupedByAm) {
        ak[am.nikAm || am.namaAm] = true;
        for (const [ph] of am.phases) pk[`${am.nikAm || am.namaAm}|${ph}`] = true;
      }
      setExpandedAm(ak); setExpandedPhase(pk);
    } else { setExpandedAm({}); setExpandedPhase({}); }
  }

  // ── Reusable AM tbody renderer (used in all-mode and split-mode) ─────────────
  function renderAmTbodyContent(ams: typeof groupedByAm, emptyMsg?: string) {
    if (isLoading) return <tr><td colSpan={5} className="text-center py-12 text-muted-foreground text-sm">Memuat data...</td></tr>;
    if (ams.length === 0) return <tr><td colSpan={5} className="text-center py-12 text-muted-foreground text-sm">{emptyMsg ?? "Belum ada data"}</td></tr>;
    return <>{ams.map(am => {
      const amKey = am.nikAm || am.namaAm;
      const amExpanded = !!expandedAm[amKey];
      const amTotal = Array.from(am.phases.values()).flat().reduce((s, l) => s + (l.nilaiProyek || 0), 0);
      const amLopCount = Array.from(am.phases.values()).flat().length;
      const orderedPhases = [...PHASES.filter(p => am.phases.has(p)), ...Array.from(am.phases.keys()).filter(p => !PHASES.includes(p))];
      const ring = amExpanded ? "#94a3b8" : undefined;
      const ringStyle = (extra?: React.CSSProperties): React.CSSProperties =>
        ring ? { borderLeft: `2px solid ${ring}`, borderRight: `2px solid ${ring}`, ...extra } : {};
      return (
        <React.Fragment key={amKey}>
          <tr className="cursor-pointer select-none bg-card hover:bg-secondary/30 transition-colors"
            style={ring ? { borderTop: `2px solid ${ring}`, borderLeft: `2px solid ${ring}`, borderRight: `2px solid ${ring}`, borderBottom: amExpanded ? "none" : `2px solid ${ring}` } : { borderTop: "2px solid transparent" }}
            onClick={() => toggleAmRow(amKey)}>
            <td className="px-4 py-3">
              <div className="flex items-center gap-2">
                <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform shrink-0", amExpanded && "rotate-90")} />
                <span className="font-black text-foreground text-sm uppercase tracking-wide">{am.namaAm}</span>
                {(()=>{const d=resolveAmDivisi(am);return d?<span className={cn("text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0",d==="DPS"?"bg-blue-100 text-blue-700":d==="DSS"?"bg-emerald-100 text-emerald-700":"bg-slate-100 text-slate-600")}>{d}</span>:null;})()}
                <button type="button" onClick={e => { e.stopPropagation(); handleAmExpandIcon(amKey, orderedPhases); }}
                  className="ml-1 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors shrink-0"
                  title={amExpanded ? "Collapse semua proyek" : "Expand semua proyek"}>
                  {amExpanded ? <Minimize2 className="w-3 h-3" /> : <Expand className="w-3 h-3" />}
                </button>
              </div>
            </td>
            <td className="px-3 py-3" colSpan={amExpanded ? 4 : 3}>
              <span className="text-xs font-black text-foreground tracking-wide">TOTAL {amLopCount} LOP</span>
            </td>
            {!amExpanded && (
              <td className="px-4 py-3 text-right whitespace-nowrap">
                <span className="font-black text-foreground tabular-nums text-sm whitespace-nowrap">{formatRupiahFull(amTotal)}</span>
              </td>
            )}
          </tr>
          {amExpanded && orderedPhases.map((phase) => {
            const lops = am.phases.get(phase) || [];
            const phaseKey = `${amKey}|${phase}`;
            const phaseExpanded = !!expandedPhase[phaseKey];
            const phaseTotal = lops.reduce((s, l) => s + (l.nilaiProyek || 0), 0);
            const c = PHASE_COLORS[phase];
            return (
              <React.Fragment key={phaseKey}>
                <tr className="cursor-pointer select-none hover:brightness-95 transition-all"
                  style={{ background: "rgba(253,242,248,0.75)", borderLeft: `4px solid ${c?.bar || "#94a3b8"}`, ...ringStyle({}) }}
                  onClick={() => togglePhaseRow(phaseKey)}>
                  <td className="px-4 py-2.5 pl-10">
                    <div className="flex items-center gap-2">
                      <ChevronRight className={cn("w-3.5 h-3.5 text-slate-500 transition-transform shrink-0", phaseExpanded && "rotate-90")} />
                      <span className="text-sm font-black uppercase tracking-wide" style={{ color: c?.text }}>DAFTAR PROYEK {phase}</span>
                      <span className="text-xs font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">{lops.length} proyek</span>
                    </div>
                  </td>
                  {phaseExpanded
                    ? <td colSpan={4} className="px-3 py-2.5" />
                    : <>
                        <td colSpan={3} className="px-3 py-2.5" />
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <span className="text-sm font-black text-foreground tabular-nums whitespace-nowrap">{formatRupiahFull(phaseTotal)}</span>
                        </td>
                      </>
                  }
                </tr>
                {phaseExpanded && (
                  <>
                    {lops.map((lop, idx) => (
                      <tr key={`${lop.lopid}-${idx}`} className="hover:bg-pink-50 transition-colors" style={ringStyle({})}>
                        <td className="px-4 py-2 pl-16">
                          <div className="text-sm text-foreground font-bold leading-tight line-clamp-2 max-w-[280px]" title={lop.judulProyek}>{lop.judulProyek}</div>
                        </td>
                        <td className="px-3 py-2"><KontrakBadge k={lop.kategoriKontrak} /></td>
                        <td className="px-3 py-2 font-mono text-xs text-foreground whitespace-nowrap">{lop.lopid}</td>
                        <td className="px-3 py-2 text-sm text-foreground font-bold max-w-[220px] truncate" title={lop.pelanggan}>{lop.pelanggan}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-base font-black text-foreground whitespace-nowrap">{formatRupiahFull(lop.nilaiProyek)}</td>
                      </tr>
                    ))}
                    <tr className="bg-red-50 border-t border-red-200" style={ringStyle({})}>
                      <td colSpan={4} className="px-4 py-2 pl-16">
                        <span className="text-sm font-black text-red-800 uppercase tracking-wide">Total Nilai {phase}</span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-black text-red-800 whitespace-nowrap text-base">{formatRupiahFull(phaseTotal)}</td>
                    </tr>
                  </>
                )}
              </React.Fragment>
            );
          })}
          {amExpanded && (
            <tr className="bg-slate-100 border-t-2 border-slate-300" style={ring ? { borderLeft: `2px solid ${ring}`, borderRight: `2px solid ${ring}`, borderBottom: `2px solid ${ring}` } : {}}>
              <td colSpan={4} className="px-4 py-2.5 pl-10">
                <span className="text-sm font-black text-red-700 uppercase tracking-wide">Total Nilai Proyek — {am.namaAm}</span>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums font-black text-red-700 whitespace-nowrap text-lg">{formatRupiahFull(amTotal)}</td>
            </tr>
          )}
        </React.Fragment>
      );
    })}</>;
  }

  const hasActiveFilter = filterStatus.size > 0 || filterDivisi !== "all" || filterMonths.size > 0 || filterKontrak.size > 0;
  const hasDetailFilter = filterAm.size > 0;

  const effectiveTargetHo = data?.targetHo || 0;
  const effectiveTargetFullHo = data?.targetFullHo || 0;
  const activeTarget = filterTarget === "ho" ? effectiveTargetHo : effectiveTargetFullHo;
  const pct = activeTarget ? (periodStats.realFullHo / activeTarget) * 100 : 0;

  return (
    <div className="space-y-4 p-4">

      {/* Filter Bar */}
      <div className="bg-card border border-border rounded-xl px-4 py-3 shadow-sm">
        <div className="flex items-end gap-2 flex-nowrap overflow-x-auto">
          <SelectDropdown label="Snapshot" value={String(importId || "")}
            onChange={v => setImportId(Number(v))}
            options={snapshotOptions.length > 0 ? snapshotOptions : [{ value: "", label: "Belum ada data" }]}
            disabled={snapshotOptions.length === 0} className="w-36 shrink-0" />

          <div className="w-px h-9 bg-border self-end shrink-0" />
          <PeriodeTreeDropdown label="Periode"
            filterYears={filterYears} filterMonths={filterMonths}
            availableYears={availableYears}
            onChange={(yrs, ms) => { setFilterYears(yrs); setFilterMonths(ms); }}
            className="w-48 shrink-0" />

          <div className="w-px h-9 bg-border self-end shrink-0" />
          <SelectDropdown label="Divisi" value={filterDivisi} onChange={setFilterDivisi}
            options={[{ value: "all", label: "Semua Divisi" }, { value: "DPS", label: "DPS" }, { value: "DSS", label: "DSS" }]}
            className="w-28 shrink-0" />
          <CheckboxDropdown label="Kategori Kontrak" options={kontrakOptions} selected={filterKontrak} onChange={setFilterKontrak}
            placeholder="Semua kontrak" summaryLabel="kontrak" className="w-36 shrink-0" />
          <CheckboxDropdown label="Status Funnel" options={PHASES} selected={filterStatus} onChange={setFilterStatus}
            placeholder="Semua status" labelFn={p => `${p} – ${PHASE_LABELS[p]}`} summaryLabel="status" className="w-32 shrink-0" />
          <SelectDropdown label="Target" value={filterTarget} onChange={v => setFilterTarget(v as "ho" | "fullho")}
            options={[{ value: "fullho", label: "Target Full HO" }, { value: "ho", label: "Target HO" }]}
            className="w-32 shrink-0" />
          <div className="w-px h-9 bg-border self-end shrink-0" />

          {/* View Mode Toggle */}
          <div className="flex flex-col gap-1 shrink-0">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Tampilan</label>
            <div className="flex border border-border rounded-lg overflow-hidden h-9">
              <button
                type="button"
                onClick={() => setViewMode("all")}
                title="Semua Divisi"
                className={cn(
                  "flex items-center gap-1.5 px-3 text-xs font-semibold transition-colors whitespace-nowrap",
                  viewMode === "all"
                    ? "bg-red-700 text-white"
                    : "bg-background text-muted-foreground hover:text-foreground"
                )}>
                <AlignJustify className="w-3.5 h-3.5" /> Semua
              </button>
              <div className="w-px bg-border" />
              <button
                type="button"
                onClick={() => setViewMode("split")}
                title="Per Divisi (DPS | DSS)"
                className={cn(
                  "flex items-center gap-1.5 px-3 text-xs font-semibold transition-colors whitespace-nowrap",
                  viewMode === "split"
                    ? "bg-red-700 text-white"
                    : "bg-background text-muted-foreground hover:text-foreground"
                )}>
                <Columns2 className="w-3.5 h-3.5" /> Per Divisi
              </button>
            </div>
          </div>

          {hasActiveFilter && (
            <div className="flex flex-col gap-1 shrink-0">
              <label className="text-[10px] font-bold text-transparent uppercase">.</label>
              <button onClick={() => {
                setFilterStatus(new Set()); setFilterDivisi("all");
                setFilterMonths(new Set()); setFilterKontrak(new Set());
              }}
                className="h-9 flex items-center gap-1 px-3 text-sm text-destructive border border-destructive/30 rounded-lg hover:bg-destructive/5 transition-colors whitespace-nowrap">
                <X className="w-3.5 h-3.5" /> Reset
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Content Area ─────────────────────────────────────────────────────── */}
      {viewMode !== "split" && (isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[0,1].map(i => <div key={i} className="bg-card border border-border rounded-xl h-52 animate-pulse" />)}
          </div>
          <div className="bg-card border border-border rounded-xl h-36 animate-pulse" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
              <h3 className="text-sm font-display font-semibold text-foreground mb-3">LOP per Fase</h3>
              <FaseBarChart data={data ? { ...data, byStatus: periodStats.byStatus } : undefined} />
            </div>
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
              <h3 className="text-sm font-display font-semibold text-foreground mb-2">
                Capaian Real vs {filterTarget === "ho" ? "Target HO" : "Target Full HO"}
              </h3>
              <Gauge pct={pct} targetHo={effectiveTargetHo} targetFullHo={effectiveTargetFullHo} real={periodStats.realFullHo} mode={filterTarget} />
            </div>
          </div>
          <KpiGrid data={data ? { ...data, totalLop: periodStats.totalLop, totalNilai: periodStats.totalNilai, pelangganCount: periodStats.pelangganCount } : undefined} />
        </div>
      ))}

      {/* Detail Table — hanya di "all" mode */}
      {viewMode !== "split" && <div className="bg-card border border-border rounded-xl shadow-sm">
        <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-display font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Detail Funnel per AM
          </h3>
          <div className="flex items-end gap-2 flex-1 justify-end flex-wrap">
            <CheckboxDropdown label="Nama AM" options={amOptions} selected={filterAm} onChange={setFilterAm}
              placeholder="Semua AM" labelFn={amLabelFn} summaryLabel="AM" className="w-44 shrink-0" />
            {hasDetailFilter && (
              <button onClick={() => setFilterAm(new Set())}
                className="h-9 flex items-center gap-1 px-2.5 text-sm text-destructive border border-destructive/30 rounded-lg hover:bg-destructive/5 transition-colors whitespace-nowrap">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input type="text" placeholder="Cari proyek / pelanggan / LOP ID…" value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 pr-7 py-1.5 text-sm bg-background border border-border rounded-lg w-60 focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/60" />
              {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>}
            </div>
            <button onClick={handleToggleAll}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap">
              {allExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Expand className="w-3.5 h-3.5" />}
              {allExpanded ? "Collapse Semua" : "Expand Semua AM"}
            </button>
          </div>
        </div>

        <div className="p-3">
          <div className="border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-red-700 text-white font-black uppercase tracking-wide text-xs">
                <th className="px-4 py-3 rounded-tl-lg min-w-[320px]">AM / Fase / Proyek</th>
                <th className="px-3 py-3 whitespace-nowrap w-28">KATEGORI</th>
                <th className="px-3 py-3 font-mono whitespace-nowrap w-28">LOP ID</th>
                <th className="px-3 py-3 min-w-[220px]">Pelanggan</th>
                <th className="px-4 py-3 text-right whitespace-nowrap rounded-tr-lg min-w-[200px]">Nilai Proyek</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {renderAmTbodyContent(groupedByAm, search || hasActiveFilter || hasDetailFilter ? "Tidak ada data yang cocok dengan filter" : "Belum ada data funnel")}
            </tbody>
          </table>
          </div>
          </div>
        </div>
      </div>}

      {/* ── SPLIT MODE: DPS | DSS per-divisi panels ─────────────────────────── */}
      {viewMode === "split" && (
        <div className="flex flex-col gap-4">
        {/* Row 1: Stats + Chart */}
        <div className="grid grid-cols-2 gap-4">
          {(["DPS", "DSS"] as const).map(div => {
            const st = div === "DPS" ? dpsStats : dssStats;
            const isDps = div === "DPS";
            const accent = isDps ? "#3b82f6" : "#10b981";
            const textAccent = isDps ? "text-blue-700" : "text-emerald-700";
            const bgAccent = isDps ? "bg-blue-50/60" : "bg-emerald-50/60";
            const borderTop = isDps ? "border-t-[3px] border-blue-500" : "border-t-[3px] border-emerald-500";
            return (
              <div key={div} className={`bg-card border border-border rounded-xl shadow-sm overflow-hidden ${borderTop}`}>
                {/* Panel Header */}
                <div className={`px-4 py-3 border-b border-border ${bgAccent} flex items-center justify-between gap-3 flex-wrap`}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-3 h-3 rounded-full shadow-sm" style={{ background: accent }} />
                    <div>
                      <div className={`text-2xl font-black uppercase tracking-widest text-foreground leading-none`}>{div}</div>
                      <div className="text-sm font-black text-foreground/80 leading-tight mt-0.5">{isDps ? "Private Service" : "State Service"}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-5">
                    <div className="text-right">
                      <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Total LOP</div>
                      <div className={`text-3xl font-black tabular-nums leading-tight ${textAccent}`}>{st.totalLop}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Total Nilai</div>
                      <div className={`text-sm font-black tabular-nums ${textAccent}`}>{formatRupiah(st.totalNilai)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Pelanggan</div>
                      <div className="text-sm font-black tabular-nums text-foreground">{st.pelangganCount}</div>
                    </div>
                  </div>
                </div>
                {/* Phase Bar Chart */}
                <div className="px-4 py-3">
                  <FaseBarChart data={data ? { ...data, byStatus: st.byStatus } : undefined} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Row 2: Tabel AM (card terpisah) */}
        <div className="grid grid-cols-2 gap-4">
          {(["DPS", "DSS"] as const).map(div => {
            const st = div === "DPS" ? dpsStats : dssStats;
            const grp = div === "DPS" ? dpsGrouped : dssGrouped;
            const isDps = div === "DPS";
            const headerBg = isDps ? "bg-blue-700" : "bg-emerald-700";
            const borderTop = isDps ? "border-t-[3px] border-blue-500" : "border-t-[3px] border-emerald-500";
            return (
              <div key={div} className={`bg-card border border-border rounded-xl shadow-sm overflow-hidden ${borderTop}`}>
                {/* Table Toolbar */}
                <div className="px-3 py-2 border-b border-border bg-secondary/20 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">{grp.length} AM · {st.totalLop} LOP</span>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                      <input type="text" placeholder="Cari…" value={search} onChange={e => setSearch(e.target.value)}
                        className="pl-6 pr-5 py-1 text-xs bg-background border border-border rounded-md w-36 focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/60" />
                      {search && <button onClick={() => setSearch("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>}
                    </div>
                    <button onClick={handleToggleAll}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1 transition-colors whitespace-nowrap">
                      {allExpanded ? <Minimize2 className="w-3 h-3" /> : <Expand className="w-3 h-3" />}
                      {allExpanded ? "Collapse" : "Expand"} Semua
                    </button>
                  </div>
                </div>
                {/* AM Tree Table — overflow-x luar, overflow-y dalam */}
                <div className="overflow-x-auto">
                  <div className="overflow-y-auto" style={{ maxHeight: "clamp(220px, 46vh, 540px)" }}>
                    <table className="w-full text-left text-sm border-collapse" style={{ minWidth: "600px" }}>
                      <thead className="sticky top-0 z-10">
                        <tr className={`${headerBg} text-white font-black uppercase tracking-wide text-xs`}>
                          <th className="px-4 py-2.5 min-w-[280px]">AM / Fase / Proyek</th>
                          <th className="px-3 py-2.5 whitespace-nowrap w-20">KATEGORI</th>
                          <th className="px-3 py-2.5 font-mono whitespace-nowrap w-20">LOP ID</th>
                          <th className="px-3 py-2.5 min-w-[140px]">Pelanggan</th>
                          <th className="px-4 py-2.5 text-right whitespace-nowrap min-w-[140px]">Nilai Proyek</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {renderAmTbodyContent(grp, `Tidak ada AM ${div}`)}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        </div>
      )}

    </div>
  );
}

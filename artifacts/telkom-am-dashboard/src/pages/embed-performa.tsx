import React, { useMemo, useState, useEffect, useCallback } from "react";
import { formatRupiah, formatPercent, getStatusColor, getAchPct, cn } from "@/lib/utils";
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  Line, ComposedChart, Legend, PieChart, Pie
} from "recharts";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { ChevronDown, ChevronRight, Camera, Menu, X, BarChart2, Filter, Activity, ChevronLeft } from "lucide-react";

const SLIDES = [
  { label: "Visualisasi Performa", icon: BarChart2 },
  { label: "AM Sales Funnel", icon: Filter },
  { label: "Sales Activity", icon: Activity },
];

const API_BASE = import.meta.env.VITE_API_URL ?? "";
const MONTHS_LABEL = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const TIPE_RANK = ["Ach MTD","Real Revenue","YTD"];
const TIPE_REVENUE = ["Semua","Reguler","Sustain","Scaling","NGTMA"];

function periodeLabel(ym: string) {
  const [y, m] = ym.split("-");
  return `${MONTHS_LABEL[parseInt(m) - 1]} ${y}`;
}
function shortSnap(createdAt: string) {
  return format(new Date(createdAt), "d MMM yyyy", { locale: idLocale });
}
function parseKomponen(raw: string | null | undefined): any[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}
function sumKomponen(customers: any[], tipe: string): { target: number; real: number } {
  if (tipe === "Semua") return { target: customers.reduce((s, c) => s + (c.targetTotal ?? 0), 0), real: customers.reduce((s, c) => s + (c.realTotal ?? 0), 0) };
  return { target: customers.reduce((s, c) => s + (c[tipe]?.target ?? 0), 0), real: customers.reduce((s, c) => s + (c[tipe]?.real ?? 0), 0) };
}
function getTypedRevenue(row: any, tipe: string): { target: number; real: number } {
  if (tipe === "Semua") return { target: row.targetRevenue ?? 0, real: row.realRevenue ?? 0 };
  if (tipe === "Reguler" && row.targetReguler != null) return { target: row.targetReguler ?? 0, real: row.realReguler ?? 0 };
  if (tipe === "Sustain" && row.targetSustain != null) return { target: row.targetSustain ?? 0, real: row.realSustain ?? 0 };
  if (tipe === "Scaling" && row.targetScaling != null) return { target: row.targetScaling ?? 0, real: row.realScaling ?? 0 };
  if (tipe === "NGTMA" && row.targetNgtma != null) return { target: row.targetNgtma ?? 0, real: row.realNgtma ?? 0 };
  return sumKomponen(parseKomponen(row.komponenDetail), tipe);
}

// ─── TrophyCard ────────────────────────────────────────────────────────────────
function TrophyCard({ title, subtitle, am, value, valueLabel, colorScheme }: {
  title: string; subtitle: string; am: any; value: string; valueLabel: string; colorScheme: "gold" | "blue";
}) {
  const scheme = colorScheme === "gold"
    ? { icon: "🥇", bg: "from-amber-50 via-yellow-50 to-orange-50 dark:from-amber-950/30 dark:via-yellow-950/20 dark:to-orange-950/30", border: "border-amber-300 dark:border-amber-700", accent: "text-amber-700 dark:text-amber-400", valueClr: "text-amber-600 dark:text-amber-400" }
    : { icon: "🏅", bg: "from-blue-50 via-indigo-50 to-sky-50 dark:from-blue-950/30 dark:via-indigo-950/20 dark:to-sky-950/30", border: "border-blue-300 dark:border-blue-700", accent: "text-blue-700 dark:text-blue-400", valueClr: "text-blue-600 dark:text-blue-400" };
  if (!am) return (
    <div className={`rounded-xl bg-gradient-to-br ${scheme.bg} border ${scheme.border} p-4 min-h-[100px] flex flex-col justify-center`}>
      <p className={cn("text-[10px] font-bold uppercase tracking-widest mb-1", scheme.accent)}>{title}</p>
      <p className="text-muted-foreground/50 text-sm">Belum ada data</p>
    </div>
  );
  return (
    <div className={`rounded-xl bg-gradient-to-br ${scheme.bg} border ${scheme.border} p-4 min-w-0`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className={cn("text-[10px] font-bold uppercase tracking-widest", scheme.accent)}>{title}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <span className="text-2xl leading-none">{scheme.icon}</span>
      </div>
      <p className="font-display font-extrabold text-sm text-foreground truncate mb-2" title={am.namaAm}>{am.namaAm}</p>
      <p className={cn("text-3xl font-display font-black tabular-nums leading-none", scheme.valueClr)}>{value}</p>
      <p className="text-[10px] text-muted-foreground mt-1.5">{valueLabel}</p>
    </div>
  );
}

// ─── Custom Tooltip for Trend Chart ────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl p-3 shadow-lg text-xs space-y-1.5 min-w-[160px]">
      <p className="font-bold text-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-semibold tabular-nums">{p.dataKey === "ach" ? `${p.value}%` : formatRupiah(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── CheckboxDropdown ──────────────────────────────────────────────────────────
function CheckboxDropdown({ label, options, selected, onChange, placeholder, labelFn, headerLabel, summaryLabel }: {
  label: string; options: string[]; selected: Set<string>; onChange: (next: Set<string>) => void;
  placeholder?: string; labelFn?: (v: string) => string; headerLabel?: string; summaryLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const lFn = labelFn ?? ((v: string) => v);
  useEffect(() => {
    function handler(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const displayLabel = selected.size === 0
    ? (placeholder || `Pilih ${label}`)
    : selected.size === options.length
      ? `Semua ${summaryLabel || label}`
      : selected.size === 1 ? lFn([...selected][0]) : `${selected.size} ${summaryLabel || label} dipilih`;
  return (
    <div className="flex flex-col gap-1 relative" ref={ref}>
      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>
      <button
        onClick={() => setOpen(v => !v)}
        className="h-8 px-2.5 bg-secondary/50 border border-border rounded-lg text-xs flex items-center gap-1.5 focus:ring-2 focus:ring-primary/20 focus:border-primary min-w-[110px] whitespace-nowrap"
      >
        <span className="flex-1 text-left truncate">{displayLabel}</span>
        <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-popover border border-border rounded-xl shadow-lg min-w-[180px] max-h-60 overflow-y-auto p-1.5">
          <div className="px-2 py-1.5 font-semibold text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border mb-1">{headerLabel || label}</div>
          {options.map(opt => (
            <label key={opt} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-secondary cursor-pointer text-xs">
              <input type="checkbox" className="rounded" checked={selected.has(opt)} onChange={() => {
                const next = new Set(selected);
                if (next.has(opt)) next.delete(opt); else next.add(opt);
                onChange(next);
              }} />
              {lFn(opt)}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Embed Page ────────────────────────────────────────────────────────────
export default function EmbedPerforma() {
  const [imports, setImports] = useState<any[]>([]);
  const [snapshotId, setSnapshotId] = useState<number | null>(null);
  const [allPerfs, setAllPerfs] = useState<any[]>([]);
  const [filterPeriodes, setFilterPeriodes] = useState<Set<string>>(new Set());
  const [filterDivisi, setFilterDivisi] = useState("All");
  const [filterNamaAms, setFilterNamaAms] = useState<Set<string>>(new Set());
  const [filterTipeRank, setFilterTipeRank] = useState("Ach MTD");
  const [filterTipeRevenue, setFilterTipeRevenue] = useState("Semua");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") setCurrentSlide(s => Math.min(s + 1, SLIDES.length - 1));
      if (e.key === "ArrowLeft") setCurrentSlide(s => Math.max(s - 1, 0));
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/api/public/import-history`)
      .then(r => r.json())
      .then((data: any[]) => {
        setImports(data);
        if (data.length > 0) setSnapshotId(data[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!snapshotId) { setAllPerfs([]); return; }
    setLoading(true);
    fetch(`${API_BASE}/api/public/performance?importId=${snapshotId}`)
      .then(r => r.json())
      .then((data: any[]) => {
        setAllPerfs(data);
        const ps = [...new Set(data.map((p: any) => `${p.tahun}-${String(p.bulan).padStart(2, "0")}`))] as string[];
        ps.sort().reverse();
        if (ps.length > 0) setFilterPeriodes(new Set([ps[0]]));
        setFilterDivisi("All");
        setFilterNamaAms(new Set());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [snapshotId]);

  const availablePeriodes = useMemo(() => {
    return [...new Set(allPerfs.map((p: any) => `${p.tahun}-${String(p.bulan).padStart(2, "0")}`))]
      .sort().reverse();
  }, [allPerfs]);

  // Latest selected period (for CM)
  const cmPeriode = useMemo(() => {
    const sorted = [...filterPeriodes].sort().reverse();
    return sorted[0] ?? null;
  }, [filterPeriodes]);
  const cmMonth = useMemo(() => cmPeriode ? parseInt(cmPeriode.split("-")[1]) : null, [cmPeriode]);
  const cmYear = useMemo(() => cmPeriode ? cmPeriode.split("-")[0] : null, [cmPeriode]);

  // amTableData
  const amTableData = useMemo(() => {
    if (!allPerfs.length || !cmPeriode) return [];
    let rows = allPerfs as any[];
    if (filterPeriodes.size > 0) {
      rows = rows.filter((p: any) => filterPeriodes.has(`${p.tahun}-${String(p.bulan).padStart(2, "0")}`));
    }
    const amMap = new Map<string, { cmRow: any; filteredRows: any[] }>();
    for (const r of rows) {
      if (!amMap.has(r.nik)) amMap.set(r.nik, { cmRow: null, filteredRows: [] });
      const e = amMap.get(r.nik)!;
      e.filteredRows.push(r);
      if (r.bulan === cmMonth) e.cmRow = r;
    }
    let result = [...amMap.entries()].map(([nik, entry]) => {
      const cmRow = entry.cmRow;
      if (!cmRow) return null;
      const cmSums = getTypedRevenue(cmRow, filterTipeRevenue);
      let ytdTarget = 0, ytdReal = 0;
      for (const r of entry.filteredRows) {
        const s = getTypedRevenue(r, filterTipeRevenue);
        ytdTarget += s.target; ytdReal += s.real;
      }
      const effectiveCmAch = cmSums.target > 0 ? cmSums.real / cmSums.target : 0;
      const effectiveYtdAch = ytdTarget > 0 ? ytdReal / ytdTarget : 0;
      return {
        nik, namaAm: cmRow.namaAm, divisi: cmRow.divisi, statusWarna: cmRow.statusWarna,
        cmAch: effectiveCmAch, ytdAch: effectiveYtdAch,
        cmTarget: cmSums.target, cmReal: cmSums.real,
        ytdTarget, ytdReal,
        customers: parseKomponen(cmRow.komponenDetail),
      };
    }).filter(Boolean) as any[];
    if (filterDivisi !== "All") result = result.filter(r => r.divisi === filterDivisi);
    if (filterNamaAms.size > 0) result = result.filter(r => filterNamaAms.has(r.namaAm));
    result.sort((a, b) => {
      if (filterTipeRank === "Real Revenue") return b.cmReal - a.cmReal;
      if (filterTipeRank === "YTD") return b.ytdAch - a.ytdAch;
      return b.cmAch - a.cmAch;
    });
    return result.map((r, i) => ({ ...r, displayRank: i + 1 }));
  }, [allPerfs, filterPeriodes, cmPeriode, cmMonth, filterDivisi, filterNamaAms, filterTipeRank, filterTipeRevenue]);

  const divisiOptions = useMemo(() => {
    if (!allPerfs.length || !cmMonth) return [];
    return [...new Set(allPerfs.filter((p: any) => p.bulan === cmMonth).map((p: any) => p.divisi).filter(Boolean))].sort() as string[];
  }, [allPerfs, cmMonth]);

  const amNames = useMemo(() => {
    if (!allPerfs.length || !cmMonth) return [];
    let rows = allPerfs.filter((p: any) => p.bulan === cmMonth);
    if (filterDivisi !== "All") rows = rows.filter(p => p.divisi === filterDivisi);
    return [...new Set(rows.map((p: any) => p.namaAm).filter(Boolean))].sort() as string[];
  }, [allPerfs, cmMonth, filterDivisi]);

  const topCm = useMemo(() => [...amTableData].sort((a, b) => b.cmAch - a.cmAch)[0] ?? null, [amTableData]);
  const topYtd = useMemo(() => [...amTableData].sort((a, b) => b.ytdAch - a.ytdAch)[0] ?? null, [amTableData]);

  const distribusi = useMemo(() => {
    const gte100 = amTableData.filter(r => r.cmAch * 100 >= 100).length;
    const gte80 = amTableData.filter(r => r.cmAch * 100 >= 80 && r.cmAch * 100 < 100).length;
    const lt80 = amTableData.filter(r => r.cmAch * 100 < 80).length;
    return [
      { name: "Ach ≥100%", value: gte100, color: "#22c55e" },
      { name: "Ach 80-99%", value: gte80, color: "#f97316" },
      { name: "Ach <80%", value: lt80, color: "#CC0000" },
    ];
  }, [amTableData]);

  const trendData = useMemo(() => {
    if (!allPerfs.length || !cmYear) return [];
    return MONTHS_LABEL.map((month, idx) => {
      const mNum = idx + 1;
      const rows = allPerfs.filter((p: any) =>
        String(p.tahun) === cmYear && p.bulan === mNum &&
        (filterDivisi === "All" || p.divisi === filterDivisi)
      );
      const target = rows.reduce((s, p) => s + (p.targetRevenue ?? 0), 0);
      const real = rows.reduce((s, p) => s + (p.realRevenue ?? 0), 0);
      const ach = target > 0 ? parseFloat(((real / target) * 100).toFixed(1)) : 0;
      return { month, target, real, ach };
    });
  }, [allPerfs, cmYear, filterDivisi]);

  const totals = useMemo(() => {
    const cmT = amTableData.reduce((s, r) => s + r.cmTarget, 0);
    const cmR = amTableData.reduce((s, r) => s + r.cmReal, 0);
    const ytdT = amTableData.reduce((s, r) => s + r.ytdTarget, 0);
    const ytdR = amTableData.reduce((s, r) => s + r.ytdReal, 0);
    return { cmTarget: cmT, cmReal: cmR, cmAch: cmT > 0 ? cmR / cmT * 100 : 0, ytdAch: ytdT > 0 ? ytdR / ytdT * 100 : 0, ytdReal: ytdR };
  }, [amTableData]);

  const toggleRow = useCallback((nik: string) => {
    setExpandedRows(prev => { const n = new Set(prev); if (n.has(nik)) n.delete(nik); else n.add(nik); return n; });
  }, []);

  const hasData = amTableData.length > 0;

  return (
    <div className="min-h-screen bg-background font-sans text-foreground text-sm">

      {/* ─── Sidebar Drawer ─────────────────────────────── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-64 bg-card border-r border-border flex flex-col shadow-2xl z-10">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-xs font-bold text-foreground">Menu Slide</span>
              <button onClick={() => setSidebarOpen(false)} className="p-1 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 py-2">
              {SLIDES.map((slide, i) => {
                const Icon = slide.icon;
                return (
                  <button
                    key={i}
                    onClick={() => { setCurrentSlide(i); setSidebarOpen(false); }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors",
                      currentSlide === i
                        ? "bg-primary/10 text-primary font-semibold border-r-2 border-primary"
                        : "text-foreground hover:bg-secondary"
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {slide.label}
                  </button>
                );
              })}
            </div>
            <div className="px-4 py-3 border-t border-border text-[10px] text-muted-foreground">
              Gunakan ← → untuk berpindah slide
            </div>
          </div>
        </div>
      )}

      {/* ─── Top Navbar ─────────────────────────────────── */}
      <div className="bg-card border-b border-border sticky top-0 z-30">
        {/* Brand Row */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground shrink-0"
          >
            <Menu className="w-4 h-4" />
          </button>
          <img
            src={`${import.meta.env.BASE_URL}logo-tr3.png`}
            alt="Logo TR3"
            className="h-6 object-contain shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest leading-none">LESA VI WITEL SURAMADU</p>
            <p className="text-sm font-bold text-foreground leading-tight">AM Performance Report</p>
          </div>
          {/* Slide indicator + arrow nav */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setCurrentSlide(s => Math.max(s - 1, 0))}
              disabled={currentSlide === 0}
              className="p-1 rounded-lg hover:bg-secondary transition-colors disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1">
              {SLIDES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentSlide(i)}
                  className={cn("rounded-full transition-all", i === currentSlide ? "w-4 h-2 bg-primary" : "w-2 h-2 bg-border hover:bg-muted-foreground")}
                />
              ))}
            </div>
            <button
              onClick={() => setCurrentSlide(s => Math.min(s + 1, SLIDES.length - 1))}
              disabled={currentSlide === SLIDES.length - 1}
              className="p-1 rounded-lg hover:bg-secondary transition-colors disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Bar (only on Performa slide) */}
        {currentSlide === 0 && (
          <div className="px-4 py-2 flex items-end gap-2 min-w-0">
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Camera className="w-3 h-3" /> Snapshot
              </label>
              <select
                value={snapshotId ?? ""}
                disabled={!imports.length}
                onChange={e => { setSnapshotId(Number(e.target.value)); setFilterPeriodes(new Set()); }}
                className="h-7 px-2 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none disabled:opacity-40 w-full"
              >
                {imports.length === 0 && <option value="">Belum ada data</option>}
                {imports.map(imp => <option key={imp.id} value={imp.id}>{shortSnap(imp.createdAt)}</option>)}
              </select>
            </div>
            <CheckboxDropdown label="Periode Bulan" options={availablePeriodes} selected={filterPeriodes} onChange={setFilterPeriodes} labelFn={periodeLabel} headerLabel="" summaryLabel="Periode" />
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Divisi</label>
              <select value={filterDivisi} onChange={e => { setFilterDivisi(e.target.value); setFilterNamaAms(new Set()); }}
                disabled={!divisiOptions.length} className="h-7 px-2 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none disabled:opacity-40 w-full">
                <option value="All">Semua Divisi</option>
                {divisiOptions.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <CheckboxDropdown label="Nama AM" options={amNames} selected={filterNamaAms} onChange={setFilterNamaAms} placeholder="Semua AM" headerLabel="Pilih AM" summaryLabel="AM" />
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Tipe Rank</label>
              <select value={filterTipeRank} onChange={e => setFilterTipeRank(e.target.value)} className="h-7 px-2 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none w-full">
                {TIPE_RANK.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Tipe Revenue</label>
              <select value={filterTipeRevenue} onChange={e => setFilterTipeRevenue(e.target.value)} className="h-7 px-2 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none w-full">
                {TIPE_REVENUE.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ─── Slide: Sales Funnel (placeholder) ───────────── */}
      {currentSlide === 1 && (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-8">
          <Filter className="w-16 h-16 text-muted-foreground/30" />
          <h2 className="text-xl font-bold text-foreground">AM Sales Funnel</h2>
          <p className="text-sm text-muted-foreground max-w-xs">Visualisasi sales funnel sedang dalam pengembangan. Gunakan ← → atau sidebar untuk berpindah slide.</p>
          <div className="flex gap-2 mt-4">
            <button onClick={() => setCurrentSlide(0)} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border hover:bg-secondary transition-colors">
              <ChevronLeft className="w-3.5 h-3.5" /> Performa
            </button>
            <button onClick={() => setCurrentSlide(2)} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border hover:bg-secondary transition-colors">
              Sales Activity <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ─── Slide: Sales Activity (placeholder) ─────────── */}
      {currentSlide === 2 && (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-8">
          <Activity className="w-16 h-16 text-muted-foreground/30" />
          <h2 className="text-xl font-bold text-foreground">Sales Activity</h2>
          <p className="text-sm text-muted-foreground max-w-xs">Visualisasi sales activity sedang dalam pengembangan. Gunakan ← → atau sidebar untuk berpindah slide.</p>
          <div className="flex gap-2 mt-4">
            <button onClick={() => setCurrentSlide(1)} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border hover:bg-secondary transition-colors">
              <ChevronLeft className="w-3.5 h-3.5" /> Sales Funnel
            </button>
          </div>
        </div>
      )}

      {/* ─── Slide: Visualisasi Performa ─────────────────── */}
      {currentSlide === 0 && (
      <div className="p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">Memuat data...</div>
        ) : !hasData ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">Belum ada data performa</div>
        ) : (
          <>
            {/* Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <TrophyCard colorScheme="gold"
                title={`#1 Best CM · ${cmPeriode ? periodeLabel(cmPeriode) : "—"}`}
                subtitle={topCm ? `Divisi ${topCm.divisi}` : ""}
                am={topCm} value={topCm ? formatPercent(topCm.cmAch) : "–"}
                valueLabel={topCm ? `Real: ${formatRupiah(topCm.cmReal)}  ·  Target: ${formatRupiah(topCm.cmTarget)}` : "Belum ada data"}
              />
              <TrophyCard colorScheme="blue"
                title={`#1 Best YTD · ${filterPeriodes.size > 1 ? `${filterPeriodes.size} Periode` : cmPeriode ? periodeLabel(cmPeriode) : "—"}`}
                subtitle={topYtd ? `Divisi ${topYtd.divisi}` : ""}
                am={topYtd} value={topYtd ? formatPercent(topYtd.ytdAch) : "–"}
                valueLabel={topYtd ? `YTD Real: ${formatRupiah(topYtd.ytdReal)}  ·  Target: ${formatRupiah(topYtd.ytdTarget)}` : "Belum ada data"}
              />
              {/* Distribusi */}
              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Distribusi Pencapaian Target</h3>
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0" style={{ width: 100, height: 100 }}>
                    <ResponsiveContainer width={100} height={100}>
                      <PieChart>
                        <Pie data={distribusi} cx="50%" cy="50%" innerRadius={26} outerRadius={42} dataKey="value" labelLine={false}>
                          {distribusi.map((e, i) => <Cell key={i} fill={e.color} />)}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: "10px", border: "none", fontSize: "11px" }} formatter={(v, n) => [`${v} AM`, n]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="text-center">
                        <p className="text-base font-black text-foreground">{amTableData.length}</p>
                        <p className="text-[9px] text-muted-foreground">AM</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 space-y-2">
                    {distribusi.map(d => (
                      <div key={d.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                          <span className="text-muted-foreground text-[11px]">{d.name}</span>
                        </div>
                        <span className="font-bold tabular-nums text-[11px]">{d.value} AM</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-secondary/30">
                <h3 className="text-sm font-bold text-foreground">AM Performance Report</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-secondary/50">
                      <th className="px-3 py-3 w-5"></th>
                      <th className="px-4 py-3 text-left text-xs font-black text-foreground uppercase tracking-wide">Nama AM</th>
                      <th className="px-3 py-3 text-center text-xs font-black text-foreground uppercase tracking-wide">Rank</th>
                      <th className="px-4 py-3 text-right text-xs font-black text-foreground uppercase tracking-wide">Target CM</th>
                      <th className="px-4 py-3 text-right text-xs font-black text-foreground uppercase tracking-wide">Real CM</th>
                      <th className="px-3 py-3 text-right text-xs font-black text-foreground uppercase tracking-wide">CM %</th>
                      <th className="px-3 py-3 text-right text-xs font-black text-foreground uppercase tracking-wide">YTD %</th>
                      <th className="px-3 py-3 text-center text-xs font-black text-foreground uppercase tracking-wide">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {amTableData.map(row => {
                      const isExpanded = expandedRows.has(row.nik);
                      const hasCustomers = row.customers.length > 0;
                      const totalReal = row.customers.reduce((s: number, c: any) => s + (c.realTotal ?? 0), 0);
                      return (
                        <React.Fragment key={row.nik}>
                          <tr className={cn("hover:bg-secondary/20 transition-colors", hasCustomers && "cursor-pointer")}
                            onClick={() => hasCustomers && toggleRow(row.nik)}>
                            <td className="px-2 py-2 text-muted-foreground">
                              {hasCustomers ? (isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />) : null}
                            </td>
                            <td className="px-4 py-2 font-medium text-foreground">
                              <span className="truncate max-w-[140px] block" title={row.namaAm}>{row.namaAm}</span>
                              <span className="text-[10px] text-muted-foreground">{row.divisi}</span>
                            </td>
                            <td className="px-3 py-2 text-center font-bold text-muted-foreground">{row.displayRank}</td>
                            <td className="px-4 py-2 text-right text-muted-foreground tabular-nums">{formatRupiah(row.cmTarget)}</td>
                            <td className="px-4 py-2 text-right font-medium tabular-nums">{formatRupiah(row.cmReal)}</td>
                            <td className={cn("px-3 py-2 text-right font-bold tabular-nums", row.cmAch >= 1 ? "text-green-600" : row.cmAch >= 0.8 ? "text-orange-500" : "text-red-600")}>
                              {(row.cmAch * 100).toFixed(1).replace(".", ",")}%
                            </td>
                            <td className={cn("px-3 py-2 text-right font-bold tabular-nums", row.ytdAch >= 1 ? "text-green-600" : row.ytdAch >= 0.8 ? "text-blue-600" : "text-muted-foreground")}>
                              {(row.ytdAch * 100).toFixed(1).replace(".", ",")}%
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold border", getStatusColor(row.statusWarna))}>
                                {row.statusWarna?.toUpperCase() ?? "–"}
                              </span>
                            </td>
                          </tr>
                          {isExpanded && hasCustomers && (
                            <tr className="bg-secondary/10">
                              <td colSpan={8} className="px-0 py-0">
                                <div className="mx-4 mb-2 mt-0.5 border border-border/60 rounded-lg overflow-hidden">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="bg-secondary/70">
                                        <th className="px-3 py-2 text-left text-xs font-black text-foreground uppercase tracking-wide">Pelanggan / NIP</th>
                                        <th className="px-3 py-2 text-right text-xs font-black text-foreground uppercase tracking-wide">Proporsi</th>
                                        <th className="px-3 py-2 text-right text-xs font-black text-foreground uppercase tracking-wide">Target</th>
                                        <th className="px-3 py-2 text-right text-xs font-black text-foreground uppercase tracking-wide">Real</th>
                                        <th className="px-3 py-2 text-right text-xs font-black text-foreground uppercase tracking-wide">Ach %</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/40">
                                      {row.customers.map((c: any, ci: number) => {
                                        const cReal = c.realTotal ?? 0;
                                        const cTarget = c.targetTotal ?? 0;
                                        const prop = totalReal > 0 ? cReal / totalReal * 100 : 0;
                                        const cAch = cTarget > 0 ? cReal / cTarget * 100 : 0;
                                        return (
                                          <tr key={ci} className="hover:bg-secondary/30">
                                            <td className="px-3 py-1.5 font-medium text-foreground">
                                              <div className="truncate max-w-[180px]">{c.pelanggan || "—"}</div>
                                              {c.nip && <div className="text-[10px] text-muted-foreground">{c.nip}</div>}
                                            </td>
                                            <td className="px-3 py-1.5 text-right tabular-nums">
                                              <div className="flex items-center justify-end gap-1.5">
                                                <div className="w-12 h-1.5 bg-secondary rounded-full overflow-hidden">
                                                  <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(prop, 100)}%` }} />
                                                </div>
                                                <span className="text-muted-foreground">{prop.toFixed(1)}%</span>
                                              </div>
                                            </td>
                                            <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{formatRupiah(cTarget)}</td>
                                            <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatRupiah(cReal)}</td>
                                            <td className="px-3 py-1.5 text-right tabular-nums">
                                              <span className={cn("font-semibold", cAch >= 100 ? "text-green-600" : cAch >= 80 ? "text-orange-500" : "text-red-500")}>
                                                {cAch.toFixed(1)}%
                                              </span>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Summary */}
              <div className="mt-0 grid grid-cols-2 lg:grid-cols-4 gap-2 p-3 border-t border-border">
                {[
                  { label: "CM Real", value: formatRupiah(totals.cmReal), color: "text-foreground", bold: true },
                  { label: "CM Target", value: formatRupiah(totals.cmTarget), color: "text-muted-foreground", bold: false },
                  { label: `CM Ach (${totals.cmAch.toFixed(1)}%)`, value: totals.cmAch >= 100 ? "Tercapai" : totals.cmAch >= 80 ? "Mendekati" : "Di Bawah Target",
                    color: totals.cmAch >= 100 ? "text-green-600" : totals.cmAch >= 80 ? "text-orange-500" : "text-red-600", bold: true },
                  { label: `YTD Ach (${totals.ytdAch.toFixed(1)}%)`, value: formatRupiah(totals.ytdReal),
                    color: totals.ytdAch >= 100 ? "text-green-600" : totals.ytdAch >= 80 ? "text-blue-600" : "text-muted-foreground", bold: true },
                ].map(item => (
                  <div key={item.label} className="bg-secondary/40 rounded-xl px-3 py-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{item.label}</p>
                    <p className={cn("text-xs tabular-nums", item.bold ? "font-bold" : "font-normal", item.color)}>{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Trend Chart */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-bold text-foreground mb-3">
                Tren Performa Revenue Bulanan {cmYear ?? ""}
                {filterDivisi !== "All" && <span className="ml-2 text-xs text-muted-foreground font-normal">· {filterDivisi}</span>}
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={trendData} margin={{ top: 5, right: 20, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 10 }}
                    tickFormatter={v => v >= 1e9 ? `Rp${(v/1e9).toFixed(0)}M` : v >= 1e6 ? `Rp${(v/1e6).toFixed(0)}Jt` : "0"} />
                  <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} domain={[0, 200]} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                  <Bar yAxisId="left" dataKey="real" name="Real Revenue" fill="#22c55e" radius={[3,3,0,0]} maxBarSize={36} />
                  <Bar yAxisId="left" dataKey="target" name="Target Revenue" fill="#3b82f6" radius={[3,3,0,0]} maxBarSize={36} />
                  <Line yAxisId="right" type="monotone" dataKey="ach" name="Ach Rate %" stroke="#CC0000" strokeWidth={2.5} dot={{ fill: "#CC0000", r: 3 }} activeDot={{ r: 5 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
      )}
      <div className="px-4 py-2 text-[10px] text-muted-foreground/40 text-right">Telkom AM Dashboard · Data diperbarui otomatis</div>
    </div>
  );
}

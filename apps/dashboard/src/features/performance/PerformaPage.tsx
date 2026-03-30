import React, { useMemo, useState, useCallback, useRef, useEffect as useEffectRef } from "react";
import { FunnelSectionCard } from "./FunnelSectionCard";
import { matchesDivisiPerforma, DIVISI_OPTIONS_WITH_ALL, divisiFilterLabel } from "@/shared/lib/divisi";
import { useListPerformance, useListImportHistory } from "@workspace/api-client-react";
import { formatRupiah, formatPercent, getStatusColor, getAchPct, cn } from "@/shared/lib/utils";
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  Line, ComposedChart, Legend, PieChart, Pie
} from "recharts";
import {
  Trophy, Database, AlertCircle, TrendingUp, Medal, ChevronDown,
  ChevronRight, Camera, ChevronUp, Expand, Minimize2, Check, X, Search
} from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

const MONTHS_LABEL = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const MONTHS_FULL  = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const TIPE_RANK = ["Ach CM","Ach YTD","Real Revenue"];
const TIPE_REVENUE = ["Reguler","Sustain","Scaling","NGTMA"];

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-20 h-20 rounded-2xl bg-primary/5 border-2 border-dashed border-primary/20 flex items-center justify-center mb-6">
        <Database className="w-9 h-9 text-primary/40" />
      </div>
      <h3 className="text-xl font-display font-bold text-foreground mb-2">Belum Ada Data Performa</h3>
      <p className="text-muted-foreground text-sm max-w-sm leading-relaxed mb-6">
        Import data snapshot performansi AM dari SharePoint terlebih dahulu.
      </p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/60 px-4 py-2.5 rounded-full border border-border">
        <AlertCircle className="w-3.5 h-3.5" />
        <span>Pergi ke <strong>Import Data</strong> untuk sinkronisasi data performansi</span>
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const monthFull = payload[0]?.payload?.monthFull as string | undefined;
  const divisiLabel = payload[0]?.payload?.divisiLabel as string | undefined;
  const titleMonth = monthFull ?? label;
  const titlePrefix = divisiLabel ? `Revenue ${divisiLabel} – ` : "Revenue – ";
  return (
    <div className="bg-card border border-border rounded-xl shadow-lg px-4 py-3 text-xs min-w-[210px]">
      <p className="font-bold mb-2 text-foreground leading-snug">{titlePrefix}{titleMonth}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="mb-1 font-semibold">
          {p.name}: {p.name === "Ach Rate %" ? `${p.value?.toFixed(2)}%` : formatRupiah(p.value || 0)}
        </p>
      ))}
    </div>
  );
};

const RADIAN = Math.PI / 180;
const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, value }: any) => {
  if (!value) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="bold">{value}</text>;
};

function formatSnapshotLabel(createdAt: string): string {
  return format(new Date(createdAt), "d MMM yyyy", { locale: idLocale });
}

// Parse komponenDetail JSON safely
// Schema DB: [{pelanggan, nip, Reguler:{target,real}, Sustain:{target,real}, Scaling:{target,real}, NGTMA:{target,real}}]
// realTotal & targetTotal dihitung otomatis jika tidak tersedia
const KOMPONEN_CATS = ["Reguler", "Sustain", "Scaling", "NGTMA"] as const;
function parseKomponen(raw: string | null | undefined): any[] {
  if (!raw) return [];
  try {
    const items = JSON.parse(raw);
    if (!Array.isArray(items)) return [];
    return items.map((c: any) => {
      if (c.realTotal == null) {
        c.realTotal = KOMPONEN_CATS.reduce((s, k) => s + ((c[k]?.real) ?? 0), 0);
      }
      if (c.targetTotal == null) {
        c.targetTotal = KOMPONEN_CATS.reduce((s, k) => s + ((c[k]?.target) ?? 0), 0);
      }
      return c;
    });
  } catch { return []; }
}

// Sum target/real from komponenDetail for a given tipeRevenue
function sumKomponen(customers: any[], tipeRevenue: string): { target: number; real: number } {
  if (tipeRevenue === "Semua") {
    return {
      target: customers.reduce((s, c) => s + (c.targetTotal ?? 0), 0),
      real: customers.reduce((s, c) => s + (c.realTotal ?? 0), 0),
    };
  }
  return {
    target: customers.reduce((s, c) => s + (c[tipeRevenue]?.target ?? 0), 0),
    real: customers.reduce((s, c) => s + (c[tipeRevenue]?.real ?? 0), 0),
  };
}

// ─── Trophy Card ──────────────────────────────────────────────────────────────
function TrophyCard({ title, period, am, value, realValue, targetValue, colorScheme }: {
  title: string; period: string; am: any; value: string;
  realValue: string; targetValue: string; colorScheme: 'gold' | 'blue';
}) {
  const scheme = colorScheme === 'gold'
    ? { icon: "🥇", bg: "from-amber-50 via-yellow-50 to-orange-50 dark:from-amber-950/30 dark:via-yellow-950/20 dark:to-orange-950/30", border: "border-amber-300 dark:border-amber-700", accent: "text-amber-700 dark:text-amber-400", valueClr: "text-amber-600 dark:text-amber-400" }
    : { icon: "🏅", bg: "from-blue-50 via-indigo-50 to-sky-50 dark:from-blue-950/30 dark:via-indigo-950/20 dark:to-sky-950/30", border: "border-blue-300 dark:border-blue-700", accent: "text-blue-700 dark:text-blue-400", valueClr: "text-blue-600 dark:text-blue-400" };

  if (!am) return (
    <div className={`rounded-xl bg-gradient-to-br ${scheme.bg} border ${scheme.border} p-5 min-h-[120px] flex flex-col justify-center`}>
      <p className={cn("text-xs font-black uppercase tracking-widest mb-0.5", scheme.accent)}>{title}</p>
      <p className="text-[10px] text-foreground font-medium mb-1">{period}</p>
      <p className="text-muted-foreground/50 text-sm">Belum ada data</p>
    </div>
  );

  return (
    <div className={`rounded-xl bg-gradient-to-br ${scheme.bg} border ${scheme.border} p-5`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className={cn("text-xs font-black uppercase tracking-widest leading-tight", scheme.accent)}>{title}</p>
          <p className="text-[10px] text-foreground font-medium mt-0.5">Divisi {am.divisi} · {period}</p>
        </div>
        <span className="text-2xl leading-none">{scheme.icon}</span>
      </div>
      <p className="font-display font-bold text-base text-foreground truncate mb-2" title={am.namaAm}>{am.namaAm}</p>
      <p className={cn("text-4xl font-display font-bold tabular-nums leading-none mb-2", scheme.valueClr)}>{value}</p>
      <div className="grid grid-cols-2 gap-1.5">
        <div className="border border-current/20 rounded-md px-2 py-1.5 bg-background/40">
          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">Real</p>
          <p className="text-xs font-bold text-foreground truncate">{realValue}</p>
        </div>
        <div className="border border-current/20 rounded-md px-2 py-1.5 bg-background/40">
          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">Target</p>
          <p className="text-xs font-bold text-foreground truncate">{targetValue}</p>
        </div>
      </div>
    </div>
  );
}

// ─── CheckboxDropdown ──────────────────────────────────────────────────────────
function CheckboxDropdown({ label, options, selected, onChange, placeholder, labelFn, headerLabel, summaryLabel, className }: {
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  placeholder?: string;
  labelFn?: (value: string) => string;
  headerLabel?: string;
  summaryLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const getLabel = (v: string) => labelFn ? labelFn(v) : v;

  useEffectRef(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggleItem = (item: string) => {
    const next = new Set(selected);
    if (next.has(item)) next.delete(item); else next.add(item);
    onChange(next);
  };

  const selectAll = () => onChange(new Set(options));
  const clearAll = () => onChange(new Set());

  const unit = summaryLabel ?? "item";
  const displayText = selected.size === 0
    ? (placeholder ?? "Semua")
    : selected.size === options.length
      ? `Semua ${unit}`
      : selected.size === 1
        ? getLabel([...selected][0])
        : `${selected.size} ${unit} dipilih`;

  return (
    <div className={cn("flex flex-col gap-1 relative", className)} ref={ref}>
      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={options.length === 0}
        className={cn(
          "h-8 px-2.5 pr-2 bg-secondary/50 border border-border rounded-lg text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-40 flex items-center gap-1.5 w-full text-left",
          open && "border-primary/50 ring-2 ring-primary/20"
        )}
      >
        <span className="flex-1 truncate text-foreground">{displayText}</span>
        <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-xl shadow-xl min-w-[200px] max-w-[260px] overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-secondary/30">
            {headerLabel ? (
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{headerLabel}</span>
            ) : <span />}
            <div className="flex gap-1.5">
              <button onClick={selectAll} className="text-[10px] text-primary font-semibold hover:underline">Semua</button>
              <span className="text-muted-foreground text-[10px]">·</span>
              <button onClick={clearAll} className="text-[10px] text-muted-foreground font-semibold hover:text-foreground hover:underline">Kosongkan</button>
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {options.map(opt => {
              const checked = selected.has(opt);
              return (
                <label
                  key={opt}
                  className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-secondary/50 cursor-pointer text-xs text-foreground"
                >
                  <div
                    onClick={() => toggleItem(opt)}
                    className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center shrink-0 cursor-pointer transition-colors",
                      checked ? "bg-primary border-primary" : "border-border bg-transparent"
                    )}
                  >
                    {checked && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <span className="truncate" onClick={() => toggleItem(opt)}>{getLabel(opt)}</span>
                </label>
              );
            })}
          </div>
          {selected.size > 0 && (
            <div className="px-3 py-2 border-t border-border bg-secondary/30">
              <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                {[...selected].sort().map(s => (
                  <span key={s} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-[10px] font-medium px-2 py-0.5 rounded-full">
                    <span className="truncate max-w-[90px]">{getLabel(s)}</span>
                    <button onClick={() => toggleItem(s)} className="hover:text-primary/60"><X className="w-2.5 h-2.5" /></button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── SelectDropdown (single-select, consistent with CheckboxDropdown) ───────────
function SelectDropdown({ label, value, onChange, options, className, disabled }: {
  label?: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; className?: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffectRef(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const current = options.find(o => o.value === value);
  return (
    <div className={cn("flex flex-col gap-1 relative", className)} ref={ref}>
      {label && <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>}
      <button
        onClick={() => !disabled && setOpen(v => !v)}
        disabled={disabled}
        className={cn(
          "h-8 px-2.5 bg-secondary/50 border border-border rounded-lg text-xs flex items-center gap-1.5 w-full disabled:opacity-40 transition-colors",
          open && "border-primary/50 ring-2 ring-primary/20"
        )}
      >
        <span className="flex-1 text-left truncate text-foreground">{current?.label ?? value}</span>
        <ChevronDown className={cn("w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-card border border-border rounded-xl shadow-xl min-w-[160px] max-h-60 overflow-y-auto py-1">
          {options.map(opt => (
            <button key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); }}
              className={cn("w-full text-left px-3 py-1.5 text-xs hover:bg-secondary/50 transition-colors flex items-center gap-2 text-foreground", opt.value === value && "font-semibold text-primary")}>
              <span className="w-3.5 shrink-0 flex items-center justify-center">{opt.value === value ? <Check className="w-3 h-3" /> : null}</span>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Helper: format "2026-01" → "Jan 2026"
function periodeLabel(p: string): string {
  const [year, month] = p.split("-");
  return `${MONTHS_LABEL[parseInt(month, 10) - 1]} ${year}`;
}

export default function PerformaVis() {
  // Filter state
  const [filterSnapshotId, setFilterSnapshotId] = useState<number | null>(null);
  const [filterPeriodes, setFilterPeriodes] = useState<Set<string>>(new Set()); // "YYYY-MM"
  const [filterDivisi, setFilterDivisi] = useState("all");
  const [filterNamaAms, setFilterNamaAms] = useState<Set<string>>(new Set());
  const [filterTipeRank, setFilterTipeRank] = useState("Ach CM");
  const [filterTipeRevenue, setFilterTipeRevenue] = useState("Reguler");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandAll, setExpandAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: allPerfs, isLoading } = useListPerformance();
  const { data: importHistory } = useListImportHistory();

  // Performance imports (for snapshot dropdown)
  const perfImports = useMemo(() =>
    ((importHistory || []) as any[]).filter(i => i.type === "performance").sort((a, b) => b.id - a.id),
    [importHistory]
  );

  // Auto-select most recent snapshot when import history loads
  useEffectRef(() => {
    if (perfImports.length > 0 && filterSnapshotId === null) {
      setFilterSnapshotId(perfImports[0].id);
    }
  }, [perfImports]);

  // Available periods "YYYY-MM" sorted ascending (Jan → Dec, oldest first)
  const availablePeriodes = useMemo(() => {
    if (!allPerfs?.length) return [];
    let rows = allPerfs as any[];
    if (filterSnapshotId) rows = rows.filter(p => p.importId === filterSnapshotId);
    return [...new Set(rows.map(p => `${p.tahun}-${String(p.bulan).padStart(2, "0")}`))]
      .sort();
  }, [allPerfs, filterSnapshotId]);

  // Periods that actually have revenue data (targetRevenue or realRevenue > 0)
  const periodesWithData = useMemo(() => {
    if (!allPerfs?.length) return new Set<string>();
    let rows = allPerfs as any[];
    if (filterSnapshotId) rows = rows.filter(p => p.importId === filterSnapshotId);
    return new Set(
      rows
        .filter(p => (p.realRevenue ?? 0) > 0)
        .map(p => `${p.tahun}-${String(p.bulan).padStart(2, "0")}`)
    );
  }, [allPerfs, filterSnapshotId]);

  // Auto-select only periods with actual data when snapshot changes
  React.useEffect(() => {
    if (availablePeriodes.length === 0) { setFilterPeriodes(new Set()); return; }
    setFilterPeriodes(prev => {
      const valid = new Set(availablePeriodes);
      const filtered = new Set([...prev].filter(p => valid.has(p)));
      if (filtered.size > 0) return filtered;
      // Fresh snapshot: prefer periods with real/target data, fallback to all
      const withData = availablePeriodes.filter(p => periodesWithData.has(p));
      return new Set(withData.length > 0 ? withData : availablePeriodes);
    });
  }, [availablePeriodes]);

  // CM periode = latest selected period (max lexicographic)
  const cmPeriode = useMemo(() =>
    filterPeriodes.size > 0 ? [...filterPeriodes].sort().reverse()[0] : null,
    [filterPeriodes]
  );
  const cmYear = useMemo(() => cmPeriode ? cmPeriode.slice(0, 4) : null, [cmPeriode]);
  const cmMonth = useMemo(() => cmPeriode ? parseInt(cmPeriode.slice(5, 7), 10) : null, [cmPeriode]);

  // For each AM, build CM row and YTD aggregation
  const amTableData = useMemo(() => {
    if (!allPerfs?.length || !cmPeriode || !cmMonth) return [];

    const allRows = (allPerfs as any[]).filter(p => {
      const periode = `${p.tahun}-${String(p.bulan).padStart(2, "0")}`;
      return filterPeriodes.has(periode) &&
        (filterSnapshotId === null || p.importId === filterSnapshotId);
    });

    // Latest importId per (nik, month) to avoid double-counting multiple uploads
    const latestImportPerNikMonth = new Map<string, number>();
    for (const r of allRows) {
      const k = `${r.nik}__${r.bulan}`;
      if (!latestImportPerNikMonth.has(k) || r.importId > latestImportPerNikMonth.get(k)!) {
        latestImportPerNikMonth.set(k, r.importId);
      }
    }
    const filteredRows = allRows.filter(r => latestImportPerNikMonth.get(`${r.nik}__${r.bulan}`) === r.importId);

    // Group by NIK
    const amMap = new Map<string, { cmRow: any; ytdTarget: number; ytdReal: number; allCustomers: any[] }>();

    for (const r of filteredRows) {
      if (!amMap.has(r.nik)) {
        amMap.set(r.nik, { cmRow: null, ytdTarget: 0, ytdReal: 0, allCustomers: [] });
      }
      const entry = amMap.get(r.nik)!;
      entry.ytdTarget += r.targetRevenue;
      entry.ytdReal += r.realRevenue;

      const customers = parseKomponen(r.komponenDetail);
      entry.allCustomers.push(...customers);

      if (r.bulan === cmMonth) {
        entry.cmRow = r;
      }
    }

    // Build table rows
    let result = [...amMap.entries()].map(([nik, entry]) => {
      const cmRow = entry.cmRow;
      if (!cmRow) return null;

      const ytdAch = entry.ytdTarget > 0 ? entry.ytdReal / entry.ytdTarget : 0;
      const cmAch = getAchPct(cmRow.achRate);

      // Filter by tipeRevenue — use new per-type columns if available, fallback to komponenDetail JSON
      // Check > 0 (not just != null) because schema defaults are 0, not null
      function hasTyped(target: any, real: any): boolean {
        return (target != null && target > 0) || (real != null && real > 0);
      }
      function getTyped(row: any, tipe: string): { target: number; real: number } {
        if (tipe === "Semua") return { target: row.targetRevenue, real: row.realRevenue };
        if (tipe === "Reguler" && hasTyped(row.targetReguler, row.realReguler)) return { target: row.targetReguler ?? 0, real: row.realReguler ?? 0 };
        if (tipe === "Sustain" && hasTyped(row.targetSustain, row.realSustain)) return { target: row.targetSustain ?? 0, real: row.realSustain ?? 0 };
        if (tipe === "Scaling" && hasTyped(row.targetScaling, row.realScaling)) return { target: row.targetScaling ?? 0, real: row.realScaling ?? 0 };
        if (tipe === "NGTMA" && hasTyped(row.targetNgtma, row.realNgtma)) return { target: row.targetNgtma ?? 0, real: row.realNgtma ?? 0 };
        // fallback to JSON
        return sumKomponen(parseKomponen(row.komponenDetail), tipe);
      }
      const cmSums = getTyped(cmRow, filterTipeRevenue);
      let effectiveCmTarget = cmSums.target;
      let effectiveCmReal = cmSums.real;

      // For YTD, recalculate per-row
      let effectiveYtdTarget = 0;
      let effectiveYtdReal = 0;
      for (const row of filteredRows.filter(r => r.nik === nik)) {
        const sums = getTyped(row, filterTipeRevenue);
        effectiveYtdTarget += sums.target;
        effectiveYtdReal += sums.real;
      }

      const effectiveCmAch = effectiveCmTarget > 0 ? effectiveCmReal / effectiveCmTarget : 0;
      const effectiveYtdAch = effectiveYtdTarget > 0 ? effectiveYtdReal / effectiveYtdTarget : 0;

      return {
        nik,
        namaAm: cmRow.namaAm,
        divisi: cmRow.divisi,
        statusWarna: cmRow.statusWarna,
        cmAch: effectiveCmAch,
        ytdAch: effectiveYtdAch,
        cmTarget: effectiveCmTarget,
        cmReal: effectiveCmReal,
        ytdTarget: effectiveYtdTarget,
        ytdReal: effectiveYtdReal,
        customers: entry.allCustomers, // full list for expand
      };
    }).filter(Boolean) as any[];

    // Apply divisi filter
    if (filterDivisi !== "all") result = result.filter(r => matchesDivisiPerforma(r.divisi, filterDivisi));
    if (filterNamaAms.size > 0) result = result.filter(r => filterNamaAms.has(r.namaAm));

    // Sort by filterTipeRank
    result.sort((a, b) => {
      if (filterTipeRank === "Ach YTD") return b.ytdAch - a.ytdAch;
      if (filterTipeRank === "Real Revenue") return b.cmReal - a.cmReal;
      return b.cmAch - a.cmAch;
    });

    return result.map((r, i) => ({ ...r, displayRank: i + 1 }));
  }, [allPerfs, filterPeriodes, cmPeriode, cmMonth, filterSnapshotId, filterDivisi, filterNamaAms, filterTipeRank, filterTipeRevenue]);

  // Totals
  const totals = useMemo(() => {
    const cmT = amTableData.reduce((s, r) => s + r.cmTarget, 0);
    const cmR = amTableData.reduce((s, r) => s + r.cmReal, 0);
    const ytdT = amTableData.reduce((s, r) => s + r.ytdTarget, 0);
    const ytdR = amTableData.reduce((s, r) => s + r.ytdReal, 0);
    return {
      cmTarget: cmT, cmReal: cmR, cmAch: cmT > 0 ? cmR / cmT * 100 : 0,
      ytdTarget: ytdT, ytdReal: ytdR, ytdAch: ytdT > 0 ? ytdR / ytdT * 100 : 0,
    };
  }, [amTableData]);

  // Trophy top 1 by CM and YTD
  const topCm = useMemo(() => [...amTableData].sort((a, b) => b.cmAch - a.cmAch)[0] ?? null, [amTableData]);
  const topYtd = useMemo(() => [...amTableData].sort((a, b) => b.ytdAch - a.ytdAch)[0] ?? null, [amTableData]);

  // Distribusi donut based on CM achievement
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

  const filteredAmData = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return amTableData;
    return amTableData.filter(row =>
      row.namaAm.toLowerCase().includes(q) ||
      (row.customers || []).some((c: any) =>
        (c.namaCustomer ?? c.customerName ?? c.nama ?? "").toLowerCase().includes(q)
      )
    );
  }, [amTableData, searchQuery]);

  const effectiveExpandedRows = useMemo(() => {
    if (!searchQuery.trim()) return expandedRows;
    return new Set(filteredAmData.map(r => r.nik));
  }, [searchQuery, filteredAmData, expandedRows]);

  // Trend chart (for CM year)
  const trendData = useMemo(() => {
    if (!allPerfs?.length || !cmYear) return [];
    const divisiLabel = divisiFilterLabel(filterDivisi);
    return MONTHS_LABEL.map((month, idx) => {
      const mNum = idx + 1;
      let rows = (allPerfs as any[]).filter(p =>
        String(p.tahun) === cmYear && p.bulan === mNum &&
        matchesDivisiPerforma(p.divisi, filterDivisi) &&
        (filterSnapshotId === null || p.importId === filterSnapshotId)
      );
      const target = rows.reduce((s, p) => s + p.targetRevenue, 0);
      const real = rows.reduce((s, p) => s + p.realRevenue, 0);
      const ach = target > 0 ? (real / target) * 100 : 0;
      return {
        month,
        monthFull: `${MONTHS_FULL[idx]} ${cmYear}`,
        divisiLabel,
        target, real,
        ach: parseFloat(ach.toFixed(1)),
        hasData: rows.length > 0,
      };
    });
  }, [allPerfs, cmYear, filterSnapshotId, filterDivisi]);

  // AM names based on current filters
  const amNames = useMemo(() => {
    if (!allPerfs?.length || !cmPeriode) return [];
    const [y, m] = cmPeriode.split("-").map(Number);
    return [...new Set(
      (allPerfs as any[])
        .filter(p =>
          p.tahun === y && p.bulan === m &&
          matchesDivisiPerforma(p.divisi, filterDivisi)
        ).map(p => p.namaAm)
    )].sort() as string[];
  }, [allPerfs, cmPeriode, filterDivisi]);
  React.useEffect(() => {
    if (filterNamaAms.size > 0) {
      const validNames = new Set(amNames);
      const filtered = new Set([...filterNamaAms].filter(n => validNames.has(n)));
      if (filtered.size !== filterNamaAms.size) setFilterNamaAms(filtered);
    }
  }, [amNames]);

  const toggleRow = useCallback((nik: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(nik)) next.delete(nik); else next.add(nik);
      return next;
    });
  }, []);

  const handleExpandAll = () => {
    if (expandAll) {
      setExpandedRows(new Set());
      setExpandAll(false);
    } else {
      setExpandedRows(new Set(amTableData.map(r => r.nik)));
      setExpandAll(true);
    }
  };

  // Sticky section header height — table header sticks right below it
  const perfSectionHeaderRef = useRef<HTMLDivElement>(null);
  const [perfSectionHeaderH, setPerfSectionHeaderH] = useState(56);
  useEffectRef(() => {
    const el = perfSectionHeaderRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPerfSectionHeaderH(el.offsetHeight));
    ro.observe(el);
    setPerfSectionHeaderH(el.offsetHeight);
    return () => ro.disconnect();
  }, []);
  // Scroll-sync refs for sticky table header (horizontal sync)
  const perfTableHeaderRef = useRef<HTMLDivElement>(null);
  const perfTableBodyRef = useRef<HTMLDivElement>(null);
  const onPerfHeaderScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (perfTableBodyRef.current) perfTableBodyRef.current.scrollLeft = e.currentTarget.scrollLeft;
  }, []);
  const onPerfBodyScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (perfTableHeaderRef.current) perfTableHeaderRef.current.scrollLeft = e.currentTarget.scrollLeft;
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-16 bg-secondary/50 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-28 bg-secondary/50 rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  const hasData = amTableData.length > 0;
  const noDataAtAll = !allPerfs?.length;

  const isPeriodeFiltered = filterPeriodes.size > 0 && filterPeriodes.size < availablePeriodes.length;
  const isDivisiFiltered = filterDivisi !== "all";
  const isAmFiltered = filterNamaAms.size > 0;
  const isRankFiltered = filterTipeRank !== "Ach CM";
  const isRevenueFiltered = filterTipeRevenue !== "Reguler";
  const hasPerformaActiveFilter = isPeriodeFiltered || isDivisiFiltered || isAmFiltered || isRankFiltered || isRevenueFiltered;

  const resetPerformaFilters = () => {
    setFilterDivisi("all");
    setFilterNamaAms(new Set());
    setFilterTipeRank("Ach CM");
    setFilterTipeRevenue("Reguler");
    setSearchQuery("");
    setFilterPeriodes(new Set(availablePeriodes));
  };

  return (
    <div className="space-y-4">
      {/* ─── Filter Bar ─────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl px-4 py-3">
        <div className="flex items-end gap-2 min-w-0 flex-wrap">
          {/* 1. Snapshot */}
          <SelectDropdown
            label="📷 Snapshot"
            value={String(filterSnapshotId ?? "")}
            onChange={v => { setFilterSnapshotId(Number(v)); setFilterPeriodes(new Set()); }}
            options={perfImports.length === 0 ? [{ value: "", label: "Belum ada data" }] : perfImports.map((imp: any) => ({ value: String(imp.id), label: formatSnapshotLabel(imp.createdAt) }))}
            disabled={!perfImports.length}
            className="flex-1 min-w-0"
          />

          {/* 2. Periode Bulan */}
          <CheckboxDropdown
            label="Periode Bulan"
            options={availablePeriodes}
            selected={filterPeriodes}
            onChange={setFilterPeriodes}
            labelFn={periodeLabel}
            headerLabel=""
            summaryLabel="Periode"
            className="flex-1 min-w-0"
          />

          {/* 3. Divisi */}
          <SelectDropdown
            label="Divisi"
            value={filterDivisi}
            onChange={v => { setFilterDivisi(v); setFilterNamaAms(new Set()); }}
            options={DIVISI_OPTIONS_WITH_ALL}
            className="flex-1 min-w-0"
          />

          {/* 4. Nama AM */}
          <CheckboxDropdown
            label="Nama AM"
            options={amNames}
            selected={filterNamaAms}
            onChange={setFilterNamaAms}
            placeholder="Semua AM"
            headerLabel="Pilih AM"
            summaryLabel="AM"
            className="flex-1 min-w-0"
          />

          {/* 5. Tipe Rank */}
          <SelectDropdown
            label="Tipe Rank"
            value={filterTipeRank}
            onChange={setFilterTipeRank}
            options={TIPE_RANK.map(t => ({ value: t, label: t }))}
            className="flex-1 min-w-0"
          />

          {/* 6. Tipe Revenue */}
          <SelectDropdown
            label="Tipe Revenue"
            value={filterTipeRevenue}
            onChange={setFilterTipeRevenue}
            options={TIPE_REVENUE.map(t => ({ value: t, label: t }))}
            className="flex-1 min-w-0"
          />

        </div>

        {/* Active filter chips — always visible */}
        <div className="flex items-center gap-2 flex-wrap pt-3 mt-3 border-t border-border/50">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide shrink-0">Filter aktif:</span>
            {/* Periode */}
            <span className={cn("inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border",
              isPeriodeFiltered ? "bg-primary/10 text-primary border-primary/20" : "bg-secondary text-muted-foreground border-border")}>
              Periode: {filterPeriodes.size === 0 || filterPeriodes.size === availablePeriodes.length
                ? `Semua (${availablePeriodes.length})`
                : filterPeriodes.size === 1 ? periodeLabel([...filterPeriodes][0]) : `${filterPeriodes.size} dari ${availablePeriodes.length}`}
              {isPeriodeFiltered && <button onClick={() => setFilterPeriodes(new Set(availablePeriodes))} className="hover:opacity-70"><X className="w-3 h-3" /></button>}
            </span>
            {/* Divisi */}
            <span className={cn("inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border",
              isDivisiFiltered ? "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border-blue-200 dark:border-blue-800" : "bg-secondary text-muted-foreground border-border")}>
              Divisi: {filterDivisi === "all" ? "Semua" : filterDivisi}
              {isDivisiFiltered && <button onClick={() => setFilterDivisi("all")} className="hover:opacity-70"><X className="w-3 h-3" /></button>}
            </span>
            {/* AM */}
            <span className={cn("inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border",
              isAmFiltered ? "bg-violet-100 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400 border-violet-200 dark:border-violet-800" : "bg-secondary text-muted-foreground border-border")}>
              AM: {filterNamaAms.size === 0 ? "Semua" : filterNamaAms.size === 1 ? [...filterNamaAms][0] : `${filterNamaAms.size} AM`}
              {isAmFiltered && <button onClick={() => setFilterNamaAms(new Set())} className="hover:opacity-70"><X className="w-3 h-3" /></button>}
            </span>
            {/* Rank */}
            <span className={cn("inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border",
              isRankFiltered ? "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200 dark:border-amber-800" : "bg-secondary text-muted-foreground border-border")}>
              Rank: {filterTipeRank}
              {isRankFiltered && <button onClick={() => setFilterTipeRank("Ach CM")} className="hover:opacity-70"><X className="w-3 h-3" /></button>}
            </span>
            {/* Revenue */}
            <span className={cn("inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border",
              isRevenueFiltered ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" : "bg-secondary text-muted-foreground border-border")}>
              Revenue: {filterTipeRevenue}
              {isRevenueFiltered && <button onClick={() => setFilterTipeRevenue("Reguler")} className="hover:opacity-70"><X className="w-3 h-3" /></button>}
            </span>
            {hasPerformaActiveFilter && <button onClick={resetPerformaFilters}
              className="ml-auto flex items-center gap-1 px-3 py-1 rounded-full border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors shrink-0">
              <X className="w-3 h-3" /> Reset filter
            </button>}
          </div>
      </div>

      {noDataAtAll ? (
        <div className="bg-card border border-border rounded-xl"><EmptyState /></div>
      ) : !hasData ? (
        <div className="bg-card border border-border rounded-xl"><EmptyState /></div>
      ) : (
        <>
          {/* ─── Trophy Section — Top #1 CM · Top #1 YTD · Distribusi ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Top #1 CM */}
            <TrophyCard
              colorScheme="gold"
              title="Top AM by Current Month"
              period={cmPeriode ? periodeLabel(cmPeriode) : "—"}
              am={topCm}
              value={topCm ? `${(topCm.cmAch * 100).toFixed(1).replace(".", ",")}%` : "–"}
              realValue={topCm ? formatRupiah(topCm.cmReal) : "–"}
              targetValue={topCm ? formatRupiah(topCm.cmTarget) : "–"}
            />

            {/* Top #1 YTD */}
            <TrophyCard
              colorScheme="blue"
              title="Top AM by Year to Date"
              period={filterPeriodes.size > 1 ? `${filterPeriodes.size} Periode` : cmPeriode ? periodeLabel(cmPeriode) : "—"}
              am={topYtd}
              value={topYtd ? `${(topYtd.ytdAch * 100).toFixed(1).replace(".", ",")}%` : "–"}
              realValue={topYtd ? formatRupiah(topYtd.ytdReal) : "–"}
              targetValue={topYtd ? formatRupiah(topYtd.ytdTarget) : "–"}
            />

            {/* Distribusi Donut */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Distribusi Pencapaian Target</h3>
              <div className="flex items-center gap-3">
                {/* Pie chart */}
                <div className="relative shrink-0" style={{ width: 110, height: 110 }}>
                  <ResponsiveContainer width={110} height={110}>
                    <PieChart>
                      <Pie data={distribusi} cx="50%" cy="50%" innerRadius={30} outerRadius={48} dataKey="value" labelLine={false}>
                        {distribusi.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)", fontSize: "11px" }} formatter={(v, n) => [`${v} AM`, n]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                      <p className="text-lg font-display font-black text-foreground">{amTableData.length}</p>
                      <p className="text-[9px] text-muted-foreground">AM</p>
                    </div>
                  </div>
                </div>
                {/* Legend — right side */}
                <div className="flex-1 space-y-2.5">
                  {distribusi.map(d => (
                    <div key={d.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                        <span className="text-muted-foreground text-[11px]">{d.name}</span>
                      </div>
                      <span className="font-bold tabular-nums text-[11px]">{d.value} AM</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ─── Table (full width) ──────────────────────── */}
          <div>
            {/* Table */}
            <div className="bg-card border border-border rounded-xl">
              <div ref={perfSectionHeaderRef} className="sticky top-0 z-20 bg-card/95 backdrop-blur-sm px-4 py-3 border-b border-border rounded-t-xl">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h3 className="text-sm font-display font-semibold text-foreground flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    AM Performance Report
                  </h3>
                  <div className="flex items-center gap-2 flex-1 justify-end">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Cari AM atau pelanggan..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="pl-7 pr-7 py-1.5 text-xs bg-background border border-border rounded-lg w-52 focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/60"
                      />
                      {searchQuery && (
                        <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <button
                      onClick={handleExpandAll}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-2.5 py-1.5 transition-colors whitespace-nowrap"
                    >
                      {expandAll ? <Minimize2 className="w-3 h-3" /> : <Expand className="w-3 h-3" />}
                      {expandAll ? "Collapse Semua" : "Expand Semua AM"}
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-3">
                <div className="border border-border rounded">
                {/* Sticky table header — synced horizontally with body */}
                <div ref={perfTableHeaderRef} onScroll={onPerfHeaderScroll}
                  className="overflow-x-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] sticky z-10"
                  style={{ top: `${perfSectionHeaderH}px` }}>
                  <table className="border-collapse" style={{ minWidth: "600px", width: "100%" }}>
                    <thead>
                      <tr className="bg-red-700 text-white font-black uppercase tracking-wide text-xs">
                        <th className="px-4 py-2.5 text-left w-6"></th>
                        <th className="px-4 py-2.5 text-left">Nama AM</th>
                        <th className={cn("px-4 py-2.5 text-right", filterTipeRank === "Real Revenue" && "underline underline-offset-2")}>Target {filterTipeRevenue}</th>
                        <th className={cn("px-4 py-2.5 text-right", filterTipeRank === "Real Revenue" && "underline underline-offset-2")}>Real {filterTipeRevenue}</th>
                        <th className={cn("px-3 py-2.5 text-right", filterTipeRank === "Ach CM" && "underline underline-offset-2")}>CM %</th>
                        <th className={cn("px-3 py-2.5 text-right", filterTipeRank === "Ach YTD" && "underline underline-offset-2")}>YTD %</th>
                        <th className="px-3 py-2.5 text-center">Customer</th>
                        <th className="px-3 py-2.5 text-center underline underline-offset-2">
                          {filterTipeRank === "Ach CM" ? "RANK CM" : filterTipeRank === "Ach YTD" ? "RANK YTD" : "RANK REV"}
                        </th>
                      </tr>
                    </thead>
                  </table>
                </div>
                {/* Scrollable body */}
                <div ref={perfTableBodyRef} onScroll={onPerfBodyScroll} className="overflow-x-auto">
                <table className="w-full text-left text-xs" style={{ minWidth: "600px" }}>
                  <thead className="sr-only" aria-hidden>
                    <tr>
                      <th className="w-6"></th><th>Nama AM</th><th>Target</th><th>Real</th><th>CM %</th><th>YTD %</th><th>Customer</th><th>Rank</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {filteredAmData.map(row => {
                      const isExpanded = effectiveExpandedRows.has(row.nik);
                      const customers = row.customers || [];
                      const hasCustomers = customers.length > 0;
                      const totalReal = customers.reduce((s: number, c: any) => s + (c.realTotal ?? 0), 0);
                      return (
                        <React.Fragment key={row.nik}>
                          <tr
                            className={cn("hover:bg-secondary/20 transition-colors", hasCustomers && "cursor-pointer")}
                            onClick={() => hasCustomers && toggleRow(row.nik)}
                          >
                            <td className="px-2 py-2.5 text-muted-foreground">
                              {hasCustomers ? (
                                isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />
                              ) : null}
                            </td>
                            <td className="px-4 py-2.5 font-medium text-foreground overflow-visible">
                              <div className="group relative flex items-center gap-1.5 w-fit">
                                <span>{row.namaAm}</span>
                                <span className="text-[10px] text-muted-foreground shrink-0">{row.divisi}</span>
                                {/* Hover tooltip */}
                                <div className="pointer-events-none absolute left-0 top-full mt-1.5 z-[200] w-56 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                                  <div className="bg-card border border-border rounded-xl shadow-xl px-3 py-2.5 text-xs">
                                    <p className="font-bold text-foreground mb-2 leading-snug">{row.namaAm}</p>
                                    <div className="space-y-1.5">
                                      <div className="flex justify-between gap-3">
                                        <span className="text-muted-foreground">Total Pelanggan</span>
                                        <span className="font-semibold text-foreground">{customers.length}</span>
                                      </div>
                                      <div className="flex justify-between gap-3">
                                        <span className="text-muted-foreground">Real Revenue</span>
                                        <span className="font-semibold text-foreground">{formatRupiah(row.cmReal)}</span>
                                      </div>
                                      <div className="flex justify-between gap-3">
                                        <span className="text-muted-foreground">Target Revenue</span>
                                        <span className="font-semibold text-foreground">{formatRupiah(row.cmTarget)}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right text-foreground tabular-nums">{formatRupiah(row.cmTarget)}</td>
                            <td className="px-4 py-2.5 text-right font-medium text-foreground tabular-nums">{formatRupiah(row.cmReal)}</td>
                            <td className={cn("px-3 py-2.5 text-right font-bold tabular-nums", row.cmAch >= 1 ? "text-green-600" : row.cmAch >= 0.8 ? "text-orange-500" : "text-red-600")}>
                              {(row.cmAch * 100).toFixed(1).replace(".", ",")}%
                            </td>
                            <td className={cn("px-3 py-2.5 text-right font-bold tabular-nums", row.ytdAch >= 1 ? "text-green-600" : row.ytdAch >= 0.8 ? "text-blue-600" : "text-red-600")}>
                              {(row.ytdAch * 100).toFixed(1).replace(".", ",")}%
                            </td>
                            <td className="px-3 py-2.5 text-center text-muted-foreground font-semibold">{customers.length}</td>
                            <td className="px-3 py-2.5 text-center font-bold text-foreground">{row.displayRank}</td>
                          </tr>
                          {isExpanded && hasCustomers && (
                            <tr className="bg-rose-50/40 dark:bg-rose-950/10">
                              <td colSpan={8} className="px-0 pb-3 pt-0">
                                <div className="mx-4 mt-2 mb-1 border-2 border-rose-200 dark:border-rose-800/50 rounded-xl overflow-hidden shadow-sm">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="bg-rose-50 dark:bg-rose-950/30">
                                        <th className="px-3 py-1.5 text-left text-xs font-black text-rose-800 dark:text-rose-300 uppercase tracking-wide">Pelanggan / NIP</th>
                                        <th className="px-3 py-1.5 text-right text-xs font-black text-rose-800 dark:text-rose-300 uppercase tracking-wide">Proporsi</th>
                                        <th className="px-3 py-1.5 text-right text-xs font-black text-rose-800 dark:text-rose-300 uppercase tracking-wide">Target</th>
                                        <th className="px-3 py-1.5 text-right text-xs font-black text-rose-800 dark:text-rose-300 uppercase tracking-wide">Real</th>
                                        <th className="px-3 py-1.5 text-right text-xs font-black text-rose-800 dark:text-rose-300 uppercase tracking-wide">Ach %</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/40">
                                      {customers.map((c: any, ci: number) => {
                                        const cReal = c.realTotal ?? 0;
                                        const cTarget = c.targetTotal ?? 0;
                                        const prop = totalReal > 0 ? (cReal / totalReal) * 100 : (c.proporsi != null ? c.proporsi * 100 : 0);
                                        const cAch = cTarget > 0 ? cReal / cTarget * 100 : 0;
                                        return (
                                          <tr key={ci} className={cn("transition-colors", ci % 2 === 0 ? "bg-white dark:bg-card" : "bg-rose-50/60 dark:bg-rose-950/20", "hover:bg-rose-100/60 dark:hover:bg-rose-900/20")}>
                                            <td className="px-3 py-1.5 font-medium text-foreground">
                                              <div>{c.pelanggan || "—"}</div>
                                              {c.nip && <div className="text-[10px] text-muted-foreground">{c.nip}</div>}
                                            </td>
                                            <td className="px-3 py-1.5 text-right tabular-nums">
                                              <div className="flex items-center justify-end gap-1.5">
                                                <div className="w-12 h-1.5 bg-secondary rounded-full overflow-hidden">
                                                  <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(prop, 100)}%` }} />
                                                </div>
                                                <span className="text-foreground font-medium">{prop.toFixed(1)}%</span>
                                              </div>
                                            </td>
                                            <td className="px-3 py-1.5 text-right tabular-nums text-foreground">{formatRupiah(cTarget)}</td>
                                            <td className="px-3 py-1.5 text-right tabular-nums font-medium text-foreground">{formatRupiah(cReal)}</td>
                                            <td className="px-3 py-1.5 text-right tabular-nums text-xs">
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
                  <tfoot>
                    <tr className="bg-secondary/60 border-t-2 border-border">
                      <td className="px-2 py-3" />
                      <td className="px-4 py-3 font-bold text-sm text-foreground">Total ({amTableData.length} AM)</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground font-semibold text-sm">{formatRupiah(totals.cmTarget)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-foreground font-bold text-sm">{formatRupiah(totals.cmReal)}</td>
                      <td className={cn("px-3 py-2.5 text-right tabular-nums", totals.cmAch >= 100 ? "text-green-600" : totals.cmAch >= 80 ? "text-orange-500" : "text-red-600")}>
                        <div className="font-black text-sm">{totals.cmAch.toFixed(1).replace(".", ",")}%</div>
                        <div className="text-[10px] font-semibold mt-0.5">{totals.cmAch >= 100 ? "Melebihi Target" : totals.cmAch >= 80 ? "Mendekati" : "Di Bawah Target"}</div>
                      </td>
                      <td className={cn("px-3 py-2.5 text-right tabular-nums", totals.ytdAch >= 100 ? "text-green-600" : totals.ytdAch >= 80 ? "text-blue-600" : "text-red-500")}>
                        <div className="font-black text-sm">{totals.ytdAch.toFixed(1).replace(".", ",")}%</div>
                        <div className="text-[10px] font-semibold mt-0.5">{totals.ytdAch >= 100 ? "Melebihi Target" : totals.ytdAch >= 80 ? "Mendekati" : "Di Bawah Target"}</div>
                      </td>
                      <td className="px-3 py-2.5 text-center tabular-nums text-foreground font-semibold text-sm">
                        {filteredAmData.reduce((s, r) => s + (r.customers || []).length, 0)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              </div>
              </div>
            </div>

          </div>

          {/* ─── Funnel Section ───────────────────────────── */}
          <FunnelSectionCard />

          {/* ─── Trend Chart ─────────────────────────────── */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-display font-semibold text-foreground mb-4">
              Tren Performa Revenue Bulanan {cmYear ?? ""}
              {filterDivisi !== "all" && <span className="ml-2 text-xs text-muted-foreground font-normal">· {divisiFilterLabel(filterDivisi)}</span>}
            </h3>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={trendData} margin={{ top: 5, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 10 }}
                  tickFormatter={v => v >= 1e9 ? `Rp${(v/1e9).toFixed(0)}M` : v >= 1e6 ? `Rp${(v/1e6).toFixed(0)}Jt` : "0"}
                />
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} domain={[0, 200]} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                <Bar yAxisId="left" dataKey="real" name="Real Revenue" fill="#22c55e" radius={[3,3,0,0]} maxBarSize={36} />
                <Bar yAxisId="left" dataKey="target" name="Target Revenue" fill="#3b82f6" radius={[3,3,0,0]} maxBarSize={36} />
                <Line yAxisId="right" type="monotone" dataKey="ach" name="Ach Rate %" stroke="#CC0000" strokeWidth={2.5} dot={{ fill: "#CC0000", r: 3.5 }} activeDot={{ r: 6 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

    </div>
  );
}

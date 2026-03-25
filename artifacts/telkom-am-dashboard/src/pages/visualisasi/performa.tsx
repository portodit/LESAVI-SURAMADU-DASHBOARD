import React, { useMemo, useState, useCallback, useRef, useEffect as useEffectRef } from "react";
import { useListPerformance, useListImportHistory } from "@workspace/api-client-react";
import { formatRupiah, formatPercent, getStatusColor, getAchPct, cn } from "@/lib/utils";
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  Line, ComposedChart, Legend, PieChart, Pie
} from "recharts";
import {
  Trophy, Database, AlertCircle, TrendingUp, Medal, ChevronDown,
  ChevronRight, Camera, ChevronUp, Star, Expand, Minimize2, Check, X, Copy
} from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

const MONTHS_LABEL = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const TIPE_RANK = ["Ach MTD","Ach YTD","Real Revenue"];
const TIPE_REVENUE = ["Semua","Reguler","Sustain","Scaling","NGTMA"];

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
  return (
    <div className="bg-card border border-border rounded-xl shadow-lg px-4 py-3 text-xs">
      <p className="font-semibold mb-2 text-foreground">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="mb-1">
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
// New schema: [{pelanggan, nip, proporsi, Reguler:{target,real}, Sustain:{target,real}, Scaling:{target,real}, NGTMA:{target,real}, targetTotal, realTotal}]
function parseKomponen(raw: string | null | undefined): any[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
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
function TrophyCard({ title, subtitle, am, value, valueLabel, colorScheme }: {
  title: string; subtitle: string; am: any; value: string; valueLabel: string;
  colorScheme: 'gold' | 'blue';
}) {
  const scheme = colorScheme === 'gold'
    ? { icon: "🥇", bg: "from-amber-50 via-yellow-50 to-orange-50 dark:from-amber-950/30 dark:via-yellow-950/20 dark:to-orange-950/30", border: "border-amber-300 dark:border-amber-700", accent: "text-amber-700 dark:text-amber-400", valueClr: "text-amber-600 dark:text-amber-400" }
    : { icon: "🏅", bg: "from-blue-50 via-indigo-50 to-sky-50 dark:from-blue-950/30 dark:via-indigo-950/20 dark:to-sky-950/30", border: "border-blue-300 dark:border-blue-700", accent: "text-blue-700 dark:text-blue-400", valueClr: "text-blue-600 dark:text-blue-400" };
  if (!am) return (
    <div className={`rounded-xl bg-gradient-to-br ${scheme.bg} border ${scheme.border} p-5 min-h-[120px] flex flex-col justify-center`}>
      <p className={cn("text-[10px] font-bold uppercase tracking-widest mb-1", scheme.accent)}>{title}</p>
      <p className="text-muted-foreground/50 text-sm">Belum ada data</p>
    </div>
  );
  return (
    <div className={`rounded-xl bg-gradient-to-br ${scheme.bg} border ${scheme.border} p-5 min-w-0`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className={cn("text-[10px] font-bold uppercase tracking-widest", scheme.accent)}>{title}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <span className="text-3xl leading-none">{scheme.icon}</span>
      </div>
      <p className="font-display font-extrabold text-base text-foreground truncate mb-3" title={am.namaAm}>{am.namaAm}</p>
      <p className={cn("text-4xl font-display font-black tabular-nums leading-none", scheme.valueClr)}>{value}</p>
      <p className="text-xs text-muted-foreground mt-2">{valueLabel}</p>
    </div>
  );
}

// ─── CheckboxDropdown ──────────────────────────────────────────────────────────
function CheckboxDropdown({ label, options, selected, onChange, placeholder, labelFn, headerLabel, summaryLabel }: {
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  placeholder?: string;
  labelFn?: (value: string) => string;
  headerLabel?: string;
  summaryLabel?: string;
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
    <div className="flex flex-col gap-1 relative" ref={ref}>
      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={options.length === 0}
        className={cn(
          "h-8 px-2.5 pr-2 bg-secondary/50 border border-border rounded-lg text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-40 flex items-center gap-1.5 min-w-[140px] text-left",
          open && "border-primary/50 ring-2 ring-primary/20"
        )}
      >
        <span className="flex-1 truncate text-foreground">{displayText}</span>
        <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-xl shadow-xl min-w-[200px] max-w-[260px] overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-secondary/30">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{headerLabel ?? `Pilih ${unit}`}</span>
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

// Helper: format "2026-01" → "Jan 2026"
function periodeLabel(p: string): string {
  const [year, month] = p.split("-");
  return `${MONTHS_LABEL[parseInt(month, 10) - 1]} ${year}`;
}

export default function PerformaVis() {
  // Filter state
  const [filterSnapshotId, setFilterSnapshotId] = useState<number | null>(null);
  const [showEmbedModal, setShowEmbedModal] = useState(false);
  const [filterPeriodes, setFilterPeriodes] = useState<Set<string>>(new Set()); // "YYYY-MM"
  const [filterDivisi, setFilterDivisi] = useState("All");
  const [filterNamaAms, setFilterNamaAms] = useState<Set<string>>(new Set());
  const [filterTipeRank, setFilterTipeRank] = useState("Ach MTD");
  const [filterTipeRevenue, setFilterTipeRevenue] = useState("Semua");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandAll, setExpandAll] = useState(false);

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

  // Available periods "YYYY-MM" sorted newest first
  const availablePeriodes = useMemo(() => {
    if (!allPerfs?.length) return [];
    let rows = allPerfs as any[];
    if (filterSnapshotId) rows = rows.filter(p => p.importId === filterSnapshotId);
    return [...new Set(rows.map(p => `${p.tahun}-${String(p.bulan).padStart(2, "0")}`))]
      .sort().reverse();
  }, [allPerfs, filterSnapshotId]);

  // Auto-select most recent period when data loads / snapshot changes
  React.useEffect(() => {
    if (availablePeriodes.length === 0) { setFilterPeriodes(new Set()); return; }
    setFilterPeriodes(prev => {
      const valid = new Set(availablePeriodes);
      const filtered = new Set([...prev].filter(p => valid.has(p)));
      if (filtered.size > 0) return filtered;
      return new Set([availablePeriodes[0]]); // auto-select latest
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
      function getTyped(row: any, tipe: string): { target: number; real: number } {
        if (tipe === "Semua") return { target: row.targetRevenue, real: row.realRevenue };
        if (row.targetReguler != null && tipe === "Reguler") return { target: row.targetReguler ?? 0, real: row.realReguler ?? 0 };
        if (row.targetSustain != null && tipe === "Sustain") return { target: row.targetSustain ?? 0, real: row.realSustain ?? 0 };
        if (row.targetScaling != null && tipe === "Scaling") return { target: row.targetScaling ?? 0, real: row.realScaling ?? 0 };
        if (row.targetNgtma != null && tipe === "NGTMA") return { target: row.targetNgtma ?? 0, real: row.realNgtma ?? 0 };
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

    // Apply divisi + namaAm filters
    if (filterDivisi !== "All") result = result.filter(r => r.divisi === filterDivisi);
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

  // Trend chart (for CM year)
  const trendData = useMemo(() => {
    if (!allPerfs?.length || !cmYear) return [];
    return MONTHS_LABEL.map((month, idx) => {
      const mNum = idx + 1;
      let rows = (allPerfs as any[]).filter(p =>
        String(p.tahun) === cmYear && p.bulan === mNum &&
        (filterSnapshotId === null || p.importId === filterSnapshotId) &&
        (filterDivisi === "All" || p.divisi === filterDivisi)
      );
      const target = rows.reduce((s, p) => s + p.targetRevenue, 0);
      const real = rows.reduce((s, p) => s + p.realRevenue, 0);
      const ach = target > 0 ? (real / target) * 100 : 0;
      return { month, target, real, ach: parseFloat(ach.toFixed(1)), hasData: rows.length > 0 };
    });
  }, [allPerfs, cmYear, filterSnapshotId, filterDivisi]);

  // Divisi options from data (based on CM period)
  const divisiOptions = useMemo(() => {
    if (!allPerfs?.length || !cmPeriode) return [];
    const [y, m] = cmPeriode.split("-").map(Number);
    return [...new Set(
      (allPerfs as any[])
        .filter(p => p.tahun === y && p.bulan === m)
        .map(p => p.divisi).filter(Boolean)
    )].sort() as string[];
  }, [allPerfs, cmPeriode]);

  // AM names based on current filters
  const amNames = useMemo(() => {
    if (!allPerfs?.length || !cmPeriode) return [];
    const [y, m] = cmPeriode.split("-").map(Number);
    return [...new Set(
      (allPerfs as any[])
        .filter(p =>
          p.tahun === y && p.bulan === m &&
          (filterDivisi === "All" || p.divisi === filterDivisi)
        ).map(p => p.namaAm)
    )].sort() as string[];
  }, [allPerfs, cmPeriode, filterDivisi]);

  React.useEffect(() => { if (filterDivisi !== "All" && !divisiOptions.includes(filterDivisi)) setFilterDivisi("All"); }, [divisiOptions]);
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

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-16 bg-secondary/50 rounded-xl animate-pulse" />
        <div className="grid grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-28 bg-secondary/50 rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  const hasData = amTableData.length > 0;
  const noDataAtAll = !allPerfs?.length;

  return (
    <div className="space-y-4">
      {/* ─── Filter Bar ─────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl px-4 py-3">
        <div className="flex items-end gap-2.5 flex-wrap">
          {/* 1. Snapshot */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Camera className="w-3 h-3" /> Snapshot
            </label>
            <select
              value={filterSnapshotId ?? ""}
              disabled={!perfImports.length}
              onChange={e => { setFilterSnapshotId(Number(e.target.value)); setFilterPeriodes(new Set()); }}
              className="h-8 px-2.5 bg-secondary/50 border border-border rounded-lg text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-40 min-w-[110px]"
            >
              {perfImports.length === 0 && <option value="">Belum ada data</option>}
              {perfImports.map((imp: any) => (
                <option key={imp.id} value={imp.id}>{formatSnapshotLabel(imp.createdAt)}</option>
              ))}
            </select>
          </div>

          {/* 2. Periode Bulan — checkbox dropdown (YYYY-MM) */}
          <CheckboxDropdown
            label="Periode Bulan"
            options={availablePeriodes}
            selected={filterPeriodes}
            onChange={setFilterPeriodes}
            placeholder="Pilih Periode"
            labelFn={periodeLabel}
            headerLabel="Pilih Periode"
            summaryLabel="Periode"
          />

          {/* 3. Divisi */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Divisi</label>
            <select
              value={filterDivisi}
              onChange={e => { setFilterDivisi(e.target.value); setFilterNamaAms(new Set()); }}
              disabled={!divisiOptions.length}
              className="h-8 px-2.5 bg-secondary/50 border border-border rounded-lg text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-40 min-w-[100px]"
            >
              <option value="All">Semua Divisi</option>
              {divisiOptions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {/* 4. Nama AM */}
          <CheckboxDropdown
            label="Nama AM"
            options={amNames}
            selected={filterNamaAms}
            onChange={setFilterNamaAms}
            placeholder="Semua AM"
            headerLabel="Pilih AM"
            summaryLabel="AM"
          />

          {/* 5. Tipe Rank */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Tipe Rank</label>
            <select
              value={filterTipeRank}
              onChange={e => setFilterTipeRank(e.target.value)}
              className="h-8 px-2.5 bg-secondary/50 border border-border rounded-lg text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary min-w-[100px]"
            >
              {TIPE_RANK.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* 6. Tipe Revenue */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Tipe Revenue</label>
            <select
              value={filterTipeRevenue}
              onChange={e => setFilterTipeRevenue(e.target.value)}
              className="h-8 px-2.5 bg-secondary/50 border border-border rounded-lg text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary min-w-[90px]"
            >
              {TIPE_REVENUE.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Embed button */}
          <div className="flex flex-col gap-1 ml-auto">
            <label className="text-[10px] font-semibold text-transparent uppercase tracking-wide">Embed</label>
            <button
              onClick={() => setShowEmbedModal(true)}
              className="h-8 px-3 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Star className="w-3 h-3" /> Embed Code
            </button>
          </div>
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
              title={`#1 Best CM · ${cmPeriode ? periodeLabel(cmPeriode) : "—"}`}
              subtitle={topCm ? `Divisi ${topCm.divisi}` : ""}
              am={topCm}
              value={topCm ? formatPercent(topCm.cmAch) : "–"}
              valueLabel={topCm ? `Real: ${formatRupiah(topCm.cmReal)}  ·  Target: ${formatRupiah(topCm.cmTarget)}` : "Belum ada data"}
            />

            {/* Top #1 YTD */}
            <TrophyCard
              colorScheme="blue"
              title={`#1 Best YTD · ${filterPeriodes.size > 1 ? `${filterPeriodes.size} Periode` : cmPeriode ? periodeLabel(cmPeriode) : "—"}`}
              subtitle={topYtd ? `Divisi ${topYtd.divisi}` : ""}
              am={topYtd}
              value={topYtd ? formatPercent(topYtd.ytdAch) : "–"}
              valueLabel={topYtd ? `YTD Real: ${formatRupiah(topYtd.ytdReal)}  ·  Target: ${formatRupiah(topYtd.ytdTarget)}` : "Belum ada data"}
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
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center justify-between">
                <h3 className="text-sm font-display font-semibold text-foreground flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  AM Performance Report
                </h3>
                <button
                  onClick={handleExpandAll}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-2.5 py-1.5 transition-colors"
                >
                  {expandAll ? <Minimize2 className="w-3 h-3" /> : <Expand className="w-3 h-3" />}
                  {expandAll ? "Collapse Semua" : "Expand Semua AM"}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-secondary/40 text-muted-foreground font-semibold uppercase tracking-wide text-[10px]">
                      <th className="px-4 py-2.5 w-6"></th>
                      <th className="px-4 py-2.5">Nama AM</th>
                      <th className="px-3 py-2.5 text-center">Rank</th>
                      <th className="px-4 py-2.5 text-right">Target CM</th>
                      <th className="px-4 py-2.5 text-right">Real CM</th>
                      <th className="px-3 py-2.5 text-right">CM %</th>
                      <th className="px-3 py-2.5 text-right">YTD %</th>
                      <th className="px-3 py-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {amTableData.map(row => {
                      const isExpanded = expandedRows.has(row.nik);
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
                            <td className="px-4 py-2.5 font-medium text-foreground">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate max-w-[140px]" title={row.namaAm}>{row.namaAm}</span>
                                <span className="text-[10px] text-muted-foreground shrink-0">{row.divisi}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-center font-bold text-muted-foreground">{row.displayRank}</td>
                            <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">{formatRupiah(row.cmTarget)}</td>
                            <td className="px-4 py-2.5 text-right font-medium text-foreground tabular-nums">{formatRupiah(row.cmReal)}</td>
                            <td className={cn("px-3 py-2.5 text-right font-bold tabular-nums", row.cmAch >= 1 ? "text-green-600" : row.cmAch >= 0.8 ? "text-orange-500" : "text-red-600")}>
                              {(row.cmAch * 100).toFixed(1).replace(".", ",")}%
                            </td>
                            <td className={cn("px-3 py-2.5 text-right font-bold tabular-nums", row.ytdAch >= 1 ? "text-green-600" : row.ytdAch >= 0.8 ? "text-blue-600" : "text-muted-foreground")}>
                              {(row.ytdAch * 100).toFixed(1).replace(".", ",")}%
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold border", getStatusColor(row.statusWarna))}>
                                {row.statusWarna.toUpperCase()}
                              </span>
                            </td>
                          </tr>
                          {isExpanded && hasCustomers && (
                            <tr className="bg-secondary/10">
                              <td colSpan={8} className="px-0 py-0">
                                <div className="mx-4 mb-2 mt-0.5 border border-border/60 rounded-lg overflow-hidden">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="bg-secondary/60 text-muted-foreground">
                                        <th className="px-3 py-1.5 text-left font-medium">Pelanggan / NIP</th>
                                        <th className="px-3 py-1.5 text-right font-medium">Target</th>
                                        <th className="px-3 py-1.5 text-right font-medium">Real</th>
                                        <th className="px-3 py-1.5 text-right font-medium">Ach %</th>
                                        <th className="px-3 py-1.5 text-right font-medium">Proporsi</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/40">
                                      {customers.map((c: any, ci: number) => {
                                        const cReal = c.realTotal ?? 0;
                                        const cTarget = c.targetTotal ?? 0;
                                        const prop = totalReal > 0 ? (cReal / totalReal * 100) : 0;
                                        const cAch = cTarget > 0 ? cReal / cTarget * 100 : 0;
                                        return (
                                          <tr key={ci} className="hover:bg-secondary/30">
                                            <td className="px-3 py-1.5 font-medium text-foreground" title={c.pelanggan}>
                                              <div className="truncate max-w-[180px]">{c.pelanggan || "—"}</div>
                                              {c.nip && <div className="text-[10px] text-muted-foreground">{c.nip}</div>}
                                            </td>
                                            <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{formatRupiah(cTarget)}</td>
                                            <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatRupiah(cReal)}</td>
                                            <td className="px-3 py-1.5 text-right tabular-nums text-xs">
                                              <span className={cn("font-semibold", cAch >= 100 ? "text-green-600" : cAch >= 80 ? "text-orange-500" : "text-red-500")}>
                                                {cAch.toFixed(1)}%
                                              </span>
                                            </td>
                                            <td className="px-3 py-1.5 text-right tabular-nums">
                                              <div className="flex items-center justify-end gap-1.5">
                                                <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                                                  <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(prop, 100)}%` }} />
                                                </div>
                                                <span className="text-muted-foreground">{prop.toFixed(1)}%</span>
                                              </div>
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
                    <tr className="bg-secondary/50 font-bold text-xs border-t-2 border-border">
                      <td className="px-2 py-2.5" />
                      <td className="px-4 py-2.5 text-foreground" colSpan={2}>Total ({amTableData.length} AM)</td>
                      <td className={cn("px-3 py-2.5 text-right tabular-nums", totals.cmAch >= 100 ? "text-green-600" : totals.cmAch >= 80 ? "text-orange-500" : "text-red-600")}>
                        {totals.cmAch.toFixed(1).replace(".", ",")}%
                      </td>
                      <td className={cn("px-3 py-2.5 text-right tabular-nums", totals.ytdAch >= 100 ? "text-green-600" : "text-blue-600")}>
                        {totals.ytdAch.toFixed(1).replace(".", ",")}%
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{formatRupiah(totals.cmTarget)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{formatRupiah(totals.cmReal)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Summary Revenue — inline row below table */}
            <div className="mt-2 grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: "CM Real", value: formatRupiah(totals.cmReal), color: "text-foreground", bold: true },
                { label: "CM Target", value: formatRupiah(totals.cmTarget), color: "text-muted-foreground", bold: false },
                { label: `CM Ach (${totals.cmAch.toFixed(1)}%)`, value: totals.cmAch >= 100 ? "✓ Tercapai" : totals.cmAch >= 80 ? "Mendekati" : "Di Bawah Target",
                  color: totals.cmAch >= 100 ? "text-green-600" : totals.cmAch >= 80 ? "text-orange-500" : "text-red-600", bold: true },
                { label: `YTD Ach (${totals.ytdAch.toFixed(1)}%)`, value: formatRupiah(totals.ytdReal),
                  color: totals.ytdAch >= 100 ? "text-green-600" : totals.ytdAch >= 80 ? "text-blue-600" : "text-muted-foreground", bold: true },
              ].map(item => (
                <div key={item.label} className="bg-card border border-border rounded-xl px-4 py-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{item.label}</p>
                  <p className={cn("text-sm tabular-nums", item.bold ? "font-bold" : "font-normal", item.color)}>{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ─── Trend Chart ─────────────────────────────── */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-display font-semibold text-foreground mb-4">
              Tren Performa Revenue Bulanan {cmYear ?? ""}
              {filterDivisi !== "All" && <span className="ml-2 text-xs text-muted-foreground font-normal">· {filterDivisi}</span>}
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

      {/* ─── Embed Code Modal ─────────────────────────────── */}
      {showEmbedModal && (
        <EmbedModal onClose={() => setShowEmbedModal(false)} />
      )}
    </div>
  );
}

// ─── Embed Modal ───────────────────────────────────────────────────────────────
function EmbedModal({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = React.useState(false);
  const baseUrl = typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.host}`
    : "";
  const basePath = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const embedUrl = `${baseUrl}${basePath}/embed/performa`;
  const iframeCode = `<iframe\n  src="${embedUrl}"\n  width="100%"\n  height="700"\n  frameborder="0"\n  allowfullscreen\n  style="border:none; border-radius:12px;"\n></iframe>`;

  function handleCopy() {
    navigator.clipboard.writeText(iframeCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">Embed ke Canva / Website</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
          Salin kode HTML di bawah ini dan tempel ke <strong>Canva</strong> melalui fitur <em>Embed → Custom Embed Code</em>, atau di website manapun.
          Halaman embed <strong>tidak memerlukan login</strong>.
        </p>
        <div className="bg-secondary/60 rounded-xl p-3 font-mono text-[11px] leading-relaxed text-foreground whitespace-pre-wrap break-all mb-3 max-h-40 overflow-y-auto border border-border">
          {iframeCode}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
          >
            {copied ? <><Check className="w-3.5 h-3.5" /> Disalin!</> : <><Copy className="w-3.5 h-3.5" /> Salin Kode</>}
          </button>
          <a
            href={embedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="h-9 px-4 rounded-lg bg-secondary border border-border text-xs font-semibold flex items-center gap-1.5 hover:bg-secondary/80 transition-colors text-foreground"
          >
            Buka Preview
          </a>
        </div>
      </div>
    </div>
  );
}

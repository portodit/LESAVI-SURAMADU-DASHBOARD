import React, { useMemo, useState, useCallback, useRef, useEffect as useEffectRef } from "react";
import { useListPerformance, useListImportHistory } from "@workspace/api-client-react";
import { formatRupiah, formatPercent, getStatusColor, getAchPct, cn } from "@/lib/utils";
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  Line, ComposedChart, Legend, PieChart, Pie
} from "recharts";
import {
  Trophy, Database, AlertCircle, TrendingUp, Medal, ChevronDown,
  ChevronRight, Camera, ChevronUp, Star, Expand, Minimize2, Check, X
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

function formatSnapshotLabel(createdAt: string, type: string): string {
  const date = format(new Date(createdAt), "d MMMM yyyy", { locale: idLocale });
  if (type === "performance") return `SNAPSHOT PERFORMANSI AM WITEL SURAMADU (${date.toUpperCase()})`;
  if (type === "funnel") return `SNAPSHOT SALES FUNNEL WITEL SURAMADU (${date.toUpperCase()})`;
  return `SNAPSHOT SALES ACTIVITY WITEL SURAMADU (${date.toUpperCase()})`;
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
function TrophyCard({ rank, title, subtitle, am, value, valueLabel, valueColor, badge }: {
  rank: 1 | 2 | 3; title: string; subtitle: string; am: any; value: string; valueLabel: string; valueColor: string; badge?: string;
}) {
  const medals = { 1: { icon: "🥇", bg: "from-yellow-50 to-amber-50", border: "border-yellow-300", accent: "text-yellow-700" }, 2: { icon: "🥈", bg: "from-slate-50 to-gray-100", border: "border-slate-300", accent: "text-slate-600" }, 3: { icon: "🥉", bg: "from-orange-50 to-amber-50", border: "border-orange-200", accent: "text-orange-600" } };
  const m = medals[rank];
  if (!am) return <div className={`rounded-xl bg-gradient-to-br ${m.bg} border ${m.border} p-4 flex-1`}><p className="text-xs text-muted-foreground">{title}</p><p className="text-muted-foreground/50 text-sm mt-3">–</p></div>;
  return (
    <div className={`rounded-xl bg-gradient-to-br ${m.bg} border ${m.border} p-4 flex-1 min-w-0`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className={cn("text-[10px] font-bold uppercase tracking-widest", m.accent)}>{title}</p>
          <p className="text-[10px] text-muted-foreground">{subtitle}</p>
        </div>
        <span className="text-2xl leading-none">{m.icon}</span>
      </div>
      <p className="font-display font-extrabold text-sm text-foreground truncate" title={am.namaAm}>{am.namaAm}</p>
      <p className="text-xs text-muted-foreground mb-2">{am.divisi}</p>
      <p className={cn("text-2xl font-display font-black tabular-nums", valueColor)}>{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{valueLabel}</p>
      {badge && <span className="inline-block mt-1.5 text-[9px] font-bold uppercase tracking-wide bg-white/70 px-2 py-0.5 rounded-full border border-current/20">{badge}</span>}
    </div>
  );
}

// ─── CheckboxDropdown ──────────────────────────────────────────────────────────
function CheckboxDropdown({ label, options, selected, onChange, placeholder }: {
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  const displayText = selected.size === 0
    ? (placeholder ?? "Semua")
    : selected.size === options.length
      ? "Semua AM"
      : selected.size === 1
        ? [...selected][0]
        : `${selected.size} AM dipilih`;

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
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Pilih AM</span>
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
                  <span className="truncate" onClick={() => toggleItem(opt)}>{opt}</span>
                </label>
              );
            })}
          </div>
          {selected.size > 0 && (
            <div className="px-3 py-2 border-t border-border bg-secondary/30">
              <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                {[...selected].map(s => (
                  <span key={s} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-[10px] font-medium px-2 py-0.5 rounded-full">
                    <span className="truncate max-w-[80px]">{s}</span>
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

export default function PerformaVis() {
  // Filter state
  const [filterSnapshotId, setFilterSnapshotId] = useState<number | null>(null);
  const [filterYear, setFilterYear] = useState<string>("");
  const [filterMonths, setFilterMonths] = useState<Set<number>>(new Set());
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

  // Available years from all data
  const availableYears = useMemo(() => {
    if (!allPerfs?.length) return [];
    return [...new Set((allPerfs as any[]).map(p => String(p.tahun)))].sort().reverse();
  }, [allPerfs]);

  // Auto-select year when data loads
  React.useEffect(() => {
    if (availableYears.length > 0 && (!filterYear || !availableYears.includes(filterYear))) {
      setFilterYear(availableYears[0]);
    }
  }, [availableYears]);

  // Available months WITH data for selected year (and optionally snapshot)
  const availableMonths = useMemo((): number[] => {
    if (!allPerfs?.length || !filterYear) return [];
    let rows = (allPerfs as any[]).filter(p => String(p.tahun) === filterYear);
    if (filterSnapshotId) rows = rows.filter(p => p.importId === filterSnapshotId);
    const set = new Set(rows.map(p => p.bulan as number));
    return [...set].sort((a, b) => a - b);
  }, [allPerfs, filterYear, filterSnapshotId]);

  // Auto-select months when year/snapshot changes
  React.useEffect(() => {
    if (!availableMonths.length) { setFilterMonths(new Set()); return; }
    // Select only months that still exist
    setFilterMonths(prev => {
      const next = new Set([...prev].filter(m => availableMonths.includes(m)));
      if (next.size === 0) return new Set([Math.max(...availableMonths)]);
      return next;
    });
  }, [availableMonths]);

  // CM month = last (max) selected month
  const cmMonth = useMemo(() => filterMonths.size > 0 ? Math.max(...filterMonths) : null, [filterMonths]);

  // For each AM, build CM row and YTD aggregation
  const amTableData = useMemo(() => {
    if (!allPerfs?.length || !filterYear || !cmMonth) return [];

    const allRows = (allPerfs as any[]).filter(p =>
      String(p.tahun) === filterYear &&
      filterMonths.has(p.bulan) &&
      (filterSnapshotId === null || p.importId === filterSnapshotId)
    );

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

      // Filter by tipeRevenue using new komponenDetail schema
      const cmCustomers = parseKomponen(cmRow.komponenDetail);
      const cmSums = sumKomponen(cmCustomers, filterTipeRevenue);
      let effectiveCmTarget = filterTipeRevenue === "Semua" ? cmRow.targetRevenue : cmSums.target;
      let effectiveCmReal = filterTipeRevenue === "Semua" ? cmRow.realRevenue : cmSums.real;

      // For YTD, recalculate per-row
      let effectiveYtdTarget = entry.ytdTarget;
      let effectiveYtdReal = entry.ytdReal;
      if (filterTipeRevenue !== "Semua") {
        effectiveYtdTarget = 0;
        effectiveYtdReal = 0;
        for (const row of filteredRows.filter(r => r.nik === nik)) {
          const sums = sumKomponen(parseKomponen(row.komponenDetail), filterTipeRevenue);
          effectiveYtdTarget += sums.target;
          effectiveYtdReal += sums.real;
        }
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
  }, [allPerfs, filterYear, filterMonths, cmMonth, filterSnapshotId, filterDivisi, filterNamaAms, filterTipeRank, filterTipeRevenue]);

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

  // Trend chart (for selected year)
  const trendData = useMemo(() => {
    if (!allPerfs?.length || !filterYear) return [];
    return MONTHS_LABEL.map((month, idx) => {
      const mNum = idx + 1;
      let rows = (allPerfs as any[]).filter(p =>
        String(p.tahun) === filterYear && p.bulan === mNum &&
        (filterSnapshotId === null || p.importId === filterSnapshotId) &&
        (filterDivisi === "All" || p.divisi === filterDivisi)
      );
      const target = rows.reduce((s, p) => s + p.targetRevenue, 0);
      const real = rows.reduce((s, p) => s + p.realRevenue, 0);
      const ach = target > 0 ? (real / target) * 100 : 0;
      return { month, target, real, ach: parseFloat(ach.toFixed(1)), hasData: rows.length > 0 };
    });
  }, [allPerfs, filterYear, filterSnapshotId, filterDivisi]);

  // Divisi options from data
  const divisiOptions = useMemo(() => {
    if (!allPerfs?.length || !filterYear || !cmMonth) return [];
    return [...new Set(
      (allPerfs as any[])
        .filter(p => String(p.tahun) === filterYear && p.bulan === cmMonth)
        .map(p => p.divisi).filter(Boolean)
    )].sort() as string[];
  }, [allPerfs, filterYear, cmMonth]);

  // AM names based on current filters
  const amNames = useMemo(() => {
    if (!allPerfs?.length || !filterYear || !cmMonth) return [];
    return [...new Set(
      (allPerfs as any[])
        .filter(p =>
          String(p.tahun) === filterYear && p.bulan === cmMonth &&
          (filterDivisi === "All" || p.divisi === filterDivisi)
        ).map(p => p.namaAm)
    )].sort() as string[];
  }, [allPerfs, filterYear, cmMonth, filterDivisi]);

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

  const toggleMonth = (m: number) => {
    setFilterMonths(prev => {
      const next = new Set(prev);
      if (next.has(m)) {
        if (next.size === 1) return prev; // keep at least 1
        next.delete(m);
      } else {
        next.add(m);
      }
      return next;
    });
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
      {/* ─── Filter Bar ──────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">

        {/* Row 1: Snapshot + Tahun + Periode Bulan */}
        <div className="flex items-end gap-3">
          {/* 1. Versi Snapshot */}
          <div className="flex flex-col gap-1 min-w-[200px] max-w-[240px]">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Camera className="w-3 h-3" /> Versi Snapshot
            </label>
            <select
              value={filterSnapshotId ?? ""}
              onChange={e => { setFilterSnapshotId(e.target.value ? Number(e.target.value) : null); setFilterMonths(new Set()); }}
              className="h-8 px-2.5 bg-secondary/50 border border-border rounded-lg text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">— Semua Snapshot —</option>
              {perfImports.map((imp: any) => (
                <option key={imp.id} value={imp.id}>
                  {formatSnapshotLabel(imp.createdAt, imp.type)}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Tahun */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Tahun</label>
            <select
              value={filterYear}
              onChange={e => { setFilterYear(e.target.value); setFilterMonths(new Set()); }}
              disabled={!availableYears.length}
              className="h-8 px-2.5 bg-secondary/50 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-40"
            >
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {/* 3. Bulan checkboxes — all 12 in one nowrap row */}
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Periode Bulan</label>
            <div className="flex flex-nowrap gap-1">
              {MONTHS_LABEL.map((label, idx) => {
                const m = idx + 1;
                const mHasData = availableMonths.includes(m);
                const checked = filterMonths.has(m);
                return (
                  <button
                    key={m}
                    onClick={() => mHasData && toggleMonth(m)}
                    disabled={!mHasData}
                    className={cn(
                      "h-8 px-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap flex-1 min-w-0",
                      mHasData
                        ? checked
                          ? "bg-primary text-white border-primary shadow-sm"
                          : "bg-secondary/50 text-muted-foreground border-border hover:border-primary/50"
                        : "opacity-25 cursor-not-allowed bg-secondary/30 border-border text-muted-foreground"
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Row 2: Divisi + Nama AM + Tipe Rank + Tipe Revenue + Info */}
        <div className="flex items-end gap-3 flex-wrap">
          {/* 4. Divisi */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Divisi</label>
            <select
              value={filterDivisi}
              onChange={e => { setFilterDivisi(e.target.value); setFilterNamaAms(new Set()); }}
              disabled={!divisiOptions.length}
              className="h-8 px-2.5 bg-secondary/50 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-40"
            >
              <option value="All">Semua Divisi</option>
              {divisiOptions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {/* 5. Nama AM — multi-select checkbox dropdown */}
          <CheckboxDropdown
            label="Nama AM"
            options={amNames}
            selected={filterNamaAms}
            onChange={setFilterNamaAms}
            placeholder="Semua AM"
          />

          {/* 6. Tipe Rank */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Tipe Rank</label>
            <select
              value={filterTipeRank}
              onChange={e => setFilterTipeRank(e.target.value)}
              className="h-8 px-2.5 bg-secondary/50 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              {TIPE_RANK.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* 7. Tipe Revenue */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Tipe Revenue</label>
            <select
              value={filterTipeRevenue}
              onChange={e => setFilterTipeRevenue(e.target.value)}
              className="h-8 px-2.5 bg-secondary/50 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              {TIPE_REVENUE.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Info */}
          <div className="ml-auto text-sm text-muted-foreground hidden lg:flex items-center gap-2">
            {cmMonth && filterYear && (
              <span className="font-semibold text-foreground">
                CM: {MONTHS_LABEL[cmMonth - 1]} {filterYear}
                {filterMonths.size > 1 && <span className="font-normal text-muted-foreground ml-1">| YTD: {[...filterMonths].sort().map(m => MONTHS_LABEL[m-1]).join("+")} {filterYear}</span>}
              </span>
            )}
            {!noDataAtAll && hasData && <span className="text-xs text-muted-foreground">· {amTableData.length} AM</span>}
          </div>
        </div>
      </div>

      {noDataAtAll ? (
        <div className="bg-card border border-border rounded-xl"><EmptyState /></div>
      ) : !hasData ? (
        <div className="bg-card border border-border rounded-xl"><EmptyState /></div>
      ) : (
        <>
          {/* ─── Trophy Section — Top #1 CM & Top #1 YTD ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top #1 CM */}
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="w-4 h-4 text-yellow-500" />
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Best CM — {MONTHS_LABEL[cmMonth! - 1]} {filterYear}
                </h3>
              </div>
              <TrophyCard
                rank={1}
                title="#1 Achievement CM"
                subtitle={topCm ? topCm.divisi : ""}
                am={topCm}
                value={topCm ? formatPercent(topCm.cmAch) : "–"}
                valueLabel={topCm ? `Real: ${formatRupiah(topCm.cmReal)}` : "Belum ada data"}
                valueColor={topCm && topCm.cmAch >= 1 ? "text-green-600" : "text-orange-500"}
                badge={topCm?.statusWarna?.toUpperCase()}
              />
            </div>

            {/* Top #1 YTD */}
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Medal className="w-4 h-4 text-blue-500" />
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Best YTD — {filterMonths.size > 1 ? [...filterMonths].sort().map(m => MONTHS_LABEL[m-1]).join("+") : MONTHS_LABEL[cmMonth!-1]} {filterYear}
                </h3>
              </div>
              <TrophyCard
                rank={1}
                title="#1 Achievement YTD"
                subtitle={topYtd ? topYtd.divisi : ""}
                am={topYtd}
                value={topYtd ? formatPercent(topYtd.ytdAch) : "–"}
                valueLabel={topYtd ? `YTD Real: ${formatRupiah(topYtd.ytdReal)}` : "Belum ada data"}
                valueColor={topYtd && topYtd.ytdAch >= 1 ? "text-green-600" : "text-blue-600"}
                badge={topYtd?.statusWarna?.toUpperCase()}
              />
            </div>
          </div>

          {/* ─── Table + Right Panel ─────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Table */}
            <div className="lg:col-span-3 bg-card border border-border rounded-xl overflow-hidden">
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
                      <th className="px-3 py-2.5 text-right">CM %</th>
                      <th className="px-3 py-2.5 text-right">YTD %</th>
                      <th className="px-4 py-2.5 text-right">Target CM</th>
                      <th className="px-4 py-2.5 text-right">Real CM</th>
                      <th className="px-3 py-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {amTableData.map(row => {
                      const isExpanded = expandedRows.has(row.nik);
                      const customers = row.customers || [];
                      const hasCustomers = customers.length > 0;
                      const totalReal = customers.reduce((s: number, c: any) => s + c.real, 0);
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
                                {row.displayRank <= 3 && (
                                  <span className="text-sm">{row.displayRank === 1 ? "🥇" : row.displayRank === 2 ? "🥈" : "🥉"}</span>
                                )}
                                <span className="truncate max-w-[130px]" title={row.namaAm}>{row.namaAm}</span>
                                <span className="text-[10px] text-muted-foreground shrink-0">{row.divisi}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-center font-bold text-muted-foreground">{row.displayRank}</td>
                            <td className={cn("px-3 py-2.5 text-right font-bold tabular-nums", row.cmAch >= 1 ? "text-green-600" : row.cmAch >= 0.8 ? "text-orange-500" : "text-red-600")}>
                              {(row.cmAch * 100).toFixed(1).replace(".", ",")}%
                            </td>
                            <td className={cn("px-3 py-2.5 text-right font-bold tabular-nums", row.ytdAch >= 1 ? "text-green-600" : row.ytdAch >= 0.8 ? "text-blue-600" : "text-muted-foreground")}>
                              {(row.ytdAch * 100).toFixed(1).replace(".", ",")}%
                            </td>
                            <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">{formatRupiah(row.cmTarget)}</td>
                            <td className="px-4 py-2.5 text-right font-medium text-foreground tabular-nums">{formatRupiah(row.cmReal)}</td>
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
                                        <th className="px-3 py-1.5 text-left font-medium">Pelanggan</th>
                                        <th className="px-3 py-1.5 text-left font-medium">Tipe</th>
                                        <th className="px-3 py-1.5 text-right font-medium">Target</th>
                                        <th className="px-3 py-1.5 text-right font-medium">Real</th>
                                        <th className="px-3 py-1.5 text-right font-medium">Proporsi</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/40">
                                      {customers.map((c: any, ci: number) => {
                                        const prop = totalReal > 0 ? (c.real / totalReal * 100) : 0;
                                        return (
                                          <tr key={ci} className="hover:bg-secondary/30">
                                            <td className="px-3 py-1.5 font-medium text-foreground truncate max-w-[160px]" title={c.pelanggan}>{c.pelanggan}</td>
                                            <td className="px-3 py-1.5 text-muted-foreground">
                                              <span className="bg-secondary px-1.5 py-0.5 rounded text-[10px] font-medium">{c.tipeRevenue}</span>
                                            </td>
                                            <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{formatRupiah(c.target)}</td>
                                            <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatRupiah(c.real)}</td>
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

            {/* Right Panel */}
            <div className="lg:col-span-2 flex flex-col gap-3">
              {/* Distribusi Donut */}
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Distribusi Pencapaian Target (CM)</h3>
                <div className="relative">
                  <ResponsiveContainer width="100%" height={140}>
                    <PieChart>
                      <Pie data={distribusi} cx="50%" cy="50%" innerRadius={38} outerRadius={60} dataKey="value" labelLine={false} label={renderCustomLabel}>
                        {distribusi.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)", fontSize: "12px" }} formatter={(v, n) => [`${v} AM`, n]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center mt-[-8px]">
                      <p className="text-lg font-display font-black text-foreground">{amTableData.length}</p>
                      <p className="text-[10px] text-muted-foreground">AM</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5 mt-1">
                  {distribusi.map(d => (
                    <div key={d.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                        <span className="text-muted-foreground">{d.name}</span>
                      </div>
                      <span className="font-bold tabular-nums">{d.value} AM</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary CM vs YTD */}
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Summary Revenue</h3>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">CM Real</span>
                      <span className="font-bold text-foreground tabular-nums">{formatRupiah(totals.cmReal)}</span>
                    </div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">CM Target</span>
                      <span className="tabular-nums text-muted-foreground">{formatRupiah(totals.cmTarget)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold">CM Ach</span>
                      <span className={cn("font-bold tabular-nums", totals.cmAch >= 100 ? "text-green-600" : totals.cmAch >= 80 ? "text-orange-500" : "text-red-600")}>
                        {totals.cmAch.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="border-t border-border pt-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">YTD Real</span>
                      <span className="font-bold text-foreground tabular-nums">{formatRupiah(totals.ytdReal)}</span>
                    </div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">YTD Target</span>
                      <span className="tabular-nums text-muted-foreground">{formatRupiah(totals.ytdTarget)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold">YTD Ach</span>
                      <span className={cn("font-bold tabular-nums", totals.ytdAch >= 100 ? "text-green-600" : totals.ytdAch >= 80 ? "text-blue-600" : "text-muted-foreground")}>
                        {totals.ytdAch.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ─── Trend Chart ─────────────────────────────── */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-display font-semibold text-foreground mb-4">
              Tren Performa Revenue Bulanan {filterYear}
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
    </div>
  );
}

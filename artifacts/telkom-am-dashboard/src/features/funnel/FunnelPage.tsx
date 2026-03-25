import React, { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/shared/lib/utils";
import { ChevronRight, ChevronDown, Search, X, ChevronsUpDown, Check } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FunnelSnapshot {
  id: number;
  period: string;
  rowsImported: number;
  createdAt: string;
}

interface LopRow {
  id: number;
  lopid: string;
  judulProyek: string;
  pelanggan: string;
  nilaiProyek: number;
  divisi: string;
  segmen: string | null;
  statusF: string | null;
  proses: string | null;
  statusProyek: string | null;
  kategoriKontrak: string | null;
  estimateBulan: string | null;
  namaAm: string | null;
  nikAm: string | null;
  reportDate: string | null;
}

interface FunnelData {
  totalLop: number;
  totalNilai: number;
  targetFullHo: number;
  realFullHo: number;
  shortage: number;
  amCount: number;
  pelangganCount: number;
  byStatus: { status: string; count: number; totalNilai: number }[];
  byAm: { namaAm: string; nik: string; divisi: string; totalLop: number; totalNilai: number; byStatus: any[] }[];
  lops: LopRow[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PHASES = ["F0", "F1", "F2", "F3", "F4", "F5"];

const PHASE_LABELS: Record<string, string> = {
  F0: "Lead", F1: "Prospect", F2: "Quote", F3: "Negosiasi", F4: "Closing", F5: "Won/Closed",
};

const PHASE_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  F0: { bg: "bg-blue-50", text: "text-blue-700", bar: "#93c5fd" },
  F1: { bg: "bg-blue-100", text: "text-blue-800", bar: "#3b82f6" },
  F2: { bg: "bg-indigo-50", text: "text-indigo-700", bar: "#818cf8" },
  F3: { bg: "bg-indigo-100", text: "text-indigo-800", bar: "#6366f1" },
  F4: { bg: "bg-violet-100", text: "text-violet-800", bar: "#8b5cf6" },
  F5: { bg: "bg-emerald-50", text: "text-emerald-700", bar: "#10b981" },
};

const KONTRAK_LABELS: Record<string, string> = {
  GTMA: "GTMA", "New GTMA": "New GTMA", "Non-GTMA": "Non-GTMA",
};

function fmtRupiah(n: number): string {
  if (!n && n !== 0) return "–";
  if (n >= 1e12) return `Rp ${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `Rp ${(n / 1e9).toFixed(2)}M`;
  if (n >= 1e6) return `Rp ${Math.round(n / 1e6)} jt`;
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function fmtRupiahCompact(n: number): string {
  if (!n && n !== 0) return "–";
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}M`;
  if (n >= 1e6) return `${Math.round(n / 1e6)} jt`;
  return String(n);
}

function periodLabel(period: string): string {
  const [y, m] = period.split("-");
  const months = ["", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];
  return `${months[parseInt(m)] || m} ${y}`;
}

// ─── API Fetcher ─────────────────────────────────────────────────────────────

const basePath = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const apiUrl = (path: string) => `${basePath}${path}`;

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), { credentials: "include" });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

// ─── Multi-select Dropdown ───────────────────────────────────────────────────

interface MultiSelectProps {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  align?: "left" | "right";
}

function MultiSelect({ label, options, selected, onChange, placeholder = "Semua", align = "left" }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const isAll = selected.length === 0 || selected.length === options.length;
  const displayLabel = isAll ? placeholder : selected.length === 1 ? options.find(o => o.value === selected[0])?.label || selected[0] : `${selected.length} dipilih`;

  const toggle = (val: string) => {
    if (selected.includes(val)) {
      const next = selected.filter(v => v !== val);
      onChange(next);
    } else {
      onChange([...selected, val]);
    }
  };

  return (
    <div className="flex flex-col gap-0.5" ref={ref}>
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-0.5">{label}</span>
      <div className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 bg-background border rounded-md text-xs whitespace-nowrap min-w-[110px] justify-between transition-colors",
            open ? "border-primary ring-1 ring-primary/20" : "border-border hover:border-border/80"
          )}
        >
          <span className={cn("truncate max-w-[100px]", !isAll && "text-primary font-medium")}>{displayLabel}</span>
          {!isAll && <span className="bg-primary text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none shrink-0">{selected.length}</span>}
          <ChevronsUpDown className="w-3 h-3 text-muted-foreground shrink-0" />
        </button>

        {open && (
          <div className={cn(
            "absolute top-full mt-1 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden min-w-[180px]",
            align === "right" ? "right-0" : "left-0"
          )}>
            <div className="p-1">
              <button
                onClick={() => onChange([])}
                className={cn("w-full flex items-center gap-2 px-3 py-2 text-xs rounded-md transition-colors text-left",
                  isAll ? "bg-primary/10 text-primary font-medium" : "hover:bg-secondary")}
              >
                <Check className={cn("w-3.5 h-3.5", isAll ? "opacity-100" : "opacity-0")} />
                {placeholder}
              </button>
              <div className="h-px bg-border my-1" />
              {options.map(opt => {
                const checked = selected.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    onClick={() => toggle(opt.value)}
                    className={cn("w-full flex items-center gap-2 px-3 py-2 text-xs rounded-md transition-colors text-left",
                      checked ? "bg-primary/10 text-primary font-medium" : "hover:bg-secondary text-foreground")}
                  >
                    <Check className={cn("w-3.5 h-3.5 shrink-0", checked ? "opacity-100" : "opacity-0")} />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Single Select Dropdown ──────────────────────────────────────────────────

interface SingleSelectProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}

function SingleSelect({ label, value, options, onChange }: SingleSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const display = options.find(o => o.value === value)?.label || value;

  return (
    <div className="flex flex-col gap-0.5" ref={ref}>
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-0.5">{label}</span>
      <div className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 bg-background border rounded-md text-xs whitespace-nowrap min-w-[110px] justify-between transition-colors",
            open ? "border-primary ring-1 ring-primary/20" : "border-border hover:border-border/80"
          )}
        >
          <span className="truncate max-w-[120px] font-medium">{display}</span>
          <ChevronsUpDown className="w-3 h-3 text-muted-foreground shrink-0" />
        </button>
        {open && (
          <div className="absolute top-full mt-1 left-0 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden min-w-[160px]">
            <div className="p-1">
              {options.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className={cn("w-full flex items-center gap-2 px-3 py-2 text-xs rounded-md transition-colors text-left",
                    opt.value === value ? "bg-primary/10 text-primary font-medium" : "hover:bg-secondary text-foreground")}
                >
                  <Check className={cn("w-3.5 h-3.5 shrink-0", opt.value === value ? "opacity-100" : "opacity-0")} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Phase Badge ─────────────────────────────────────────────────────────────

function PhaseBadge({ phase }: { phase: string }) {
  const c = PHASE_COLORS[phase] || { bg: "bg-muted", text: "text-muted-foreground" };
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono", c.bg, c.text)}>
      {phase}
      <span className="font-normal opacity-70 hidden sm:inline">· {PHASE_LABELS[phase] || ""}</span>
    </span>
  );
}

// ─── Kontrak Badge ───────────────────────────────────────────────────────────

function KontrakBadge({ k }: { k: string | null }) {
  if (!k) return <span className="text-muted-foreground text-[10px]">–</span>;
  return (
    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-secondary border border-border text-muted-foreground font-medium">
      {k}
    </span>
  );
}

// ─── Overview Cards ───────────────────────────────────────────────────────────

function FaseBarChart({ data }: { data: FunnelData | undefined }) {
  if (!data) return null;
  const phaseMap: Record<string, { count: number; nilai: number }> = {};
  for (const p of PHASES) phaseMap[p] = { count: 0, nilai: 0 };
  for (const s of (data.byStatus || [])) {
    if (phaseMap[s.status] !== undefined) {
      phaseMap[s.status].count = s.count;
      phaseMap[s.status].nilai = s.totalNilai;
    }
  }
  const maxCount = Math.max(...PHASES.map(p => phaseMap[p].count), 1);

  return (
    <div className="space-y-2">
      {PHASES.map(phase => {
        const d = phaseMap[phase];
        const pct = (d.count / maxCount) * 100;
        const c = PHASE_COLORS[phase];
        return (
          <div key={phase} className="flex items-center gap-2 group">
            <span className="text-[10px] font-bold font-mono w-6 text-right text-muted-foreground">{phase}</span>
            <div className="flex-1 bg-secondary rounded-sm h-5 overflow-hidden relative">
              <div
                className="h-full rounded-sm transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: c.bar }}
              />
              {d.count > 0 && (
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-foreground/80 font-mono leading-none"
                  style={{ color: pct > 30 ? "white" : undefined }}>
                  {d.count}
                </span>
              )}
            </div>
            <span className="text-[10px] font-mono text-muted-foreground w-16 text-right shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              {fmtRupiahCompact(d.nilai)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function AchievementCard({ data }: { data: FunnelData | undefined }) {
  if (!data) return null;
  const hasTarget = data.targetFullHo > 0;
  const pct = hasTarget ? Math.min((data.realFullHo / data.targetFullHo) * 100, 100) : 0;
  const pctDisplay = hasTarget ? `${pct.toFixed(1)}%` : "–";
  const color = pct >= 100 ? "bg-emerald-500" : pct >= 75 ? "bg-blue-500" : pct >= 50 ? "bg-amber-500" : "bg-primary";

  return (
    <div className="space-y-3">
      <div>
        <div className={cn("text-3xl font-bold font-mono", pct >= 100 ? "text-emerald-600" : pct >= 75 ? "text-blue-600" : "text-primary")}>
          {pctDisplay}
        </div>
        <div className="h-2.5 bg-secondary rounded-full mt-2 overflow-hidden">
          <div className={cn("h-full rounded-full transition-all duration-700", color)} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Real pipeline</span>
          <span className="font-semibold font-mono">{fmtRupiah(data.realFullHo)}</span>
        </div>
        {hasTarget && (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Target</span>
              <span className="font-semibold font-mono">{fmtRupiah(data.targetFullHo)}</span>
            </div>
            <div className="pt-2 border-t border-border">
              <div className="flex justify-between text-xs">
                <span className={data.shortage > 0 ? "text-destructive font-medium" : "text-emerald-600 font-medium"}>
                  {data.shortage > 0 ? "Shortage" : "Surplus"}
                </span>
                <span className={cn("font-bold font-mono", data.shortage > 0 ? "text-destructive" : "text-emerald-600")}>
                  {data.shortage > 0 ? "-" : "+"}{fmtRupiah(Math.abs(data.shortage))}
                </span>
              </div>
            </div>
          </>
        )}
        {!hasTarget && (
          <div className="text-muted-foreground text-[11px] italic">Target belum dikonfigurasi</div>
        )}
      </div>
    </div>
  );
}

function KpiGrid({ data }: { data: FunnelData | undefined }) {
  if (!data) return null;
  const kpis = [
    { label: "Total LOP", value: data.totalLop.toLocaleString("id-ID"), color: "text-foreground" },
    { label: "Total Nilai", value: fmtRupiahCompact(data.totalNilai), color: "text-blue-600" },
    { label: "Aktif AM", value: data.amCount.toString(), color: "text-violet-600" },
    { label: "Pelanggan", value: data.pelangganCount.toLocaleString("id-ID"), color: "text-amber-600" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {kpis.map(k => (
        <div key={k.label} className="bg-secondary/60 border border-border rounded-lg p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1">{k.label}</div>
          <div className={cn("text-xl font-bold font-mono", k.color)}>{k.value}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FunnelPage() {
  const [importId, setImportId] = useState<number | null>(null);
  const [filterDivisi, setFilterDivisi] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterKontrak, setFilterKontrak] = useState<string[]>([]);
  const [filterAm, setFilterAm] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [expandedAm, setExpandedAm] = useState<Record<string, boolean>>({});
  const [expandedPhase, setExpandedPhase] = useState<Record<string, boolean>>({});
  const [allExpanded, setAllExpanded] = useState(false);

  const { data: snapshots = [] } = useQuery<FunnelSnapshot[]>({
    queryKey: ["funnel-snapshots"],
    queryFn: () => apiFetch("/api/funnel/snapshots"),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (snapshots.length > 0 && importId === null) {
      setImportId(snapshots[0].id);
    }
  }, [snapshots, importId]);

  const funnelParams = useMemo(() => {
    const params = new URLSearchParams();
    if (importId) params.set("import_id", String(importId));
    if (filterDivisi !== "all") params.set("divisi", filterDivisi);
    return params.toString();
  }, [importId, filterDivisi]);

  const { data, isLoading } = useQuery<FunnelData>({
    queryKey: ["funnel-data", funnelParams],
    queryFn: () => apiFetch(`/api/funnel?${funnelParams}`),
    enabled: importId !== null,
    staleTime: 30_000,
  });

  const amOptions = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, string>();
    for (const l of data.lops) {
      if (l.nikAm && l.namaAm) map.set(l.nikAm, l.namaAm);
    }
    return Array.from(map.entries())
      .map(([nik, nama]) => ({ value: nik, label: nama }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [data]);

  const kontrakOptions = useMemo(() => {
    if (!data) return [];
    const s = new Set(data.lops.map(l => l.kategoriKontrak).filter(Boolean) as string[]);
    return Array.from(s).sort().map(k => ({ value: k, label: k }));
  }, [data]);

  const filteredLops = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.lops.filter(l => {
      if (filterAm.length > 0 && (!l.nikAm || !filterAm.includes(l.nikAm))) return false;
      if (filterStatus.length > 0 && (!l.statusF || !filterStatus.includes(l.statusF))) return false;
      if (filterKontrak.length > 0 && (!l.kategoriKontrak || !filterKontrak.includes(l.kategoriKontrak))) return false;
      if (q) {
        const haystack = `${l.judulProyek} ${l.pelanggan} ${l.lopid} ${l.namaAm}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [data, filterAm, filterStatus, filterKontrak, search]);

  const groupedByAm = useMemo(() => {
    const amMap = new Map<string, { namaAm: string; nikAm: string; divisi: string; phases: Map<string, LopRow[]> }>();
    for (const l of filteredLops) {
      const key = l.nikAm || l.namaAm || "Unknown";
      if (!amMap.has(key)) {
        amMap.set(key, { namaAm: l.namaAm || key, nikAm: l.nikAm || "", divisi: l.divisi || "", phases: new Map() });
      }
      const amEntry = amMap.get(key)!;
      const phase = l.statusF || "Unknown";
      if (!amEntry.phases.has(phase)) amEntry.phases.set(phase, []);
      amEntry.phases.get(phase)!.push(l);
    }
    return Array.from(amMap.values()).sort((a, b) => {
      const totA = Array.from(a.phases.values()).flat().reduce((s, l) => s + (l.nilaiProyek || 0), 0);
      const totB = Array.from(b.phases.values()).flat().reduce((s, l) => s + (l.nilaiProyek || 0), 0);
      return totB - totA;
    });
  }, [filteredLops]);

  function toggleAmRow(key: string) {
    setExpandedAm(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function togglePhaseRow(key: string) {
    setExpandedPhase(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function handleToggleAll() {
    const next = !allExpanded;
    setAllExpanded(next);
    if (next) {
      const amKeys: Record<string, boolean> = {};
      const phaseKeys: Record<string, boolean> = {};
      for (const am of groupedByAm) {
        amKeys[am.nikAm || am.namaAm] = true;
        for (const [phase] of am.phases) phaseKeys[`${am.nikAm || am.namaAm}|${phase}`] = true;
      }
      setExpandedAm(amKeys);
      setExpandedPhase(phaseKeys);
    } else {
      setExpandedAm({});
      setExpandedPhase({});
    }
  }

  const snapshotOptions = snapshots.map(s => ({
    value: String(s.id),
    label: `${periodLabel(s.period)} (${s.rowsImported.toLocaleString()} LOP)`,
  }));

  const divisiOptions = [
    { value: "all", label: "Semua Divisi" },
    { value: "DPS", label: "DPS" },
    { value: "DSS", label: "DSS" },
  ];

  const statusOptions = PHASES.map(p => ({ value: p, label: `${p} – ${PHASE_LABELS[p]}` }));

  const lopCountBadge = filteredLops.length !== (data?.totalLop || 0)
    ? `${filteredLops.length} / ${data?.totalLop || 0}`
    : filteredLops.length.toLocaleString("id-ID");

  const activeFilterCount = (filterAm.length > 0 ? 1 : 0) + (filterStatus.length > 0 ? 1 : 0) + (filterKontrak.length > 0 ? 1 : 0) + (filterDivisi !== "all" ? 1 : 0);

  return (
    <div className="flex flex-col gap-4 p-4 min-h-full">

      {/* Filter Bar */}
      <div className="bg-card border border-border rounded-xl px-4 py-3 flex items-end gap-3 flex-wrap shadow-sm">

        {snapshots.length > 0 && (
          <SingleSelect
            label="Snapshot"
            value={String(importId || snapshots[0]?.id || "")}
            options={snapshotOptions}
            onChange={v => setImportId(Number(v))}
          />
        )}

        <div className="w-px h-8 bg-border self-end mb-0.5" />

        <SingleSelect
          label="Divisi"
          value={filterDivisi}
          options={divisiOptions}
          onChange={setFilterDivisi}
        />

        {amOptions.length > 0 && (
          <MultiSelect
            label="Nama AM"
            options={amOptions}
            selected={filterAm}
            onChange={setFilterAm}
            placeholder="Semua AM"
          />
        )}

        <MultiSelect
          label="Status Funnel"
          options={statusOptions}
          selected={filterStatus}
          onChange={setFilterStatus}
          placeholder="Semua status"
        />

        {kontrakOptions.length > 0 && (
          <MultiSelect
            label="Kategori Kontrak"
            options={kontrakOptions}
            selected={filterKontrak}
            onChange={setFilterKontrak}
            placeholder="Semua kontrak"
          />
        )}

        {activeFilterCount > 0 && (
          <button
            onClick={() => { setFilterAm([]); setFilterStatus([]); setFilterKontrak([]); setFilterDivisi("all"); }}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-destructive/30 text-destructive hover:bg-destructive/5 transition-colors self-end mb-0"
          >
            <X className="w-3 h-3" /> Reset ({activeFilterCount})
          </button>
        )}
      </div>

      {/* Overview Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 h-40 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">LOP per Fase</div>
            <FaseBarChart data={data} />
          </div>
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">
              Capaian Real vs Target
            </div>
            <AchievementCard data={data} />
          </div>
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Ringkasan</div>
            <KpiGrid data={data} />
          </div>
        </div>
      )}

      {/* Detail Table */}
      <div>
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-foreground">Detail Funnel per AM</span>
            <span className="bg-foreground text-background text-[10px] font-bold px-2 py-0.5 rounded-full font-mono">{lopCountBadge}</span>
            <button
              onClick={handleToggleAll}
              className="text-[11px] text-primary hover:underline transition-colors font-medium"
            >
              {allExpanded ? "Collapse semua" : "Expand semua"}
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              className="pl-8 pr-8 py-1.5 text-xs border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary w-56 transition-all"
              placeholder="Cari proyek / pelanggan / LOP ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-secondary border-b border-border">
                  <th className="text-left px-3 py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider w-64">AM / Fase / Proyek</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Kat. Kontrak</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono whitespace-nowrap">LOP ID</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Pelanggan</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Status</th>
                  <th className="text-right px-3 py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Nilai Proyek</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Est. BC</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} className="text-center py-16 text-muted-foreground">Memuat data...</td></tr>
                ) : groupedByAm.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-16 text-muted-foreground">
                    {search || activeFilterCount > 0 ? "Tidak ada data yang cocok dengan filter" : "Belum ada data funnel"}
                  </td></tr>
                ) : (
                  groupedByAm.map(am => {
                    const amKey = am.nikAm || am.namaAm;
                    const amExpanded = !!expandedAm[amKey];
                    const amTotal = Array.from(am.phases.values()).flat().reduce((s, l) => s + (l.nilaiProyek || 0), 0);
                    const amLopCount = Array.from(am.phases.values()).flat().length;
                    const orderedPhases = PHASES.filter(p => am.phases.has(p));
                    const unknownPhases = Array.from(am.phases.keys()).filter(p => !PHASES.includes(p));

                    return (
                      <React.Fragment key={amKey}>
                        {/* AM Row */}
                        <tr
                          className="cursor-pointer border-b border-border hover:bg-secondary/70 transition-colors group"
                          onClick={() => toggleAmRow(amKey)}
                        >
                          <td className="px-3 py-2.5 bg-secondary/40">
                            <div className="flex items-center gap-1.5">
                              <span className="text-muted-foreground transition-transform duration-200" style={{ transform: amExpanded ? "rotate(90deg)" : "rotate(0)" }}>
                                <ChevronRight className="w-3.5 h-3.5" />
                              </span>
                              <span className="font-bold text-foreground text-[11px] uppercase tracking-wide">{am.namaAm}</span>
                              <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-medium", am.divisi === "DPS" ? "bg-blue-50 text-blue-700" : "bg-violet-50 text-violet-700")}>
                                {am.divisi}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 bg-secondary/40" colSpan={4}>
                            <div className="flex items-center gap-2">
                              {orderedPhases.map(p => (
                                <span key={p} className={cn("text-[9px] px-1.5 py-0.5 rounded font-bold font-mono", PHASE_COLORS[p].bg, PHASE_COLORS[p].text)}>
                                  {p}:{am.phases.get(p)!.length}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 bg-secondary/40 text-right">
                            <span className="font-bold text-foreground font-mono text-[11px]">{fmtRupiah(amTotal)}</span>
                          </td>
                          <td className="px-3 py-2.5 bg-secondary/40">
                            <span className="text-[10px] text-muted-foreground font-mono">{amLopCount} LOP</span>
                          </td>
                        </tr>

                        {amExpanded && [...orderedPhases, ...unknownPhases].map(phase => {
                          const lops = am.phases.get(phase) || [];
                          const phaseKey = `${amKey}|${phase}`;
                          const phaseExpanded = !!expandedPhase[phaseKey];
                          const phaseTotal = lops.reduce((s, l) => s + (l.nilaiProyek || 0), 0);

                          return (
                            <React.Fragment key={phaseKey}>
                              {/* Phase Row */}
                              <tr
                                className="cursor-pointer border-b border-border/50 hover:bg-primary/5 transition-colors"
                                onClick={() => togglePhaseRow(phaseKey)}
                              >
                                <td className="pl-9 pr-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground transition-transform duration-200" style={{ transform: phaseExpanded ? "rotate(90deg)" : "rotate(0)" }}>
                                      <ChevronRight className="w-3 h-3" />
                                    </span>
                                    <PhaseBadge phase={phase} />
                                    <span className="text-[10px] text-muted-foreground font-mono">{lops.length} LOP</span>
                                  </div>
                                </td>
                                <td colSpan={4} className="px-3 py-2 text-[10px] text-muted-foreground" />
                                <td className="px-3 py-2 text-right">
                                  <span className="text-[11px] font-semibold text-muted-foreground font-mono">{fmtRupiah(phaseTotal)}</span>
                                </td>
                                <td className="px-3 py-2" />
                              </tr>

                              {phaseExpanded && lops.map((lop, idx) => (
                                <tr key={`${lop.lopid}-${idx}`} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                                  <td className="pl-16 pr-3 py-2">
                                    <div className="text-[11px] text-primary font-medium leading-tight line-clamp-2 max-w-[200px]" title={lop.judulProyek}>
                                      {lop.judulProyek}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2"><KontrakBadge k={lop.kategoriKontrak} /></td>
                                  <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground whitespace-nowrap">{lop.lopid}</td>
                                  <td className="px-3 py-2 text-[11px] text-foreground max-w-[160px] truncate" title={lop.pelanggan}>{lop.pelanggan}</td>
                                  <td className="px-3 py-2"><PhaseBadge phase={lop.statusF || "?"} /></td>
                                  <td className="px-3 py-2 text-right font-mono text-[11px] font-semibold text-foreground whitespace-nowrap">{fmtRupiah(lop.nilaiProyek)}</td>
                                  <td className="px-3 py-2 text-[10px] text-muted-foreground whitespace-nowrap">{lop.estimateBulan || "–"}</td>
                                </tr>
                              ))}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

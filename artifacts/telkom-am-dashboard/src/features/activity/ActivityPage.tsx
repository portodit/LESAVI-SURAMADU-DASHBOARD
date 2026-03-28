import React, { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { matchesDivisi, DIVISI_OPTIONS_WITH_ALL, DEFAULT_DIVISI } from "@/shared/lib/divisi";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/shared/lib/utils";
import { Search, ChevronDown, Target, Users, TrendingUp, AlertTriangle, CheckCircle2, Expand, Minimize2 } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MasterAm { nik: string; nama: string; divisi: string; }

interface ActivityItem {
  id: number;
  activityEndDate: string | null;
  activityType: string | null;
  label: string | null;
  caName: string | null;
  picName: string | null;
  activityNotes: string | null;
  isKpi: boolean;
}

interface AmActivity {
  nik: string;
  fullname: string;
  divisi: string;
  kpiCount: number;
  totalCount: number;
  kpiTarget: number;
  activities: ActivityItem[];
}

interface ActivityData {
  totalKpiActivities: number;
  masterAms: MasterAm[];
  byAm: AmActivity[];
  distinctLabels: string[];
}

interface ActivitySnapshot {
  id: number;
  period: string | null;
  rowsImported: number | null;
  snapshotDate: string | null;
  createdAt: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHS_FULL = ["","Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const MONTHS_SHORT = ["","Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agt","Sep","Okt","Nov","Des"];
const DAYS_ID = ["Min","Sen","Sel","Rab","Kam","Jum","Sab"];

const ACTIVITY_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  "Kunjungan":    { bg: "#e3f2fd", text: "#1565C0" },
  "Administrasi": { bg: "#f3e5f5", text: "#6a1b9a" },
  "Follow-up":    { bg: "#e8f5e9", text: "#2e7d32" },
  "Penawaran":    { bg: "#fff3e0", text: "#e65100" },
  "Koordinasi":   { bg: "#fce4ec", text: "#880e4f" },
  "Negosiasi":    { bg: "#e0f7fa", text: "#00695c" },
};

function getLabelStyle(label: string | null) {
  if (!label) return { cls: "bg-secondary text-foreground/60", short: "—" };
  const l = label.toLowerCase();
  if (l.includes("tanpa")) return { cls: "bg-secondary text-foreground/60", short: "Tanpa Pelanggan" };
  if (l.includes("proyek")) return { cls: "bg-teal-50 text-teal-700 dark:bg-teal-950/30 dark:text-teal-400", short: "Dg Proyek" };
  return { cls: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400", short: "Dg Pelanggan" };
}

function getActivityTypeStyle(type: string | null) {
  if (!type) return { bg: "hsl(var(--secondary))", text: "hsl(var(--foreground))" };
  return ACTIVITY_TYPE_COLORS[type] || { bg: "hsl(var(--secondary))", text: "hsl(var(--foreground))" };
}

// ─── API ─────────────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
async function apiFetch<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { credentials: "include" });
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

function snapLabel(s: ActivitySnapshot): string {
  if (s.snapshotDate) {
    try {
      const d = new Date(s.snapshotDate);
      const day = d.getDate();
      const mon = MONTHS_SHORT[d.getMonth() + 1];
      const yr = d.getFullYear();
      const period = s.period ? ` · ${s.period}` : "";
      return `${day} ${mon} ${yr}${period}`;
    } catch { /**/ }
  }
  if (s.period) return s.period;
  if (s.createdAt) {
    const d = new Date(s.createdAt);
    return `${d.getDate()} ${MONTHS_SHORT[d.getMonth() + 1]} ${d.getFullYear()}`;
  }
  return `Import #${s.id}`;
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
          "h-9 px-3 bg-secondary/50 border border-border rounded-lg text-sm flex items-center gap-1.5 w-full transition-colors text-left disabled:opacity-40",
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

// ─── PeriodeDropdown ── year select + month buttons combined ──────────────────

function PeriodeDropdown({ year, month, onYearChange, onMonthChange, className }: {
  year: string; month: string;
  onYearChange: (y: string) => void; onMonthChange: (m: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const YEARS = ["2026", "2025", "2024"];

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
          dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const toggle = () => {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen(o => !o);
  };

  const displayText = month === "all"
    ? `${year} (semua bulan)`
    : `${MONTHS_FULL[parseInt(month)]} ${year}`;

  const handleYearClick = (y: string) => {
    if (y !== year) { onYearChange(y); onMonthChange("all"); }
    else { onMonthChange(month === "all" ? String(new Date().getMonth() + 1) : "all"); }
  };

  return (
    <div className={cn("flex flex-col gap-1", className)} ref={triggerRef}>
      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Periode</label>
      <button type="button" onClick={toggle}
        className={cn("h-9 px-3 bg-secondary/50 border border-border rounded-lg text-sm flex items-center gap-1.5 w-full transition-colors text-left min-w-[180px]",
          open && "border-primary/50 ring-2 ring-primary/20")}>
        <span className="flex-1 truncate font-medium text-foreground">{displayText}</span>
        <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && createPortal(
        <div ref={dropRef} style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="bg-card border border-border rounded-xl shadow-xl w-52 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-secondary/30">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">PERIODE</span>
            <div className="flex gap-1.5">
              <button onClick={() => { onMonthChange("all"); }} className="text-[11px] text-primary font-semibold hover:underline">Semua</button>
              <span className="text-muted-foreground text-[11px]">·</span>
              <button onClick={() => { onYearChange(String(new Date().getFullYear())); onMonthChange(String(new Date().getMonth()+1)); setOpen(false); }}
                className="text-[11px] text-muted-foreground font-semibold hover:underline">Reset</button>
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {YEARS.map(y => {
              const isActive = y === year;
              const yearAllSel = isActive && month === "all";
              const yearPartial = isActive && month !== "all";
              return (
                <React.Fragment key={y}>
                  <div className="flex items-center gap-2 px-3 py-2 hover:bg-secondary transition-colors cursor-pointer">
                    <span onClick={() => handleYearClick(y)}
                      className={cn("w-4 h-4 rounded border shrink-0 flex items-center justify-center",
                        yearAllSel ? "bg-primary border-primary" : yearPartial ? "border-primary bg-primary/10" : "border-border")}>
                      {yearAllSel && <span className="text-white text-[9px] font-black">✓</span>}
                      {yearPartial && <span className="text-primary text-[9px] font-black leading-none">–</span>}
                    </span>
                    <span className={cn("flex-1 text-sm font-semibold", isActive ? "text-primary" : "text-foreground")}
                      onClick={() => { if (!isActive) { onYearChange(y); onMonthChange("all"); } else handleYearClick(y); }}>
                      {y}
                    </span>
                  </div>
                  {isActive && MONTHS_FULL.slice(1).map((mName, idx) => {
                    const mNum = String(idx + 1);
                    const checked = month === mNum;
                    return (
                      <button key={mNum} onClick={() => { onMonthChange(mNum); setOpen(false); }}
                        className={cn("w-full text-left pl-9 pr-3 py-1.5 text-sm hover:bg-secondary flex items-center gap-2 transition-colors",
                          checked ? "font-medium text-primary bg-primary/5" : "text-foreground")}>
                        <span className={cn("w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center",
                          checked ? "bg-primary border-primary" : "border-border")}>
                          {checked && <span className="text-white text-[8px] font-black">✓</span>}
                        </span>
                        {mName}
                      </button>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── CheckboxDropdown ─────────────────────────────────────────────────────────

function CheckboxDropdown({ label, options, selected, onChange, placeholder, labelFn, summaryLabel, className, kpiBadge }: {
  label: string; options: string[]; selected: Set<string>; onChange: (next: Set<string>) => void;
  placeholder?: string; labelFn?: (v: string) => string; summaryLabel?: string; className?: string; kpiBadge?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
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

  const toggle = () => {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen(o => !o);
  };

  const toggleItem = (item: string) => {
    const next = new Set(selected);
    if (next.has(item)) next.delete(item); else next.add(item);
    onChange(next);
  };

  const filtered = options.filter(o => !search || getLabel(o).toLowerCase().includes(search.toLowerCase()));
  const unit = summaryLabel ?? "item";
  const displayText = selected.size === 0 ? (placeholder ?? "Semua")
    : selected.size === options.length ? `Semua ${unit}`
    : selected.size === 1 ? getLabel([...selected][0])
    : `${selected.size} ${unit} dipilih`;

  return (
    <div className={cn("flex flex-col gap-1", className)} ref={triggerRef}>
      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>
      <button
        type="button" onClick={toggle}
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
          className="bg-card border border-border rounded-xl shadow-xl min-w-[220px] max-w-[280px] overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-secondary/30">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
            <div className="flex gap-1.5">
              <button onClick={() => onChange(new Set(options))} className="text-[11px] text-primary font-semibold hover:underline">Semua</button>
              <span className="text-muted-foreground text-[11px]">·</span>
              <button onClick={() => onChange(new Set())} className="text-[11px] text-muted-foreground font-semibold hover:text-foreground hover:underline">Kosongkan</button>
            </div>
          </div>
          {options.length > 6 && (
            <div className="p-2 border-b border-border">
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Cari..." className="w-full border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary/50 bg-background" />
            </div>
          )}
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.map(opt => (
              <button key={opt} onClick={() => toggleItem(opt)}
                className={cn("w-full text-left px-3 py-2 text-sm hover:bg-secondary flex items-center gap-2 transition-colors",
                  selected.has(opt) ? "font-semibold text-primary bg-primary/5" : "text-foreground")}>
                <span className={cn("w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center",
                  selected.has(opt) ? "bg-primary border-primary" : "border-border")}>
                  {selected.has(opt) && <span className="text-white text-[8px] font-black">✓</span>}
                </span>
                <span className="flex-1">{getLabel(opt)}</span>
                {kpiBadge && !getLabel(opt).toLowerCase().includes("tanpa") && (
                  <span className="bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400 text-[9px] font-bold px-1 py-px rounded shrink-0">KPI</span>
                )}
              </button>
            ))}
          </div>
          {kpiBadge && (
            <div className="px-3 py-2 border-t border-border bg-secondary/30 text-[10px] text-muted-foreground">
              <span className="inline bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400 text-[9px] font-bold px-1 rounded mr-1">KPI</span>
              = dihitung untuk capaian KPI aktivitas bulanan
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Overview Card ────────────────────────────────────────────────────────────

function OverviewCard({ icon, label, value, sub, accent }: {
  icon: React.ReactNode; label: string; value: number | string; sub: React.ReactNode; accent: string;
}) {
  return (
    <div className="bg-white border border-border rounded-xl p-4 flex items-start gap-3 overflow-hidden relative">
      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", accent)}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-foreground uppercase tracking-wide mb-1">{label}</div>
        <div className="text-3xl font-black tabular-nums leading-tight text-foreground">{value}</div>
        <div className="text-sm font-bold text-foreground mt-1">{sub}</div>
      </div>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ pct }: { pct: number }) {
  if (pct >= 100) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
      <CheckCircle2 className="w-3 h-3" /> Tercapai
    </span>
  );
  if (pct >= 70) return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
      Mendekati
    </span>
  );
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-600 dark:bg-red-950/30 dark:text-red-400">
      Di Bawah KPI
    </span>
  );
}

// ─── Format date helpers ──────────────────────────────────────────────────────

function fmtDate(d: string | null): { short: string; day: string; time: string } {
  if (!d) return { short: "—", day: "", time: "" };
  try {
    // Handle "YYYY-MM-DD HH:mm:ss" format (no timezone — parse as local)
    const iso = d.replace(" ", "T");
    const dt = new Date(iso);
    if (isNaN(dt.getTime())) return { short: d.slice(5, 10).replace("-", "/"), day: "", time: "" };
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const day = DAYS_ID[dt.getDay()];
    const mon = MONTHS_SHORT[dt.getMonth() + 1];
    const hh = String(dt.getHours()).padStart(2, "0");
    const min = String(dt.getMinutes()).padStart(2, "0");
    return { short: `${dd}/${mm}`, day: `${day}, ${mon} ${dt.getFullYear()}`, time: `${hh}:${min}` };
  } catch { return { short: d.slice(5, 10).replace("-", "/"), day: "", time: "" }; }
}

// ─── Column grid ─────────────────────────────────────────────────────────────
// 32px expand | 1fr name+divisi | 240px progress | 80px aktivitas | 72px target | 64px sisa | 110px status
const GRID_COLS = "32px 1fr 240px 80px 72px 64px 110px";

// ─── AmRowControlled ──────────────────────────────────────────────────────────

function AmRowControlled({ am, kpiLabels, forceExpand }: {
  am: AmActivity; kpiLabels: Set<string>; forceExpand: boolean | null;
}) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (forceExpand !== null) setExpanded(forceExpand);
  }, [forceExpand]);

  const kpiCount = useMemo(() =>
    am.activities.filter(a =>
      kpiLabels.size > 0 ? (a.label ? kpiLabels.has(a.label) : false) : a.isKpi
    ).length,
    [am.activities, kpiLabels]
  );

  const nonKpiCount = am.activities.length - kpiCount;
  const pct = am.activities.length === 0 ? 0 : Math.min(Math.round(kpiCount / am.kpiTarget * 100), 100);
  const sisa = Math.max(am.kpiTarget - kpiCount, 0);
  const hasActs = am.activities.length > 0;

  const progressColor = pct >= 100
    ? "from-emerald-500 to-emerald-400"
    : pct >= 70
    ? "from-amber-500 to-amber-400"
    : "from-red-600 to-red-500";

  const progressTextColor = pct >= 100 ? "text-emerald-600 dark:text-emerald-400"
    : pct >= 70 ? "text-amber-600 dark:text-amber-400"
    : "text-red-600 dark:text-red-400";

  return (
    <div className="border-b border-border/50 last:border-b-0">
      {/* Summary row */}
      <div
        onClick={() => setExpanded(p => !p)}
        className={cn(
          "grid items-center px-4 py-3 cursor-pointer transition-colors group",
          expanded ? "bg-primary/5 border-b border-primary/10" : "hover:bg-secondary/40"
        )}
        style={{ gridTemplateColumns: GRID_COLS }}
      >
        {/* Expand icon */}
        <div className={cn(
          "w-6 h-6 rounded-lg border flex items-center justify-center text-xs font-bold shrink-0 transition-all",
          expanded
            ? "bg-primary border-primary text-white"
            : "bg-secondary border-border text-muted-foreground group-hover:border-primary/40 group-hover:text-primary/70"
        )}>
          {expanded ? "−" : "+"}
        </div>

        {/* Nama + divisi */}
        <div className="overflow-hidden pl-1">
          <div className="text-sm font-bold text-foreground truncate">{am.fullname}</div>
          <div className="text-xs font-semibold text-foreground/70 mt-0.5 flex items-center gap-1">
            <span>{am.divisi}</span>
            {!hasActs && <span className="text-foreground/40 font-normal italic text-[11px]">· tidak ada data</span>}
            {hasActs && <span className="text-foreground/60 font-semibold">· {am.activities.length} aktivitas</span>}
          </div>
        </div>

        {/* Progress bar — bigger, more readable */}
        <div className="pr-2">
          <div className="h-3.5 bg-secondary rounded-full overflow-hidden mb-1.5">
            <div
              className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-700", progressColor)}
              style={{ width: pct === 0 ? "0%" : `${Math.max(pct, 3)}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className={cn("text-sm font-black font-mono", progressTextColor)}>{pct}%</span>
            <span className={cn("text-xs font-bold font-mono", pct === 0 ? "text-foreground/50" : "text-foreground")}>
              {kpiCount}/{am.kpiTarget} aktivitas KPI
            </span>
          </div>
        </div>

        <div className="text-sm font-black text-foreground text-center tabular-nums">{kpiCount}</div>
        <div className="text-sm font-black text-foreground text-center tabular-nums">{am.kpiTarget}</div>
        <div className={cn("text-sm font-black text-center tabular-nums", sisa === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>
          {sisa === 0 ? "✓" : sisa}
        </div>
        <div><StatusBadge pct={pct} /></div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border/30 bg-secondary/20">
          {!hasActs ? (
            <div className="flex items-center gap-3 px-6 py-5 text-sm text-foreground/70">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span>AM ini tidak memiliki data aktivitas pada periode yang dipilih meski sudah dicari di data mentah.</span>
            </div>
          ) : (
            <>
              {/* Sub-header */}
              <div
                className="grid text-[10px] font-bold uppercase tracking-[0.6px] text-foreground/60 bg-secondary/50 border-b border-border/30"
                style={{ gridTemplateColumns: "28px 96px 1fr 150px 130px 64px", padding: "7px 16px 7px 56px" }}
              >
                <div>#</div><div>Tanggal</div><div>Pelanggan &amp; Catatan</div>
                <div>Tipe Aktivitas</div><div>Kategori</div><div>KPI</div>
              </div>

              {/* Activity rows */}
              {am.activities.map((act, i) => {
                const { short, day, time } = fmtDate(act.activityEndDate);
                const typeSty = getActivityTypeStyle(act.activityType);
                const labSty = getLabelStyle(act.label);
                const isKpiRow = kpiLabels.size > 0 ? (act.label ? kpiLabels.has(act.label) : false) : act.isKpi;
                return (
                  <div key={act.id}
                    className="grid items-start border-b border-border/20 last:border-b-0 hover:bg-secondary/30 transition-colors"
                    style={{ gridTemplateColumns: "28px 96px 1fr 150px 130px 64px", padding: "9px 16px 9px 56px" }}
                  >
                    {/* # */}
                    <div className="text-xs font-bold text-foreground/50 font-mono pt-0.5">{i + 1}</div>

                    {/* Tanggal */}
                    <div>
                      <div className="text-base font-black text-foreground font-mono leading-tight">{short}</div>
                      <div className="text-xs font-semibold text-foreground/80 mt-0.5">{day}</div>
                      {time && <div className="text-xs font-bold text-foreground/70 font-mono mt-0.5">{time}</div>}
                    </div>

                    {/* Pelanggan & Catatan */}
                    <div>
                      <div className="text-sm font-bold text-foreground">{act.caName || "–"}</div>
                      {act.activityNotes && (
                        <div className="text-sm font-medium text-foreground/70 mt-0.5 leading-snug">{act.activityNotes}</div>
                      )}
                    </div>

                    {/* Tipe Aktivitas */}
                    <div className="pt-0.5">
                      <span className="inline-flex px-2 py-0.5 rounded text-xs font-semibold"
                        style={{ background: typeSty.bg, color: typeSty.text }}>
                        {act.activityType || "–"}
                      </span>
                    </div>

                    {/* Kategori */}
                    <div className="pt-0.5">
                      <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold", labSty.cls)}>
                        {labSty.short}
                      </span>
                    </div>

                    {/* KPI */}
                    <div className="pt-0.5">
                      {isKpiRow
                        ? <span className="inline-flex text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded">✓ Ya</span>
                        : <span className="inline-flex text-xs font-bold text-foreground/50 bg-secondary px-2 py-0.5 rounded">✗ Tidak</span>
                      }
                    </div>
                  </div>
                );
              })}

              {/* Summary footer */}
              <div className="flex items-center gap-5 px-6 py-3 border-t-2 border-border bg-secondary/60">
                <span className="text-sm font-black text-foreground uppercase tracking-wide">Ringkasan:</span>
                <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                  ✓ {kpiCount} aktivitas memenuhi KPI
                </span>
                {nonKpiCount > 0 && (
                  <span className="text-sm font-semibold text-foreground/70">
                    ✗ {nonKpiCount} tidak memenuhi KPI
                  </span>
                )}
                <span className="ml-auto text-base font-black text-foreground">
                  {am.activities.length} aktivitas total
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ActivityPage() {
  const now = new Date();
  const [snapshotId, setSnapshotId] = useState<string>("");
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [divisi, setDivisi] = useState(DEFAULT_DIVISI);
  const [search, setSearch] = useState("");
  const [selectedAms, setSelectedAms] = useState<Set<string> | null>(null);
  const [selectedLabels, setSelectedLabels] = useState<Set<string> | null>(null);
  const [expandAll, setExpandAll] = useState<boolean | null>(null);
  const snapInitialized = useRef(false);
  const labelsInitialized = useRef(false);

  // ─── Snapshots ───────────────────────────────────────────────────────
  const { data: snapshots = [] } = useQuery<ActivitySnapshot[]>({
    queryKey: ["activity-snapshots"],
    queryFn: () => apiFetch<ActivitySnapshot[]>("/api/activity/snapshots"),
    staleTime: 60_000,
  });

  const snapshotOptions = useMemo(() =>
    (Array.isArray(snapshots) ? snapshots : []).map(s => ({ value: String(s.id), label: snapLabel(s) })),
    [snapshots]
  );

  // Auto-select snapshot terbaru saat pertama kali data muat
  useEffect(() => {
    if (!snapInitialized.current && snapshotOptions.length > 0) {
      snapInitialized.current = true;
      setSnapshotId(snapshotOptions[0].value);
    }
  }, [snapshotOptions]);

  // ─── Activity data ────────────────────────────────────────────────────
  const queryKey = useMemo(() => {
    const p = new URLSearchParams({ year, divisi });
    if (month !== "all") p.set("month", month);
    if (snapshotId) p.set("import_id", snapshotId);
    return `/api/activity?${p}`;
  }, [year, month, divisi, snapshotId]);

  const { data, isLoading, isError } = useQuery<ActivityData>({
    queryKey: [queryKey],
    queryFn: () => apiFetch<ActivityData>(queryKey),
    staleTime: 60_000,
    enabled: !!snapshotId,
  });

  const amOptions = useMemo(() =>
    (data?.masterAms ?? [])
      .filter(a => matchesDivisi(a.divisi, divisi))
      .map(a => a.nama)
      .sort((a, b) => a.localeCompare(b)),
    [data?.masterAms, divisi]
  );

  // Kumpulkan semua label dari aktivitas (termasuk "Tanpa Pelanggan")
  const labelOptions = useMemo(() => {
    const fromDistinct = data?.distinctLabels ?? [];
    const fromActivities = Array.from(new Set(
      (data?.byAm ?? []).flatMap(a => a.activities.map(act => act.label).filter(Boolean) as string[])
    ));
    const merged = Array.from(new Set([...fromDistinct, ...fromActivities]));
    return merged.sort((a, b) => {
      const aT = a.toLowerCase().includes("tanpa");
      const bT = b.toLowerCase().includes("tanpa");
      if (aT && !bT) return 1;
      if (!aT && bT) return -1;
      return a.localeCompare(b);
    });
  }, [data]);

  useEffect(() => {
    if (data && selectedAms === null) setSelectedAms(new Set(amOptions));
  }, [data, amOptions, selectedAms]);

  // Init kategori: hanya KPI (non-tanpa) yang tercentang default
  useEffect(() => {
    if (data && !labelsInitialized.current && labelOptions.length > 0) {
      labelsInitialized.current = true;
      const kpiOnly = new Set(labelOptions.filter(l => !l.toLowerCase().includes("tanpa")));
      setSelectedLabels(kpiOnly);
    }
  }, [data, labelOptions]);

  const filteredAms = useMemo(() => {
    if (!data) return [];
    const byAmMap = Object.fromEntries(data.byAm.map(a => [a.fullname, a]));
    const masterFiltered = (data.masterAms ?? [])
      .filter(a => matchesDivisi(a.divisi, divisi))
      .filter(a => selectedAms === null || selectedAms.has(a.nama))
      .filter(a => !search || a.nama.toLowerCase().includes(search.toLowerCase()));

    return masterFiltered.map(ma => {
      const existing = byAmMap[ma.nama];
      if (existing) return existing;
      return { nik: ma.nik, fullname: ma.nama, divisi: ma.divisi, kpiCount: 0, totalCount: 0, kpiTarget: 20, activities: [] };
    });
  }, [data, divisi, selectedAms, search]);

  const kpiLabels = useMemo(() => selectedLabels ?? new Set<string>(), [selectedLabels]);

  const stats = useMemo(() => {
    const totalKpi = filteredAms.reduce((s, a) => {
      return s + a.activities.filter(act =>
        kpiLabels.size > 0 ? (act.label ? kpiLabels.has(act.label) : false) : act.isKpi
      ).length;
    }, 0);
    const reach = filteredAms.filter(a => {
      const cnt = a.activities.filter(act =>
        kpiLabels.size > 0 ? (act.label ? kpiLabels.has(act.label) : false) : act.isKpi
      ).length;
      return cnt >= a.kpiTarget;
    }).length;
    const dgPelanggan = filteredAms.reduce((s, a) =>
      s + a.activities.filter(act => {
        if (!act.label) return false;
        const l = act.label.toLowerCase();
        return !l.includes("tanpa") && !l.includes("proyek");
      }).length, 0);
    const dgProyek = filteredAms.reduce((s, a) =>
      s + a.activities.filter(act => act.label && act.label.toLowerCase().includes("proyek")).length, 0);
    return { totalKpi, reach, below: filteredAms.length - reach, dgPelanggan, dgProyek };
  }, [filteredAms, kpiLabels]);

  const periodLabel = month === "all"
    ? `Tahun ${year}`
    : `${MONTHS_FULL[parseInt(month)]} ${year}`;

  const selectedAmSet = useMemo(
    () => selectedAms ?? new Set(amOptions),
    [selectedAms, amOptions]
  );
  const selectedLabelSet = useMemo(
    () => selectedLabels ?? new Set(labelOptions),
    [selectedLabels, labelOptions]
  );

  return (
    <div className="space-y-5">

      {/* ─── Filter Bar ─── */}
      <div className="bg-card border border-border rounded-xl shadow-sm p-4">
        <div className="flex items-end gap-3 flex-wrap">

          {/* Snapshot filter */}
          <SelectDropdown
            label="Snapshot"
            value={snapshotId}
            onChange={v => { setSnapshotId(v); setSelectedAms(null); labelsInitialized.current = false; setSelectedLabels(null); }}
            options={snapshotOptions.length > 0 ? snapshotOptions : [{ value: "", label: "Memuat..." }]}
            disabled={snapshotOptions.length === 0}
            className="w-44 shrink-0"
          />

          <PeriodeDropdown
            year={year} month={month}
            onYearChange={y => { setYear(y); setSelectedAms(null); }}
            onMonthChange={m => { setMonth(m); }}
            className="min-w-[180px]"
          />

          <SelectDropdown
            label="Divisi"
            value={divisi}
            onChange={v => { setDivisi(v); setSelectedAms(null); }}
            options={DIVISI_OPTIONS_WITH_ALL}
            className="min-w-[130px]"
          />

          <CheckboxDropdown
            label="Nama AM"
            options={amOptions}
            selected={selectedAmSet}
            onChange={setSelectedAms}
            summaryLabel="AM"
            placeholder="Semua AM"
            className="min-w-[160px] flex-1"
          />

          {labelOptions.length > 0 && (
            <CheckboxDropdown
              label="Kategori Aktivitas"
              options={labelOptions}
              selected={selectedLabelSet}
              onChange={setSelectedLabels}
              summaryLabel="kategori"
              placeholder="Semua Kategori"
              kpiBadge
              className="min-w-[180px]"
            />
          )}
        </div>
      </div>

      {/* ─── Overview Cards ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <OverviewCard
          icon={<Target className="w-5 h-5 text-primary" />}
          label="Total Aktivitas KPI"
          value={isLoading ? "—" : stats.totalKpi}
          sub={<>
            {!isLoading && (
              <span className="block">
                <span className="text-blue-600 font-semibold">{stats.dgPelanggan} dg pelanggan</span>
                {" · "}
                <span className="text-teal-600 font-semibold">{stats.dgProyek} dg proyek</span>
              </span>
            )}
          </>}
          accent="bg-primary/10"
        />
        <OverviewCard
          icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
          label="AM Capai KPI"
          value={isLoading ? "—" : stats.reach}
          sub={<>target <strong className="text-foreground">≥{filteredAms[0]?.kpiTarget ?? 20} aktivitas</strong> / bulan</>}
          accent="bg-emerald-100 dark:bg-emerald-950/30"
        />
        <OverviewCard
          icon={<AlertTriangle className="w-5 h-5 text-red-500" />}
          label="AM Di Bawah KPI"
          value={isLoading ? "—" : stats.below}
          sub={stats.below === 0 ? "Semua AM mencapai target 🎉" : `${stats.below} AM perlu perhatian lebih`}
          accent="bg-red-50 dark:bg-red-950/30"
        />
      </div>

      {/* ─── KPI Info note ─── */}
      <div className="flex items-start gap-2.5 text-sm font-medium text-foreground/80 bg-secondary/60 border border-border/60 rounded-xl px-4 py-3.5">
        <span className="mt-0.5 shrink-0 text-base">📌</span>
        <span>
          Progress KPI dihitung dari aktivitas kategori <strong className="text-primary font-bold">Dengan Pelanggan</strong> dan <strong className="text-primary font-bold">Pelanggan dengan Proyek</strong> saja. Kategori <strong className="text-primary font-bold">Tanpa Pelanggan</strong> tidak terhitung dalam capaian KPI.
        </span>
      </div>

      {/* ─── Table Section ─── */}
      <div className="bg-card border border-border rounded-xl shadow-sm">

        {/* Table toolbar */}
        <div className="px-4 py-3 border-b border-border bg-secondary/20 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Users className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-bold text-foreground">Monitoring KPI Aktivitas</span>
            <span className="bg-secondary border border-border text-foreground text-xs font-bold px-2 py-0.5 rounded-full shrink-0">
              {filteredAms.length} AM
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {/* Search bar — pindah ke sini dari filter bar */}
            <div className="h-8 flex items-center gap-2 bg-background border border-border rounded-lg px-3 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-colors min-w-[160px]">
              <Search className="w-3 h-3 text-muted-foreground shrink-0" />
              <input
                type="text" placeholder="Cari nama AM…"
                value={search} onChange={e => setSearch(e.target.value)}
                className="border-none outline-none text-xs text-foreground placeholder:text-muted-foreground/60 bg-transparent flex-1 min-w-0"
              />
            </div>
            {/* Toggle Expand/Collapse jadi 1 tombol */}
            <button
              onClick={() => setExpandAll(prev => prev === true ? false : true)}
              className="h-8 px-3 rounded-lg text-xs font-semibold border border-border bg-secondary hover:border-primary/40 hover:text-primary text-foreground transition-colors flex items-center gap-1.5"
            >
              {expandAll === true
                ? <><Minimize2 className="w-3 h-3" /> Collapse Semua</>
                : <><Expand className="w-3 h-3" /> Expand Semua</>
              }
            </button>
          </div>
        </div>

        {/* Table inner wrapper */}
        <div className="p-3">
        <div className="border border-border overflow-hidden">

        {/* Table header */}
        <div
          className="grid text-xs font-black uppercase tracking-wide text-white"
          style={{ background: "#B91C1C", gridTemplateColumns: GRID_COLS, padding: "10px 16px" }}
        >
          <div />
          <div className="pl-1">Nama AM</div>
          <div>Progress KPI</div>
          <div className="text-center">Aktivitas</div>
          <div className="text-center">Target</div>
          <div className="text-center">Sisa</div>
          <div>Status</div>
        </div>

        {/* Table body */}
        {isLoading ? (
          <div className="divide-y divide-border/50">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="grid items-center px-4 py-3"
                style={{ gridTemplateColumns: GRID_COLS }}>
                <div className="w-6 h-6 bg-secondary rounded-lg animate-pulse" />
                <div className="pl-1 space-y-1.5">
                  <div className="h-3.5 bg-secondary rounded animate-pulse w-48" />
                  <div className="h-2.5 bg-secondary/60 rounded animate-pulse w-20" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-3.5 bg-secondary rounded-full animate-pulse" />
                  <div className="h-2.5 bg-secondary/60 rounded animate-pulse w-20" />
                </div>
                {[...Array(4)].map((_, j) => (
                  <div key={j} className="h-4 bg-secondary rounded animate-pulse mx-1" />
                ))}
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <AlertTriangle className="w-7 h-7 text-destructive" />
            <p className="text-sm font-medium">Gagal memuat data aktivitas</p>
          </div>
        ) : filteredAms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <Users className="w-10 h-10 opacity-20" />
            <p className="text-sm font-medium">Tidak ada AM untuk filter yang dipilih</p>
          </div>
        ) : (
          filteredAms.map(am => (
            <AmRowControlled
              key={am.nik + am.fullname}
              am={am}
              kpiLabels={kpiLabels}
              forceExpand={expandAll}
            />
          ))
        )}
        </div>
        </div>
      </div>
    </div>
  );
}

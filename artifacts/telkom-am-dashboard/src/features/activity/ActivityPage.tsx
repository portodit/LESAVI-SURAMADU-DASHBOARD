import React, { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/shared/lib/utils";
import { Search, ChevronDownIcon } from "lucide-react";

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

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHS_FULL = ["","Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const MONTHS_SHORT = ["","Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agt","Sep","Okt","Nov","Des"];
const DAYS_ID = ["Min","Sen","Sel","Rab","Kam","Jum","Sab"];

const ACTIVITY_TYPE_STYLE: Record<string, { bg: string; text: string }> = {
  "Kunjungan":    { bg: "#e3f2fd", text: "#1565C0" },
  "Administrasi": { bg: "#f3e5f5", text: "#6a1b9a" },
  "Follow-up":    { bg: "#e8f5e9", text: "#2e7d32" },
  "Penawaran":    { bg: "#fff3e0", text: "#e65100" },
  "Koordinasi":   { bg: "#fce4ec", text: "#880e4f" },
  "Negosiasi":    { bg: "#e0f7fa", text: "#00695c" },
};

function getLabelStyle(label: string | null) {
  if (!label) return { cls: "bg-slate-100 text-slate-500", short: "—" };
  const l = label.toLowerCase();
  if (l.includes("tanpa")) return { cls: "bg-slate-100 text-slate-500", short: "Tanpa Pelanggan" };
  if (l.includes("proyek")) return { cls: "bg-teal-50 text-teal-700", short: "Dg Proyek" };
  return { cls: "bg-blue-50 text-blue-700", short: "Dg Pelanggan" };
}

function getActivityTypeStyle(type: string | null) {
  if (!type) return { bg: "#f1f5f9", text: "#475569" };
  return ACTIVITY_TYPE_STYLE[type] || { bg: "#f1f5f9", text: "#475569" };
}

// ─── API ─────────────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
async function apiFetch<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { credentials: "include" });
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

// ─── MultiSelect Dropdown ─────────────────────────────────────────────────────

interface MultiSelectProps {
  label: string;
  allLabel: string;
  options: { value: string; label: string; sub?: string }[];
  value: Set<string>;
  onChange: (v: Set<string>) => void;
  searchable?: boolean;
  kpiBadge?: boolean;
}

function MultiSelect({ label, allLabel, options, value, onChange, searchable, kpiBadge }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = options.filter(o => !search || o.label.toLowerCase().includes(search.toLowerCase()));
  const allSelected = value.size === options.length;

  const triggerLabel = useMemo(() => {
    if (value.size === 0) return "Tidak ada";
    if (value.size === options.length) return allLabel;
    if (value.size === 1) return [...value][0].split(" ")[0];
    return `${value.size} dipilih`;
  }, [value, options.length, allLabel]);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen(p => !p)}
        className={cn(
          "flex items-center gap-1.5 text-xs font-medium rounded-[7px] px-2.5 py-1.5 transition-all whitespace-nowrap",
          "bg-white/10 border border-white/15 text-white hover:bg-white/15 hover:border-white/25",
          open && "bg-white/15 border-white/40"
        )}
        style={{ minWidth: 120 }}
      >
        <span>{triggerLabel}</span>
        {!allSelected && value.size > 0 && (
          <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-px rounded-full ml-auto">{value.size}</span>
        )}
        <ChevronDownIcon className={cn("w-3 h-3 text-slate-400 ml-1 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute top-[calc(100%+6px)] left-0 bg-white border border-slate-200 rounded-[9px] shadow-xl z-[300] overflow-hidden min-w-[200px] animate-in fade-in slide-in-from-top-1 duration-150">
          {searchable && (
            <div className="p-2 border-b border-slate-100">
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari..."
                className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-500"
              />
            </div>
          )}
          <div className="flex border-b border-slate-100">
            <button onClick={() => { onChange(new Set(options.map(o => o.value))); }}
              className="flex-1 py-1.5 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 transition-colors">Pilih Semua</button>
            <div className="w-px bg-slate-100" />
            <button onClick={() => { onChange(new Set()); }}
              className="flex-1 py-1.5 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 transition-colors">Hapus Semua</button>
          </div>
          <div className="max-h-[220px] overflow-y-auto py-1">
            {filtered.map(o => (
              <label key={o.value} className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-slate-50 transition-colors">
                <input
                  type="checkbox"
                  checked={value.has(o.value)}
                  onChange={e => {
                    const next = new Set(value);
                    if (e.target.checked) next.add(o.value); else next.delete(o.value);
                    onChange(next);
                  }}
                  className="w-3.5 h-3.5 accent-blue-600 cursor-pointer flex-shrink-0"
                />
                <div>
                  <span className="text-xs font-medium text-slate-800">{o.label}</span>
                  {kpiBadge && !o.label.toLowerCase().includes("tanpa") && (
                    <span className="ml-1.5 bg-blue-50 text-blue-600 text-[9px] font-bold px-1 py-px rounded">KPI</span>
                  )}
                  {o.sub && <div className="text-[10px] text-slate-400">{o.sub}</div>}
                </div>
              </label>
            ))}
          </div>
          {kpiBadge && (
            <div className="px-3 py-2 border-t border-slate-100 bg-slate-50 text-[10px] text-slate-400 leading-relaxed">
              <span className="inline bg-blue-50 text-blue-600 text-[9px] font-bold px-1 rounded mr-1">KPI</span>
              = dihitung untuk capaian KPI aktivitas bulanan
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Select ───────────────────────────────────────────────────────────────────

function NavSelect({ value, onChange, options, minWidth = 80 }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; minWidth?: number;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="appearance-none bg-white/10 border border-white/15 rounded-[7px] px-2.5 py-1.5 pr-6 text-xs font-medium text-white cursor-pointer transition-all hover:bg-white/15 hover:border-white/25 focus:outline-none focus:border-white/40 focus:bg-white/15"
      style={{
        minWidth,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.5)' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 8px center",
      }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value} style={{ background: "#1a2d42", color: "white" }}>{o.label}</option>
      ))}
    </select>
  );
}

// ─── Overview Card ─────────────────────────────────────────────────────────────

function OvCard({ color, icon, label, value, sub }: {
  color: "blue" | "teal" | "red"; icon: string; label: string; value: number | string; sub: React.ReactNode;
}) {
  const cfg = {
    blue: { border: "border-blue-600", bar: "bg-blue-600", icon: "bg-blue-50", val: "text-blue-700" },
    teal: { border: "border-teal-600", bar: "bg-teal-600", icon: "bg-teal-50", val: "text-teal-700" },
    red:  { border: "border-red-500",  bar: "bg-red-500",  icon: "bg-red-50",  val: "text-red-600" },
  }[color];
  return (
    <div className={cn("bg-white rounded-[10px] border border-slate-200 shadow-sm p-4 relative overflow-hidden")}>
      <div className={cn("absolute top-0 left-0 right-0 h-[3px] rounded-t-[10px]", cfg.bar)} />
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-sm mb-2.5", cfg.icon)}>{icon}</div>
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.7px] mb-1">{label}</div>
      <div className={cn("text-3xl font-extrabold font-mono leading-none mb-1", cfg.val)}>{value}</div>
      <div className="text-[11px] text-slate-400">{sub}</div>
    </div>
  );
}


// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ pct }: { pct: number }) {
  if (pct >= 100) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700">✓ Tercapai</span>;
  if (pct >= 70)  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700">Mendekati</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-600">Di Bawah KPI</span>;
}

// ─── Format date helpers ──────────────────────────────────────────────────────

function fmtDate(d: string | null): { short: string; day: string } {
  if (!d) return { short: "—", day: "" };
  try {
    const dt = new Date(d);
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const day = DAYS_ID[dt.getDay()];
    const mon = MONTHS_SHORT[dt.getMonth() + 1];
    return { short: `${dd}/${mm}`, day: `${day}, ${mon} ${dt.getFullYear()}` };
  } catch { return { short: d.slice(5, 10).replace("-", "/"), day: "" }; }
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ActivityPage() {
  const now = new Date();
  const [year,  setYear]  = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [divisi, setDivisi] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedAms, setSelectedAms] = useState<Set<string> | null>(null);
  const [selectedLabels, setSelectedLabels] = useState<Set<string> | null>(null);
  const [expandAll, setExpandAll] = useState<boolean | null>(null);

  const yearOpts = [{ value: "2026", label: "2026" }, { value: "2025", label: "2025" }];
  const monthOpts = [
    { value: "all", label: "Semua Bulan" },
    ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: MONTHS_FULL[i + 1] })),
  ];
  const divisiOpts = [
    { value: "all", label: "Semua" },
    { value: "DPS", label: "DPS" },
    { value: "DSS", label: "DSS" },
  ];

  const queryKey = useMemo(() => {
    const p = new URLSearchParams({ year, divisi });
    if (month !== "all") p.set("month", month);
    return `/api/activity?${p}`;
  }, [year, month, divisi]);

  const { data, isLoading, isError } = useQuery<ActivityData>({
    queryKey: [queryKey],
    queryFn: () => apiFetch<ActivityData>(queryKey),
    staleTime: 60_000,
  });

  // ─── Sync multi-select defaults from data ────
  const amOptions = useMemo(() =>
    (data?.masterAms ?? [])
      .filter(a => divisi === "all" || a.divisi === divisi)
      .map(a => ({ value: a.nama, label: a.nama, sub: a.divisi }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [data?.masterAms, divisi]
  );

  const labelOptions = useMemo(() =>
    (data?.distinctLabels ?? []).map(l => ({ value: l, label: l })),
    [data?.distinctLabels]
  );

  useEffect(() => {
    if (data && selectedAms === null) setSelectedAms(new Set(amOptions.map(o => o.value)));
  }, [data, amOptions, selectedAms]);

  useEffect(() => {
    if (data && selectedLabels === null) {
      const kpiOnly = new Set(
        (data.distinctLabels ?? []).filter(l => !l.toLowerCase().includes("tanpa"))
      );
      setSelectedLabels(kpiOnly);
    }
  }, [data, selectedLabels]);

  // ─── Filtered AM list ────
  const filteredAms = useMemo(() => {
    if (!data) return [];
    const byAmMap = Object.fromEntries(data.byAm.map(a => [a.fullname, a]));
    const masterFiltered = (data.masterAms ?? [])
      .filter(a => divisi === "all" || a.divisi === divisi)
      .filter(a => selectedAms === null || selectedAms.has(a.nama))
      .filter(a => !search || a.nama.toLowerCase().includes(search.toLowerCase()));

    return masterFiltered.map(ma => {
      const existing = byAmMap[ma.nama];
      if (existing) return existing;
      return { nik: ma.nik, fullname: ma.nama, divisi: ma.divisi, kpiCount: 0, totalCount: 0, kpiTarget: 20, activities: [] };
    });
  }, [data, divisi, selectedAms, search]);

  // ─── KPI label set for counting ────
  const kpiLabels = useMemo(() =>
    selectedLabels ?? new Set<string>(),
    [selectedLabels]
  );

  // ─── Overview stats ────
  const stats = useMemo(() => {
    const totalKpi = filteredAms.reduce((s, a) => {
      const cnt = kpiLabels.size > 0
        ? a.activities.filter(act => act.label ? kpiLabels.has(act.label) : act.isKpi).length
        : a.activities.filter(act => act.isKpi).length;
      return s + cnt;
    }, 0);
    const reach = filteredAms.filter(a => {
      const cnt = kpiLabels.size > 0
        ? a.activities.filter(act => act.label ? kpiLabels.has(act.label) : act.isKpi).length
        : a.activities.filter(act => act.isKpi).length;
      return cnt >= a.kpiTarget;
    }).length;
    return { totalKpi, reach, below: filteredAms.length - reach };
  }, [filteredAms, kpiLabels]);

  // ─── Category options for filter (with KPI badge) ────
  const categoryOptions = useMemo(() =>
    labelOptions.map(o => ({
      value: o.value,
      label: o.label,
      sub: o.label.toLowerCase().includes("tanpa") ? "Tidak mempengaruhi KPI" : "Dihitung dalam progres KPI",
    })),
    [labelOptions]
  );

  const selectedCatSet = useMemo(
    () => selectedLabels ?? new Set(labelOptions.map(o => o.value)),
    [selectedLabels, labelOptions]
  );

  const selectedAmSet = useMemo(
    () => selectedAms ?? new Set(amOptions.map(o => o.value)),
    [selectedAms, amOptions]
  );

  // ─── Period label ────
  const periodLabel = month === "all"
    ? `Tahun ${year}`
    : `${MONTHS_FULL[parseInt(month)]} ${year}`;

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen text-sm text-slate-500">Memuat data aktivitas...</div>
  );
  if (isError || !data) return (
    <div className="flex items-center justify-center min-h-screen text-sm text-red-500">Gagal memuat data. Coba muat ulang halaman.</div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800" style={{ fontSize: 13 }}>

      {/* ─── Toolbar ─── */}
      <div
        className="sticky top-0 z-50 flex items-center gap-3 px-5 h-[54px] shadow-[0_2px_8px_rgba(0,0,0,0.25)] overflow-x-auto"
        style={{ background: "#0D1B2A" }}
      >
        {/* Logo */}
        <div className="w-[30px] h-[30px] bg-red-600 rounded-[6px] flex items-center justify-center font-black text-white text-sm flex-shrink-0">T</div>
        <div className="w-px h-[22px] bg-white/12 flex-shrink-0" />

        {/* Title */}
        <div className="flex-shrink-0">
          <div className="text-[10px] font-bold text-white/50 uppercase tracking-[0.4px]">LESA VI WITEL SURAMADU</div>
          <div className="text-[13px] font-bold text-white tracking-[0.2px]">AM SALES ACTIVITY REPORT</div>
        </div>
        <div className="w-px h-[22px] bg-white/12 flex-shrink-0" />

        {/* Filters */}
        <div className="flex items-center gap-2 flex-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>

          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[10px] font-bold text-white/45 uppercase tracking-[0.7px]">Tahun</span>
            <NavSelect value={year} onChange={setYear} options={yearOpts} minWidth={70} />
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[10px] font-bold text-white/45 uppercase tracking-[0.7px]">Bulan</span>
            <NavSelect value={month} onChange={setMonth} options={monthOpts} minWidth={110} />
          </div>

          <div className="w-px h-[22px] bg-white/12 flex-shrink-0" />

          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[10px] font-bold text-white/45 uppercase tracking-[0.7px]">Divisi</span>
            <NavSelect value={divisi} onChange={v => { setDivisi(v); setSelectedAms(null); }} options={divisiOpts} minWidth={80} />
          </div>

          <div className="w-px h-[22px] bg-white/12 flex-shrink-0" />

          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[10px] font-bold text-white/45 uppercase tracking-[0.7px]">Nama AM</span>
            <MultiSelect
              label="Nama AM" allLabel="Semua AM"
              options={amOptions}
              value={selectedAmSet}
              onChange={setSelectedAms}
              searchable
            />
          </div>

          <div className="w-px h-[22px] bg-white/12 flex-shrink-0" />

          {categoryOptions.length > 0 && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[10px] font-bold text-white/45 uppercase tracking-[0.7px]">Kategori</span>
              <MultiSelect
                label="Kategori" allLabel="Semua Kategori"
                options={categoryOptions}
                value={selectedCatSet}
                onChange={setSelectedLabels}
                kpiBadge
              />
            </div>
          )}
        </div>
      </div>

      {/* ─── Main Content ─── */}
      <div className="px-6 py-4 pb-10 max-w-screen-2xl mx-auto">

        {/* ─── Overview Cards ─── */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <OvCard
            color="blue" icon="📊"
            label="Total Aktivitas (KPI)"
            value={stats.totalKpi}
            sub={<>dari <b className="text-slate-600">{filteredAms.length}</b> Account Manager · {periodLabel}</>}
          />
          <OvCard
            color="teal" icon="✅"
            label="AM Capai KPI"
            value={stats.reach}
            sub={<>target <b className="text-slate-600">≥{filteredAms[0]?.kpiTarget ?? 20} aktivitas</b> / bulan</>}
          />
          <OvCard
            color="red" icon="⚠️"
            label="AM Di Bawah KPI"
            value={stats.below}
            sub={stats.below === 0 ? "Semua AM mencapai target 🎉" : `${stats.below} AM perlu perhatian lebih`}
          />
        </div>

        {/* ─── Table Header ─── */}
        <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              Monitoring KPI Aktivitas
              <span className="bg-slate-100 text-slate-500 text-[11px] font-semibold px-2 py-0.5 rounded-full">{filteredAms.length} AM</span>
            </div>
            <div className="mt-2 text-[10px] text-slate-400 leading-relaxed bg-slate-100 rounded-[6px] px-3 py-1.5 border-l-[3px] border-blue-200 max-w-xl">
              📌 Progress KPI dihitung dari aktivitas kategori{" "}
              <span className="font-bold text-blue-600">Dengan Pelanggan</span> dan{" "}
              <span className="font-bold text-blue-600">Pelanggan dengan Proyek</span> saja.
              Kategori <span className="font-bold">Tanpa Pelanggan</span> tidak terhitung dalam capaian KPI.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-[7px] px-2.5 py-1.5 focus-within:border-blue-500 transition-colors">
              <Search className="w-3 h-3 text-slate-400" />
              <input
                type="text"
                placeholder="Cari nama AM..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="border-none outline-none text-xs text-slate-800 placeholder:text-slate-400 bg-transparent w-40"
              />
            </div>
            <button
              className="px-3 py-1.5 rounded-[7px] text-[11px] font-semibold text-slate-600 border border-slate-200 bg-white hover:border-blue-500 hover:text-blue-600 transition-all whitespace-nowrap"
              onClick={() => setExpandAll(true)}
            >Expand Semua</button>
            <button
              className="px-3 py-1.5 rounded-[7px] text-[11px] font-semibold text-slate-600 border border-slate-200 bg-white hover:border-blue-500 hover:text-blue-600 transition-all whitespace-nowrap"
              onClick={() => setExpandAll(false)}
            >Collapse Semua</button>
          </div>
        </div>

        {/* ─── Table ─── */}
        <div className="bg-white rounded-[10px] border border-slate-200 shadow-sm overflow-hidden">
          {/* Header */}
          <div
            className="grid gap-2 px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-[0.6px] text-white/60"
            style={{ background: "#0D1B2A", gridTemplateColumns: "28px 1fr 200px 56px 56px 56px 96px" }}
          >
            <div />
            <div>Nama AM</div>
            <div>Progress KPI</div>
            <div>Aktivitas</div>
            <div>Target</div>
            <div>Sisa</div>
            <div>Status</div>
          </div>

          {/* Body */}
          {filteredAms.length === 0 ? (
            <div className="text-center py-10 text-sm text-slate-400">Tidak ada data untuk filter yang dipilih.</div>
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
  );
}

// ─── AmRowControlled (handles forceExpand) ────────────────────────────────────

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
  const pct = Math.min(Math.round(kpiCount / am.kpiTarget * 100), 100);
  const sisa = Math.max(am.kpiTarget - kpiCount, 0);
  const pctColor = pct >= 100 ? "#00897B" : pct >= 70 ? "#F57F17" : "#E8192C";
  const hasActs = am.activities.length > 0;

  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <div
        onClick={() => hasActs && setExpanded(p => !p)}
        className={cn(
          "grid gap-2 px-3.5 py-2.5 items-center transition-colors",
          hasActs ? "cursor-pointer" : "cursor-default",
          expanded ? "bg-blue-50/70 border-b border-blue-100" : "hover:bg-slate-50/80"
        )}
        style={{ gridTemplateColumns: "28px 1fr 200px 56px 56px 56px 96px" }}
      >
        <div className={cn(
          "w-[22px] h-[22px] rounded-[6px] border flex items-center justify-center text-xs font-bold flex-shrink-0 select-none transition-all",
          !hasActs ? "bg-slate-50 border-slate-200 text-slate-300"
            : expanded ? "bg-blue-600 border-blue-600 text-white"
            : "bg-white border-slate-300 text-slate-400"
        )}>
          {!hasActs ? "•" : expanded ? "−" : "+"}
        </div>

        <div className="overflow-hidden">
          <div className="text-xs font-bold text-slate-900 truncate">{am.fullname}</div>
          <div className="text-[10px] text-slate-400 mt-px">{am.divisi} · {am.activities.length} total aktivitas</div>
        </div>

        <div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-1">
            <div className="h-full rounded-full transition-all duration-700" style={{
              width: `${pct}%`,
              background: pct >= 100 ? "linear-gradient(90deg,#00897B,#26c6b9)" : pct >= 70 ? "linear-gradient(90deg,#F57F17,#ffb300)" : "linear-gradient(90deg,#E8192C,#ef5350)",
            }} />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[11px] font-bold font-mono" style={{ color: pctColor }}>{pct}%</span>
            <span className="text-[10px] text-slate-400 font-mono">{kpiCount}/{am.kpiTarget}</span>
          </div>
        </div>

        <div className="text-sm font-semibold font-mono text-slate-800">{kpiCount}</div>
        <div className="text-sm font-semibold font-mono text-slate-800">{am.kpiTarget}</div>
        <div className={cn("text-sm font-semibold font-mono", sisa === 0 ? "text-slate-300" : "text-slate-800")}>
          {sisa === 0 ? "✓" : sisa}
        </div>
        <div><StatusBadge pct={pct} /></div>
      </div>

      {expanded && hasActs && (
        <div className="border-t border-blue-100 bg-slate-50/80">
          <div
            className="grid gap-2 text-[9px] font-bold uppercase tracking-[0.6px] text-slate-400 bg-slate-100 border-b border-slate-200"
            style={{ gridTemplateColumns: "24px 80px 1fr 140px 110px 64px", padding: "6px 14px 6px 52px" }}
          >
            <div>#</div><div>Tanggal</div><div>Pelanggan & Catatan</div>
            <div>Tipe Aktivitas</div><div>Kategori</div><div>KPI</div>
          </div>
          {am.activities.map((act, i) => {
            const { short, day } = fmtDate(act.activityEndDate);
            const typeSty = getActivityTypeStyle(act.activityType);
            const labSty = getLabelStyle(act.label);
            const isKpiRow = kpiLabels.size > 0
              ? (act.label ? kpiLabels.has(act.label) : false)
              : act.isKpi;
            return (
              <div
                key={act.id}
                className="grid gap-2 items-start border-b border-slate-100 last:border-b-0 hover:bg-white transition-colors"
                style={{ gridTemplateColumns: "24px 80px 1fr 140px 110px 64px", padding: "8px 14px 8px 52px" }}
              >
                <div className="text-[10px] text-slate-400 font-mono pt-px">{i + 1}</div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-800 font-mono">{short}</div>
                  <div className="text-[10px] text-slate-400 mt-px">{day}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-900">{act.caName || "–"}</div>
                  {act.activityNotes && (
                    <div className="text-[10px] text-slate-400 mt-0.5 leading-snug line-clamp-2">{act.activityNotes}</div>
                  )}
                </div>
                <div>
                  <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: typeSty.bg, color: typeSty.text }}>
                    {act.activityType || "–"}
                  </span>
                </div>
                <div>
                  <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold", labSty.cls)}>
                    {labSty.short}
                  </span>
                </div>
                <div>
                  {isKpiRow
                    ? <span className="inline-flex text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded">✓ Ya</span>
                    : <span className="inline-flex text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">✗ Tidak</span>
                  }
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

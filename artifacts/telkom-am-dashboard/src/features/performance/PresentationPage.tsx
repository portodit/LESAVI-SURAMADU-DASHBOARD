import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { formatRupiah, formatRupiahFull, formatPercent, getStatusColor, getAchPct, cn } from "@/shared/lib/utils";
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  Line, ComposedChart, Legend, PieChart, Pie
} from "recharts";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { ChevronDown, ChevronLeft, ChevronRight, Camera, X, BarChart2, Filter, Activity, Check, Maximize2, Minimize2, Expand, Search } from "lucide-react";

const SLIDES = [
  { label: "Visualisasi Performa", icon: BarChart2 },
  { label: "AM Sales Funnel", icon: Filter },
  { label: "Sales Activity", icon: Activity },
];

const API_BASE = import.meta.env.VITE_API_URL ?? "";
const BASE_PATH = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const FUNNEL_PHASES = ["F0","F1","F2","F3","F4","F5"];
const FUNNEL_PHASE_LABELS: Record<string,string> = { F0:"Lead",F1:"Prospect",F2:"Quote",F3:"Negosiasi",F4:"Closing",F5:"Won/Closed" };
const FUNNEL_PHASE_COLORS: Record<string,string> = { F0:"#93c5fd",F1:"#3b82f6",F2:"#818cf8",F3:"#6366f1",F4:"#8b5cf6",F5:"#10b981" };

function fmtNilaiCompact(n: number): string {
  if (!n) return "–";
  if (n >= 1e12) return `${(n/1e12).toFixed(1)}T`;
  if (n >= 1e9) return `${(n/1e9).toFixed(1)}M`;
  if (n >= 1e6) return `${Math.round(n/1e6)} jt`;
  return `Rp${n.toLocaleString("id-ID")}`;
}
const MONTHS_LABEL = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const MONTHS_FULL  = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const TIPE_RANK = ["Ach MTD","Real Revenue","YTD"];
const TIPE_REVENUE = ["Reguler","Sustain","Scaling","NGTMA"];

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
function hasTypedColumn(target: any, real: any): boolean {
  return (target != null && target > 0) || (real != null && real > 0);
}
function getTypedRevenue(row: any, tipe: string): { target: number; real: number } {
  if (tipe === "Semua") return { target: row.targetRevenue ?? 0, real: row.realRevenue ?? 0 };
  if (tipe === "Reguler" && hasTypedColumn(row.targetReguler, row.realReguler)) return { target: row.targetReguler ?? 0, real: row.realReguler ?? 0 };
  if (tipe === "Sustain" && hasTypedColumn(row.targetSustain, row.realSustain)) return { target: row.targetSustain ?? 0, real: row.realSustain ?? 0 };
  if (tipe === "Scaling" && hasTypedColumn(row.targetScaling, row.realScaling)) return { target: row.targetScaling ?? 0, real: row.realScaling ?? 0 };
  if (tipe === "NGTMA" && hasTypedColumn(row.targetNgtma, row.realNgtma)) return { target: row.targetNgtma ?? 0, real: row.realNgtma ?? 0 };
  return sumKomponen(parseKomponen(row.komponenDetail), tipe);
}

// ─── TrophyCard ────────────────────────────────────────────────────────────────
function TrophyCard({ title, subtitle, am, value, realValue, targetValue, colorScheme }: {
  title: string; subtitle: string; am: any; value: string;
  realValue?: string; targetValue?: string; colorScheme: "gold" | "blue";
}) {
  const scheme = colorScheme === "gold"
    ? { icon: "🥇", bg: "from-amber-50 via-yellow-50 to-orange-50 dark:from-amber-950/30 dark:via-yellow-950/20 dark:to-orange-950/30", border: "border-amber-300 dark:border-amber-700", accent: "text-amber-700 dark:text-amber-400", valueClr: "text-amber-600 dark:text-amber-400" }
    : { icon: "🏅", bg: "from-blue-50 via-indigo-50 to-sky-50 dark:from-blue-950/30 dark:via-indigo-950/20 dark:to-sky-950/30", border: "border-blue-300 dark:border-blue-700", accent: "text-blue-700 dark:text-blue-400", valueClr: "text-blue-600 dark:text-blue-400" };
  if (!am) return (
    <div className={`rounded-xl bg-gradient-to-br ${scheme.bg} border ${scheme.border} p-4 min-h-[100px] flex flex-col justify-center`}>
      <p className={cn("text-xs font-black uppercase tracking-widest mb-1", scheme.accent)}>{title}</p>
      <p className="text-muted-foreground/50 text-sm">Belum ada data</p>
    </div>
  );
  return (
    <div className={`rounded-xl bg-gradient-to-br ${scheme.bg} border ${scheme.border} p-4 min-w-0`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className={cn("text-xs font-black uppercase tracking-widest leading-tight", scheme.accent)}>{title}</p>
          <p className="text-[10px] text-foreground font-medium mt-0.5">{subtitle}</p>
        </div>
        <span className="text-2xl leading-none">{scheme.icon}</span>
      </div>
      <p className="font-display font-bold text-sm text-foreground truncate mb-2" title={am.namaAm}>{am.namaAm}</p>
      <p className={cn("text-3xl font-display font-bold tabular-nums leading-none mb-2", scheme.valueClr)}>{value}</p>
      <div className="grid grid-cols-2 gap-1.5">
        <div className="border border-current/20 rounded-md px-2 py-1.5 bg-background/40">
          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">Real</p>
          <p className="text-[11px] font-bold text-foreground truncate">{realValue ?? "—"}</p>
        </div>
        <div className="border border-current/20 rounded-md px-2 py-1.5 bg-background/40">
          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">Target</p>
          <p className="text-[11px] font-bold text-foreground truncate">{targetValue ?? "—"}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Custom Tooltip for Trend Chart ────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const monthFull = payload[0]?.payload?.monthFull as string | undefined;
  const divisiLabel = payload[0]?.payload?.divisiLabel as string | undefined;
  const titleMonth = monthFull ?? label;
  const titlePrefix = divisiLabel ? `Revenue ${divisiLabel} – ` : "Revenue – ";
  return (
    <div className="bg-card border border-border rounded-xl p-3 shadow-lg text-xs space-y-1.5 min-w-[210px]">
      <p className="font-bold text-foreground mb-1 leading-snug">{titlePrefix}{titleMonth}</p>
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
function CheckboxDropdown({ label, options, selected, onChange, placeholder, labelFn, headerLabel, summaryLabel, className }: {
  label: string; options: string[]; selected: Set<string>; onChange: (next: Set<string>) => void;
  placeholder?: string; labelFn?: (v: string) => string; headerLabel?: string; summaryLabel?: string; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const dropRef = React.useRef<HTMLDivElement>(null);
  const lFn = labelFn ?? ((v: string) => v);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        dropRef.current && !dropRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const toggle = () => {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen(v => !v);
  };
  const displayLabel = selected.size === 0
    ? (placeholder || `Pilih ${label}`)
    : selected.size === options.length
      ? `Semua ${summaryLabel || label}`
      : selected.size === 1 ? lFn([...selected][0]) : `${selected.size} ${summaryLabel || label} dipilih`;
  return (
    <div className={cn("flex flex-col gap-0.5", className)} ref={triggerRef}>
      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>
      <button
        onClick={toggle}
        className="h-9 px-2 bg-secondary/50 border border-border rounded-md text-xs flex items-center gap-1 focus:ring-2 focus:ring-primary/20 focus:border-primary w-full whitespace-nowrap"
      >
        <span className="flex-1 text-left truncate">{displayLabel}</span>
        <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" />
      </button>
      {open && createPortal(
        <div
          ref={dropRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="bg-popover border border-border rounded-xl shadow-lg min-w-[180px] max-h-72 overflow-y-auto p-1.5"
        >
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-border mb-1">
            <span className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">{headerLabel || label}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => onChange(new Set(options))} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 hover:bg-primary/20 text-primary font-semibold transition-colors">Semua</button>
              <button onClick={() => onChange(new Set())} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary hover:bg-secondary/80 text-muted-foreground font-semibold transition-colors">Kosongkan</button>
            </div>
          </div>
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
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── SelectDropdown (single-select, matches CheckboxDropdown style) ─────────────
function SelectDropdown({ label, value, onChange, options, className, disabled }: {
  label?: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; className?: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const dropRef = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        dropRef.current && !dropRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const toggle = () => {
    if (!disabled) {
      if (triggerRef.current) {
        const r = triggerRef.current.getBoundingClientRect();
        setPos({ top: r.bottom + 4, left: r.left });
      }
      setOpen(v => !v);
    }
  };
  const current = options.find(o => o.value === value);
  return (
    <div className={cn("flex flex-col gap-0.5", className)} ref={triggerRef}>
      {label && <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>}
      <button
        onClick={toggle}
        disabled={disabled}
        className={cn(
          "h-9 px-2 bg-secondary/50 border border-border rounded-md text-xs flex items-center gap-1 w-full disabled:opacity-40 transition-colors",
          open && "border-primary/50 bg-secondary/70"
        )}
      >
        <span className="flex-1 text-left truncate">{current?.label ?? value}</span>
        <ChevronDown className={cn("w-3 h-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && createPortal(
        <div
          ref={dropRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="bg-popover border border-border rounded-xl shadow-lg min-w-[140px] max-h-60 overflow-y-auto py-1"
        >
          {options.map(opt => (
            <button key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); }}
              className={cn("w-full text-left px-3 py-1.5 text-xs hover:bg-secondary transition-colors flex items-center gap-2", opt.value === value && "font-semibold text-primary")}>
              <span className="w-3.5 shrink-0">{opt.value === value ? <Check className="w-3 h-3" /> : null}</span>
              {opt.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Funnel Slide (full mirror of FunnelPage) ────────────────────────────────────

const FS_PHASES = ["F0","F1","F2","F3","F4","F5"];
const FS_PHASE_LABELS: Record<string,string> = { F0:"Lead",F1:"Prospect",F2:"Quote",F3:"Negosiasi",F4:"Closing",F5:"Won/Closed" };
const FS_PHASE_COLORS: Record<string,{ pill:string; bar:string; text:string }> = {
  F0:{pill:"bg-sky-100 text-sky-800",bar:"#38bdf8",text:"#0369a1"},
  F1:{pill:"bg-blue-100 text-blue-800",bar:"#3b82f6",text:"#1d4ed8"},
  F2:{pill:"bg-indigo-100 text-indigo-800",bar:"#6366f1",text:"#4338ca"},
  F3:{pill:"bg-violet-100 text-violet-800",bar:"#7c3aed",text:"#5b21b6"},
  F4:{pill:"bg-orange-100 text-orange-800",bar:"#f97316",text:"#c2410c"},
  F5:{pill:"bg-emerald-100 text-emerald-800",bar:"#10b981",text:"#065f46"},
};
const FS_MONTHS_ID = ["","Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agt","Sep","Okt","Nov","Des"];

function fmtRupiahFS(n: number): string {
  if (!n && n!==0) return "–";
  if (n>=1e12) return `Rp ${(n/1e12).toFixed(2)}T`;
  if (n>=1e9)  return `Rp ${(n/1e9).toFixed(2)}M`;
  if (n>=1e6)  return `Rp ${Math.round(n/1e6)} jt`;
  return `Rp ${n.toLocaleString("id-ID")}`;
}
function fmtCompactFS(n: number): string {
  if (!n) return "–";
  if (n>=1e12) return `${(n/1e12).toFixed(1)}T`;
  if (n>=1e9)  return `${(n/1e9).toFixed(1)}M`;
  if (n>=1e6)  return `${Math.round(n/1e6)} jt`;
  return String(n);
}
function periodLabelFS(p: string): string {
  const [y,m] = p.split("-");
  return `${FS_MONTHS_ID[parseInt(m)]||m} ${y}`;
}

function FSSelectDropdown({ label, value, onChange, options, disabled, className }: {
  label?:string; value:string; onChange:(v:string)=>void;
  options:{value:string;label:string}[]; disabled?:boolean; className?:string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top:0, left:0, minW:0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const h=(e:MouseEvent)=>{
      if(triggerRef.current&&!triggerRef.current.contains(e.target as Node)&&
         dropRef.current&&!dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown",h); return()=>document.removeEventListener("mousedown",h);
  },[]);
  const toggle=()=>{
    if(disabled) return;
    if(triggerRef.current){const r=triggerRef.current.getBoundingClientRect();setPos({top:r.bottom+4,left:r.left,minW:r.width});}
    setOpen(o=>!o);
  };
  const current = options.find(o=>o.value===value);
  return (
    <div className={cn("flex flex-col gap-1",className)} ref={triggerRef}>
      {label&&<label className="text-xs font-display font-bold text-foreground uppercase tracking-wide">{label}</label>}
      <button type="button" onClick={toggle} disabled={disabled}
        className={cn("h-9 px-3 bg-secondary/50 border border-border rounded-lg text-sm flex items-center gap-1.5 w-full disabled:opacity-40 transition-colors text-left",open&&"border-primary/50 ring-2 ring-primary/20")}>
        <span className="flex-1 truncate font-medium text-foreground">{current?.label??value}</span>
        <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform",open&&"rotate-180")}/>
      </button>
      {open&&createPortal(
        <div ref={dropRef} style={{position:"fixed",top:pos.top,left:pos.left,minWidth:pos.minW,zIndex:9999}}
          className="bg-card border border-border rounded-xl shadow-xl max-h-64 overflow-y-auto py-1">
          {options.map(opt=>(
            <button key={opt.value} onClick={()=>{onChange(opt.value);setOpen(false);}}
              className={cn("w-full text-left px-3 py-2 text-sm hover:bg-secondary transition-colors flex items-center gap-2",
                opt.value===value?"font-semibold text-primary bg-primary/5":"text-foreground")}>
              {opt.value===value&&<span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0"/>}
              {opt.value!==value&&<span className="w-1.5 shrink-0"/>}
              {opt.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

function FSCheckboxDropdown({ label, options, selected, onChange, placeholder, labelFn, summaryLabel, className }: {
  label:string; options:string[]; selected:Set<string>; onChange:(n:Set<string>)=>void;
  placeholder?:string; labelFn?:(v:string)=>string; summaryLabel?:string; className?:string;
}) {
  const [open,setOpen] = useState(false);
  const [pos,setPos] = useState({top:0,left:0});
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const getLabel=(v:string)=>labelFn?labelFn(v):v;
  useEffect(()=>{
    const h=(e:MouseEvent)=>{
      if(triggerRef.current&&!triggerRef.current.contains(e.target as Node)&&
         dropRef.current&&!dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown",h); return()=>document.removeEventListener("mousedown",h);
  },[]);
  const toggleItem=(item:string)=>{const n=new Set(selected);if(n.has(item))n.delete(item);else n.add(item);onChange(n);};
  const toggleOpen=()=>{
    if(triggerRef.current){const r=triggerRef.current.getBoundingClientRect();setPos({top:r.bottom+4,left:r.left});}
    setOpen(o=>!o);
  };
  const unit=summaryLabel??"item";
  const displayText=selected.size===0?(placeholder??"Semua")
    :selected.size===options.length?`Semua ${unit}`
    :selected.size===1?getLabel([...selected][0])
    :`${selected.size} ${unit} dipilih`;
  return (
    <div className={cn("flex flex-col gap-1",className)} ref={triggerRef}>
      <label className="text-xs font-display font-bold text-foreground uppercase tracking-wide">{label}</label>
      <button type="button" onClick={toggleOpen} disabled={options.length===0}
        className={cn("h-9 px-3 bg-secondary/50 border border-border rounded-lg text-sm flex items-center gap-1.5 w-full disabled:opacity-40 transition-colors text-left",open&&"border-primary/50 ring-2 ring-primary/20")}>
        <span className="flex-1 truncate font-medium text-foreground">{displayText}</span>
        {selected.size>0&&selected.size<options.length&&(
          <span className="bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none shrink-0">{selected.size}</span>
        )}
        <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform",open&&"rotate-180")}/>
      </button>
      {open&&createPortal(
        <div ref={dropRef} style={{position:"fixed",top:pos.top,left:pos.left,zIndex:9999}}
          className="bg-card border border-border rounded-xl shadow-xl min-w-[200px] max-w-[260px] overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-secondary/30">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
            <div className="flex gap-1.5">
              <button onClick={()=>onChange(new Set(options))} className="text-[11px] text-primary font-semibold hover:underline">Semua</button>
              <span className="text-muted-foreground text-[11px]">·</span>
              <button onClick={()=>onChange(new Set())} className="text-[11px] text-muted-foreground font-semibold hover:underline">Kosongkan</button>
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {options.map(opt=>(
              <button key={opt} onClick={()=>toggleItem(opt)}
                className={cn("w-full text-left px-3 py-2 text-sm hover:bg-secondary flex items-center gap-2 transition-colors",
                  selected.has(opt)?"font-semibold text-primary bg-primary/5":"text-foreground")}>
                <span className={cn("w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center",selected.has(opt)?"bg-primary border-primary":"border-border")}>
                  {selected.has(opt)&&<span className="text-white text-[8px] font-black">✓</span>}
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

const FS_MONTH_NUMS = ["01","02","03","04","05","06","07","08","09","10","11","12"];

function FSPeriodeTreeDropdown({ label, filterYear, filterMonths, availableYears, onChange, className }: {
  label?: string;
  filterYear: string;
  filterMonths: Set<string>;
  availableYears: string[];
  onChange: (year: string, months: Set<string>) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set([filterYear]));
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(()=>{
    const h=(e:MouseEvent)=>{
      if(
        triggerRef.current&&!triggerRef.current.contains(e.target as Node)&&
        dropRef.current&&!dropRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown",h); return()=>document.removeEventListener("mousedown",h);
  },[]);

  useEffect(()=>{
    setExpandedYears(prev=>new Set([...prev,filterYear]));
  },[filterYear]);

  const years = availableYears.length > 0 ? availableYears : [filterYear];

  const toggle = () => {
    if(triggerRef.current){
      const r=triggerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom+4, left: r.left });
    }
    setOpen(o=>!o);
  };

  const toggleExpand = (yr:string, e:React.MouseEvent) => {
    e.stopPropagation();
    setExpandedYears(prev=>{ const n=new Set(prev); n.has(yr)?n.delete(yr):n.add(yr); return n; });
  };

  const selectYear = (yr:string) => onChange(yr, new Set());

  const toggleMonth = (yr:string, mo:string) => {
    if(yr!==filterYear){ onChange(yr, new Set([mo])); return; }
    const n=new Set(filterMonths); n.has(mo)?n.delete(mo):n.add(mo); onChange(yr,n);
  };

  const displayText = filterMonths.size===0
    ? `${filterYear} (semua bulan)`
    : filterMonths.size===1
    ? `${FS_MONTHS_ID[parseInt([...filterMonths][0])]||[...filterMonths][0]} ${filterYear}`
    : `${filterYear} · ${filterMonths.size} bulan`;

  return (
    <div className={cn("flex flex-col gap-1",className)} ref={triggerRef}>
      {label&&<label className="text-xs font-display font-bold text-foreground uppercase tracking-wide">{label}</label>}
      <button type="button" onClick={toggle}
        className={cn("h-9 px-3 bg-secondary/50 border border-border rounded-lg text-sm flex items-center gap-1.5 w-full transition-colors text-left",open&&"border-primary/50 ring-2 ring-primary/20")}>
        <span className="flex-1 truncate font-medium text-foreground">{displayText}</span>
        {filterMonths.size>0&&(
          <span className="bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none shrink-0">{filterMonths.size}</span>
        )}
        <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform",open&&"rotate-180")}/>
      </button>
      {open&&createPortal(
        <div ref={dropRef} style={{ position:"fixed", top:pos.top, left:pos.left, zIndex:9999 }}
          className="bg-card border border-border rounded-xl shadow-xl w-52 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-secondary/30">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Periode</span>
            <button onClick={()=>onChange(filterYear,new Set())} className="text-[11px] text-primary font-semibold hover:underline">Reset</button>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {years.map(yr=>{
              const isActive=yr===filterYear;
              const allSel=isActive&&filterMonths.size===0;
              const someSel=isActive&&filterMonths.size>0;
              const exp=expandedYears.has(yr);
              return (
                <div key={yr}>
                  <div className="flex items-center gap-1 px-2 py-1.5 hover:bg-secondary/40 transition-colors">
                    <button type="button" onClick={e=>toggleExpand(yr,e)}
                      className="p-0.5 text-muted-foreground hover:text-foreground shrink-0">
                      <ChevronRight className={cn("w-3 h-3 transition-transform",exp&&"rotate-90")}/>
                    </button>
                    <label className="flex items-center gap-2 flex-1 cursor-pointer select-none">
                      <input type="checkbox" checked={allSel}
                        ref={el=>{if(el)el.indeterminate=someSel;}}
                        onChange={()=>selectYear(yr)}
                        className="w-3.5 h-3.5 accent-primary cursor-pointer"/>
                      <span className={cn("text-sm font-semibold",isActive?"text-primary":"text-foreground")}>{yr}</span>
                    </label>
                  </div>
                  {exp&&(
                    <div className="ml-6 pb-1">
                      {FS_MONTH_NUMS.map((mo,idx)=>{
                        const checked=isActive&&filterMonths.has(mo);
                        return (
                          <label key={mo} className="flex items-center gap-2 px-2 py-1 hover:bg-secondary/30 cursor-pointer rounded select-none">
                            <input type="checkbox" checked={checked} onChange={()=>toggleMonth(yr,mo)}
                              className="w-3.5 h-3.5 accent-primary cursor-pointer"/>
                            <span className={cn("text-sm",checked?"text-foreground font-medium":"text-muted-foreground")}>
                              {FS_MONTHS_ID[idx+1]}
                            </span>
                          </label>
                        );
                      })}
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

function FSGauge({ pct, targetHo, targetFullHo, real, mode }: { pct:number; targetHo:number; targetFullHo:number; real:number; mode:"ho"|"fullho" }) {
  const clamp=Math.min(Math.max(pct,0),100);
  const r=54,cx=80,cy=70;
  const startAngle=-210,endAngle=30,totalDeg=endAngle-startAngle;
  const fillDeg=(clamp/100)*totalDeg;
  const toRad=(d:number)=>(d*Math.PI)/180;
  const arc=(start:number,end:number,radius:number)=>{
    const s=toRad(start),e=toRad(end);
    const x1=cx+radius*Math.cos(s),y1=cy+radius*Math.sin(s);
    const x2=cx+radius*Math.cos(e),y2=cy+radius*Math.sin(e);
    const large=end-start>180?1:0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
  };
  const color=clamp>=100?"#10b981":clamp>=75?"#3b82f6":clamp>=50?"#f59e0b":"#CC0000";
  const activeTarget=mode==="ho"?targetHo:targetFullHo;
  const hasTarget=activeTarget>0;
  const startX=cx+r*Math.cos(toRad(startAngle));
  const startY=cy+r*Math.sin(toRad(startAngle));
  const endX=cx+r*Math.cos(toRad(endAngle));
  const endY=cy+r*Math.sin(toRad(endAngle));
  return (
    <div className="flex items-center gap-4">
      <div className="shrink-0">
        <svg width="180" height="130" viewBox="0 0 160 115">
          <path d={arc(startAngle,endAngle,r)} fill="none" stroke="#e5e7eb" strokeWidth="18" strokeLinecap="round"/>
          {hasTarget&&clamp>0&&<path d={arc(startAngle,startAngle+fillDeg,r)} fill="none" stroke={color} strokeWidth="18" strokeLinecap="round"/>}
          {hasTarget?(
            <>
              <text x={cx} y={cy-4} textAnchor="middle" fontSize="22" fontWeight="800" fill={color} fontFamily="ui-monospace,monospace">{clamp.toFixed(1)}%</text>
              <text x={cx} y={cy+12} textAnchor="middle" fontSize="9" fill="#6b7280">CAPAIAN</text>
            </>
          ):(
            <>
              <text x={cx} y={cy-4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#6b7280">Target</text>
              <text x={cx} y={cy+10} textAnchor="middle" fontSize="10" fill="#9ca3af">belum diset</text>
            </>
          )}
          <text x={startX} y={startY+13} textAnchor="middle" fontSize="8" fill="#9ca3af">0%</text>
          <text x={endX} y={endY+13} textAnchor="middle" fontSize="8" fill="#9ca3af">100%</text>
        </svg>
      </div>
      <div className="flex-1 space-y-2 text-sm">
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground text-xs">Real Pipeline</span>
          <span className="font-bold text-foreground tabular-nums">{fmtRupiahFS(real)}</span>
        </div>
        {hasTarget&&(
          <>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-xs">{mode==="ho"?"Target HO":"Target Full HO"}</span>
              <span className="tabular-nums text-foreground">{fmtRupiahFS(activeTarget)}</span>
            </div>
            <div className="pt-1.5 border-t border-border flex justify-between items-center">
              <span className={cn("text-xs font-bold",real>=activeTarget?"text-emerald-600":"text-gray-900 dark:text-white")}>
                {real>=activeTarget?"Kelebihan":"Kekurangan"}
              </span>
              <span className={cn("font-bold tabular-nums text-sm",real>=activeTarget?"text-emerald-600":"text-gray-900 dark:text-white")}>
                {real>=activeTarget?"+":"-"}{fmtRupiahFS(Math.abs(activeTarget-real))}
              </span>
            </div>
          </>
        )}
        {!hasTarget&&(
          <p className="text-xs text-muted-foreground">Target belum diset — import di menu Import Data</p>
        )}
      </div>
    </div>
  );
}

function FSFaseBarChart({ data }: { data:any }) {
  if(!data) return null;
  const phaseMap: Record<string,{count:number;nilai:number}> = {};
  for(const p of FS_PHASES) phaseMap[p]={count:0,nilai:0};
  for(const s of (data.byStatus||[])) { if(phaseMap[s.status]){phaseMap[s.status].count=s.count;phaseMap[s.status].nilai=s.totalNilai;} }
  const maxCount=Math.max(...FS_PHASES.map(p=>phaseMap[p].count),1);
  return (
    <div className="space-y-2">
      {FS_PHASES.map(phase=>{
        const d=phaseMap[phase]; const pct=(d.count/maxCount)*100; const c=FS_PHASE_COLORS[phase];
        return (
          <div key={phase} className="flex items-center gap-2">
            <div className="w-6 shrink-0">
              <span className="text-xs font-black font-mono" style={{color:c.text}}>{phase}</span>
            </div>
            <div className="flex-1 bg-secondary rounded h-6 overflow-hidden">
              <div className="h-full rounded transition-all duration-500" style={{width:`${Math.max(pct,2)}%`,backgroundColor:c.bar}}/>
            </div>
            <span className="text-xs font-black font-mono w-16 shrink-0" style={{color:c.text}}>
              {d.count} proyek
            </span>
            <span className="text-xs font-bold font-mono text-muted-foreground w-20 text-right shrink-0">{fmtCompactFS(d.nilai)}</span>
          </div>
        );
      })}
    </div>
  );
}

function FSKpiGrid({ data }: { data:any }) {
  if(!data) return null;
  const kpis = [
    {label:"Total LOP",value:data.totalLop?.toLocaleString("id-ID"),sub:(data.unidentifiedLops||0)>0?`${data.unidentifiedLops} tdk teridentifikasi`:"proyek aktif",color:"text-foreground"},
    {label:"Total Nilai Pipeline",value:fmtCompactFS(data.totalNilai),sub:"nilai seluruh LOP",color:"text-blue-600"},
    {label:"Aktif AM",value:String(data.amCount),sub:"account manager teridentifikasi",color:"text-violet-600"},
    {label:"Jumlah Pelanggan",value:data.pelangganCount?.toLocaleString("id-ID"),sub:"unique customer",color:"text-amber-600"},
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {kpis.map(k=>(
        <div key={k.label} className="bg-secondary/50 border border-border rounded-xl p-3">
          <div className="text-xs font-bold text-foreground uppercase tracking-wide mb-1">{k.label}</div>
          <div className={cn("text-3xl font-black font-mono leading-tight",k.color)}>{k.value}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{k.sub}</div>
        </div>
      ))}
    </div>
  );
}

function FunnelSlide({ onTitleChange }: { onTitleChange?: (t: string) => void }) {
  const [filterYear,setFilterYear] = useState("2026");
  const [filterMonths,setFilterMonths] = useState<Set<string>>(new Set());
  const [importId,setImportId] = useState<number|null>(null);
  const [filterDivisi,setFilterDivisi] = useState("all");
  const [filterStatus,setFilterStatus] = useState<Set<string>>(new Set());
  const [filterKontrak,setFilterKontrak] = useState<Set<string>>(new Set());
  const [filterAm,setFilterAm] = useState<Set<string>>(new Set());
  const [search,setSearch] = useState("");
  const [expandedAm,setExpandedAm] = useState<Record<string,boolean>>({});
  const [expandedPhase,setExpandedPhase] = useState<Record<string,boolean>>({});
  const [allExpanded,setAllExpanded] = useState(false);
  const [targetHoOverride,setTargetHoOverride] = useState("");
  const [targetFullHoOverride,setTargetFullHoOverride] = useState("");

  const { data: snapshots = [] } = useQuery<any[]>({
    queryKey:["funnel-snapshots-pres"],
    queryFn:async()=>{const r=await fetch(`${BASE_PATH}/api/funnel/snapshots`,{credentials:"include"});return r.json();},
    staleTime:60_000,
  });

  const yearOptions = useMemo(()=>{
    const snapsArr = Array.isArray(snapshots) ? snapshots : [];
    const years=[...new Set(snapsArr.map((s:any)=>s.period.slice(0,4)))].sort().reverse() as string[];
    if(years.length===0) return [{value:"2026",label:"2026"}];
    return years.map(y=>({value:y,label:y}));
  },[snapshots]);

  const [navbarPortalEl, setNavbarPortalEl] = useState<HTMLElement | null>(null);
  useEffect(()=>{
    const el = document.getElementById("funnel-navbar-portal");
    if(el) setNavbarPortalEl(el);
  },[]);

  const snapshotOptions = useMemo(()=>
    (Array.isArray(snapshots) ? snapshots : []).filter((s:any)=>{
      if(!s.period.startsWith(filterYear)) return false;
      if(filterMonths.size>0&&!filterMonths.has(s.period.slice(5,7))) return false;
      return true;
    }).map((s:any)=>({value:String(s.id),label:`${periodLabelFS(s.period)} (${s.rowsImported?.toLocaleString()} LOP)`}))
  ,[snapshots,filterYear,filterMonths]);

  useEffect(()=>{if(yearOptions.length>0)setFilterYear(yearOptions[0].value);},[yearOptions.length]);
  useEffect(()=>{ if(snapshotOptions.length>0 && importId===null) setImportId(Number(snapshotOptions[0].value)); },[snapshotOptions, importId]);

  const funnelParams = useMemo(()=>{
    const p=new URLSearchParams();
    if(importId) p.set("import_id",String(importId));
    if(filterDivisi!=="all") p.set("divisi",filterDivisi);
    p.set("tahun",filterYear);
    return p.toString();
  },[importId,filterDivisi,filterYear]);

  const {data,isLoading} = useQuery<any>({
    queryKey:["funnel-data-pres",funnelParams],
    queryFn:async()=>{const r=await fetch(`${BASE_PATH}/api/funnel?${funnelParams}`,{credentials:"include"});return r.json();},
    enabled:importId!==null||(Array.isArray(snapshots)&&snapshots.length===0),
    staleTime:30_000,
  });

  const amOptions = useMemo(()=>{
    if(!data) return [];
    const map=new Map<string,string>();
    for(const l of (data.lops||[])){if(l.nikAm&&l.namaAm&&l.namaAm.trim()!=="")map.set(l.nikAm,l.namaAm);}
    return Array.from(map.keys()).sort((a,b)=>(map.get(a)||"").localeCompare(map.get(b)||""));
  },[data]);
  const amLabelFn = useMemo(()=>{
    if(!data) return (v:string)=>v;
    const map=new Map<string,string>();
    for(const l of (data.lops||[])){if(l.nikAm&&l.namaAm)map.set(l.nikAm,l.namaAm);}
    return (nik:string)=>map.get(nik)||nik;
  },[data]);
  const kontrakOptions = useMemo(()=>{
    if(!data) return [];
    return [...new Set((data.lops||[]).map((l:any)=>l.kategoriKontrak).filter(Boolean) as string[])].sort();
  },[data]);

  const filteredLops = useMemo(()=>{
    if(!data) return [];
    const q=search.toLowerCase();
    return (data.lops||[]).filter((l:any)=>{
      if(filterAm.size>0&&(!l.nikAm||!filterAm.has(l.nikAm))) return false;
      if(filterStatus.size>0&&(!l.statusF||!filterStatus.has(l.statusF))) return false;
      if(filterKontrak.size>0&&(!l.kategoriKontrak||!filterKontrak.has(l.kategoriKontrak))) return false;
      if(q){const hay=`${l.judulProyek} ${l.pelanggan} ${l.lopid} ${l.namaAm}`.toLowerCase();if(!hay.includes(q))return false;}
      return true;
    });
  },[data,filterAm,filterStatus,filterKontrak,search]);

  const groupedByAm = useMemo(()=>{
    const amMap=new Map<string,{namaAm:string;nikAm:string;divisi:string;phases:Map<string,any[]>}>();
    for(const l of filteredLops){
      const key=l.nikAm||l.namaAm||"Unknown";
      if(!amMap.has(key)) amMap.set(key,{namaAm:l.namaAm||key,nikAm:l.nikAm||"",divisi:l.divisi||"",phases:new Map()});
      const e=amMap.get(key)!;
      const phase=l.statusF||"Unknown";
      if(!e.phases.has(phase)) e.phases.set(phase,[]);
      e.phases.get(phase)!.push(l);
    }
    return Array.from(amMap.values()).sort((a,b)=>{
      const totA=Array.from(a.phases.values()).flat().reduce((s:number,l:any)=>s+(l.nilaiProyek||0),0);
      const totB=Array.from(b.phases.values()).flat().reduce((s:number,l:any)=>s+(l.nilaiProyek||0),0);
      return totB-totA;
    });
  },[filteredLops]);

  useEffect(()=>{
    const t=filterDivisi==="all"?"HO / FULL HO":filterDivisi==="DPS"?"HO":"FULL HO";
    onTitleChange?.(t);
  },[filterDivisi,onTitleChange]);

  const lastAutoExpandIdFS = useRef<number|null>(undefined as any);
  useEffect(()=>{
    if(groupedByAm.length===0) return;
    if(importId===lastAutoExpandIdFS.current) return;
    lastAutoExpandIdFS.current=importId;
    const ak:Record<string,boolean>={};
    for(const am of groupedByAm) ak[am.nikAm||am.namaAm]=true;
    setExpandedAm(ak); setExpandedPhase({}); setAllExpanded(false);
  },[groupedByAm,importId]);

  function handleToggleAll(){
    const next=!allExpanded;
    setAllExpanded(next);
    if(next){
      const ak:Record<string,boolean>={},pk:Record<string,boolean>={};
      for(const am of groupedByAm){
        ak[am.nikAm||am.namaAm]=true;
        for(const[ph] of am.phases) pk[`${am.nikAm||am.namaAm}|${ph}`]=true;
      }
      setExpandedAm(ak); setExpandedPhase(pk);
    } else { setExpandedAm({}); setExpandedPhase({}); }
  }

  function toggleAmRow(key:string){
    setExpandedAm(p=>({...p,[key]:!p[key]}));
  }
  function handleAmExpandIcon(amKey:string, phases:string[]){
    const isNowExpanding=!expandedAm[amKey];
    setExpandedAm(p=>({...p,[amKey]:isNowExpanding}));
    if(isNowExpanding){
      const pk:Record<string,boolean>={};
      for(const ph of phases) pk[`${amKey}|${ph}`]=true;
      setExpandedPhase(p=>({...p,...pk}));
    } else {
      setExpandedPhase(p=>{
        const n={...p};
        for(const ph of phases) delete n[`${amKey}|${ph}`];
        return n;
      });
    }
  }
  function togglePhaseRow(key:string){setExpandedPhase(p=>({...p,[key]:!p[key]}));}

  const effectiveTargetHo=targetHoOverride?parseFloat(targetHoOverride)*1e9:(data?.targetHo||0);
  const effectiveTargetFullHo=targetFullHoOverride?parseFloat(targetFullHoOverride)*1e9:(data?.targetFullHo||0);
  const pct=effectiveTargetFullHo?((data?.realFullHo||0)/effectiveTargetFullHo)*100:0;
  const hasActiveFilter=filterAm.size>0||filterStatus.size>0||filterKontrak.size>0||filterDivisi!=="all";
  const lopBadge=filteredLops.length!==(data?.totalLop||0)?`${filteredLops.length} / ${data?.totalLop||0}`:filteredLops.length.toLocaleString("id-ID");

  const navbarFilterBar = (
    <div className="flex items-end gap-2 flex-nowrap overflow-x-auto">
      <FSSelectDropdown label="Snapshot" value={String(importId||"")} onChange={v=>setImportId(Number(v))}
        options={snapshotOptions.length>0?snapshotOptions:[{value:"",label:"Belum ada data"}]}
        disabled={snapshotOptions.length===0} className="w-36 shrink-0"/>
      <FSPeriodeTreeDropdown label="Periode"
        filterYear={filterYear} filterMonths={filterMonths}
        availableYears={yearOptions.map(o=>o.value)}
        onChange={(y,ms)=>{setFilterYear(y);setFilterMonths(ms);setImportId(null);}}
        className="w-44 shrink-0"/>
      <div className="w-px h-9 bg-border/60 self-end shrink-0"/>
      <FSSelectDropdown label="Divisi" value={filterDivisi} onChange={setFilterDivisi}
        options={[{value:"all",label:"Semua Divisi"},{value:"DPS",label:"DPS"},{value:"DSS",label:"DSS"}]}
        className="w-32 shrink-0"/>
      {kontrakOptions.length>0&&(
        <FSCheckboxDropdown label="Kategori Kontrak" options={kontrakOptions} selected={filterKontrak} onChange={setFilterKontrak}
          placeholder="Semua kontrak" summaryLabel="kontrak" className="w-36 shrink-0"/>
      )}
      <FSCheckboxDropdown label="Status Funnel" options={FS_PHASES} selected={filterStatus} onChange={setFilterStatus}
        placeholder="Semua status" labelFn={p=>`${p} – ${FS_PHASE_LABELS[p]}`} summaryLabel="status" className="w-36 shrink-0"/>
      {hasActiveFilter&&(
        <div className="flex flex-col gap-1 shrink-0">
          <label className="text-xs font-bold text-transparent uppercase">.</label>
          <button onClick={()=>{setFilterStatus(new Set());setFilterKontrak(new Set());setFilterDivisi("all");}}
            className="h-9 flex items-center gap-1 px-3 text-sm text-destructive border border-destructive/30 rounded-lg hover:bg-destructive/5 transition-colors whitespace-nowrap">
            <X className="w-3.5 h-3.5"/> Reset
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      {navbarPortalEl && createPortal(navbarFilterBar, navbarPortalEl)}

      {/* Row 1: LOP per Fase + Capaian Real */}
      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[0,1].map(i=><div key={i} className="bg-card border border-border rounded-xl h-52 animate-pulse"/>)}
          </div>
          <div className="bg-card border border-border rounded-xl h-28 animate-pulse"/>
        </div>
      ):(
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
              <h3 className="text-sm font-display font-semibold text-foreground mb-3">LOP per Fase</h3>
              <FSFaseBarChart data={data}/>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
              <h3 className="text-sm font-display font-semibold text-foreground mb-2">Capaian Real vs Target Full HO</h3>
              <FSGauge pct={pct} targetHo={effectiveTargetHo} targetFullHo={effectiveTargetFullHo} real={data?.realFullHo||0} mode="fullho"/>
            </div>
          </div>
          {/* Row 2: Ringkasan */}
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <h3 className="text-sm font-display font-semibold text-foreground mb-3">Ringkasan</h3>
            <FSKpiGrid data={data}/>
          </div>
        </div>
      )}

      {/* Detail Table */}
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-display font-semibold text-foreground flex items-center gap-2">
            Detail Funnel per AM
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <FSCheckboxDropdown label="" options={amOptions} selected={filterAm} onChange={setFilterAm}
              placeholder="Semua AM" labelFn={amLabelFn} summaryLabel="AM" className="w-40 shrink-0"/>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none"/>
              <input type="text" placeholder="Cari proyek / pelanggan / LOP ID…" value={search} onChange={e=>setSearch(e.target.value)}
                className="pl-8 pr-7 py-1.5 text-sm bg-background border border-border rounded-lg w-56 focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/60"/>
              {search&&<button onClick={()=>setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5"/></button>}
            </div>
            {filterAm.size>0&&(
              <button onClick={()=>setFilterAm(new Set())} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 px-2 py-1.5 border border-border rounded-lg hover:border-destructive/30 transition-colors">
                <X className="w-3 h-3"/> Reset AM
              </button>
            )}
            <button onClick={handleToggleAll}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap">
              {allExpanded?<Minimize2 className="w-3.5 h-3.5"/>:<Expand className="w-3.5 h-3.5"/>}
              {allExpanded?"Collapse Semua":"Expand Semua AM"}
            </button>
          </div>
        </div>
        <div className="p-3">
          <div className="border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-red-700 text-white font-black uppercase tracking-wide text-xs">
                <th className="px-4 py-3 rounded-tl-lg min-w-[260px]">AM / Fase / Proyek</th>
                <th className="px-3 py-3 whitespace-nowrap w-28">KATEGORI</th>
                <th className="px-3 py-3 font-mono whitespace-nowrap w-28">LOP ID</th>
                <th className="px-3 py-3 min-w-[220px]">Pelanggan</th>
                <th className="px-4 py-3 text-right whitespace-nowrap rounded-tr-lg w-40">Nilai Proyek</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading?(
                <tr><td colSpan={5} className="text-center py-16 text-muted-foreground text-sm">Memuat data...</td></tr>
              ):groupedByAm.length===0?(
                <tr><td colSpan={5} className="text-center py-16 text-muted-foreground text-sm">
                  {search||hasActiveFilter?"Tidak ada data yang cocok dengan filter":"Belum ada data funnel"}
                </td></tr>
              ):groupedByAm.map(am=>{
                const amKey=am.nikAm||am.namaAm;
                const amExpanded=!!expandedAm[amKey];
                const amTotal=Array.from(am.phases.values()).flat().reduce((s:number,l:any)=>s+(l.nilaiProyek||0),0);
                const amLopCount=Array.from(am.phases.values()).flat().length;
                const orderedPhases=[...FS_PHASES.filter(p=>am.phases.has(p)),...Array.from(am.phases.keys()).filter(p=>!FS_PHASES.includes(p))];
                const ring=amExpanded?"#94a3b8":undefined;
                const ringStyle=(extra?:React.CSSProperties):React.CSSProperties=>ring?{borderLeft:`2px solid ${ring}`,borderRight:`2px solid ${ring}`,...extra}:{};
                const lastPhase=orderedPhases[orderedPhases.length-1];
                return (
                  <React.Fragment key={amKey}>
                    <tr className="cursor-pointer select-none bg-card hover:bg-secondary/30 transition-colors"
                      style={ring?{borderTop:`2px solid ${ring}`,borderLeft:`2px solid ${ring}`,borderRight:`2px solid ${ring}`,borderBottom:amExpanded?"none":`2px solid ${ring}`}:{borderTop:"2px solid transparent"}}
                      onClick={()=>toggleAmRow(amKey)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform shrink-0",amExpanded&&"rotate-90")}/>
                          <span className="font-black text-foreground text-sm uppercase tracking-wide">{am.namaAm}</span>
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0",am.divisi==="DPS"?"bg-blue-100 text-blue-700":"bg-violet-100 text-violet-700")}>{am.divisi}</span>
                          <button type="button" onClick={e=>{e.stopPropagation();handleAmExpandIcon(amKey,orderedPhases);}}
                            title={amExpanded?"Collapse semua proyek":"Expand semua proyek"}
                            className="ml-1 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors shrink-0">
                            {amExpanded?<Minimize2 className="w-3 h-3"/>:<Expand className="w-3 h-3"/>}
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-3" colSpan={3}>
                        <span className="text-xs font-black text-foreground tracking-wide">TOTAL {amLopCount} LOP</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-black text-foreground tabular-nums text-sm">{fmtRupiahFS(amTotal)}</span>
                      </td>
                    </tr>
                    {amExpanded&&orderedPhases.map(phase=>{
                      const lops=am.phases.get(phase)||[];
                      const phaseKey=`${amKey}|${phase}`;
                      const phaseExpanded=!!expandedPhase[phaseKey];
                      const phaseTotal=lops.reduce((s:number,l:any)=>s+(l.nilaiProyek||0),0);
                      const c=FS_PHASE_COLORS[phase];
                      const isLastPhase=phase===lastPhase;
                      const phaseIsBottomOfRing=isLastPhase&&!phaseExpanded;
                      return (
                        <React.Fragment key={phaseKey}>
                          <tr className="cursor-pointer select-none hover:brightness-95 transition-all"
                            style={{background:"rgba(253,242,248,0.75)",borderLeft:`4px solid ${c?.bar||"#94a3b8"}`,...ringStyle(phaseIsBottomOfRing&&ring?{borderBottom:`2px solid ${ring}`,borderRight:`2px solid ${ring}`}:{})}}
                            onClick={()=>togglePhaseRow(phaseKey)}>
                            <td className="px-4 py-2.5 pl-10">
                              <div className="flex items-center gap-2">
                                <ChevronRight className={cn("w-3.5 h-3.5 text-slate-500 transition-transform shrink-0",phaseExpanded&&"rotate-90")}/>
                                <span className="text-sm font-black font-mono" style={{color:c?.text}}>{phase}</span>
                                <span className="text-sm font-bold text-slate-700">{FS_PHASE_LABELS[phase]}</span>
                                <span className="text-xs font-bold text-pink-600 bg-pink-100 px-1.5 py-0.5 rounded-full">{lops.length} proyek</span>
                              </div>
                            </td>
                            <td colSpan={3} className="px-3 py-2.5"/>
                            <td className="px-4 py-2.5 text-right">
                              <span className="text-sm font-black text-slate-700 tabular-nums">{fmtRupiahFS(phaseTotal)}</span>
                            </td>
                          </tr>
                          {phaseExpanded&&lops.map((lop:any,idx:number)=>{
                            const isLastLop=idx===lops.length-1;
                            const isBottomOfRing=isLastPhase&&isLastLop;
                            return (
                              <tr key={`${lop.lopid}-${idx}`} className="hover:bg-pink-50 transition-colors"
                                style={ringStyle(isBottomOfRing&&ring?{borderBottom:`2px solid ${ring}`}:{})}>
                                <td className="px-4 py-2 pl-16">
                                  <div className="text-sm text-foreground font-bold leading-tight line-clamp-2 max-w-[280px]" title={lop.judulProyek}>{lop.judulProyek}</div>
                                </td>
                                <td className="px-3 py-2">
                                  {lop.kategoriKontrak?<span className="inline-block px-2 py-0.5 rounded text-[11px] bg-secondary border border-border text-muted-foreground font-medium">{lop.kategoriKontrak}</span>:<span className="text-muted-foreground text-xs">–</span>}
                                </td>
                                <td className="px-3 py-2 font-mono text-xs text-foreground whitespace-nowrap">{lop.lopid}</td>
                                <td className="px-3 py-2 text-sm text-foreground font-bold max-w-[220px] truncate" title={lop.pelanggan}>{lop.pelanggan}</td>
                                <td className="px-4 py-2 text-right tabular-nums text-base font-black text-foreground whitespace-nowrap">{formatRupiahFull(lop.nilaiProyek)}</td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
          </div>
        </div>
      </div>
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
  const [filterTipeRevenue, setFilterTipeRevenue] = useState("Reguler");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [funnelSubtitle, setFunnelSubtitle] = useState("HO / FULL HO");

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

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
        ps.sort();
        // Auto-select only periods where at least one AM has real_revenue > 0
        const psWithData = ps.filter(period => {
          const [y, m] = period.split("-");
          return data.some((p: any) =>
            String(p.tahun) === y && String(p.bulan).padStart(2, "0") === m &&
            (p.realRevenue ?? 0) > 0
          );
        });
        setFilterPeriodes(new Set(psWithData.length > 0 ? psWithData : ps));
        setFilterDivisi("All");
        setFilterNamaAms(new Set());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [snapshotId]);

  const availablePeriodes = useMemo(() => {
    return [...new Set(
      allPerfs
        .map((p: any) => `${p.tahun}-${String(p.bulan).padStart(2, "0")}`)
    )].sort();
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
    result = result.filter(r => r.divisi !== "DGS");
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
    return [...new Set(allPerfs.filter((p: any) => p.bulan === cmMonth).map((p: any) => p.divisi).filter((d: any) => d && d !== "DGS"))].sort() as string[];
  }, [allPerfs, cmMonth]);

  const amNames = useMemo(() => {
    if (!allPerfs.length || !cmMonth) return [];
    let rows = allPerfs.filter((p: any) => p.bulan === cmMonth && p.divisi !== "DGS");
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
    const divisiLabel = filterDivisi === "All" ? "Semua Divisi" : filterDivisi;
    return MONTHS_LABEL.map((month, idx) => {
      const mNum = idx + 1;
      const rows = allPerfs.filter((p: any) =>
        String(p.tahun) === cmYear && p.bulan === mNum &&
        p.divisi !== "DGS" &&
        (filterDivisi === "All" || p.divisi === filterDivisi)
      );
      const target = rows.reduce((s, p) => s + (p.targetRevenue ?? 0), 0);
      const real = rows.reduce((s, p) => s + (p.realRevenue ?? 0), 0);
      const ach = target > 0 ? parseFloat(((real / target) * 100).toFixed(1)) : 0;
      return {
        month,
        monthFull: `${MONTHS_FULL[idx]} ${cmYear}`,
        divisiLabel,
        target, real, ach,
      };
    });
  }, [allPerfs, cmYear, filterDivisi]);

  const totals = useMemo(() => {
    const cmT = amTableData.reduce((s, r) => s + r.cmTarget, 0);
    const cmR = amTableData.reduce((s, r) => s + r.cmReal, 0);
    const ytdT = amTableData.reduce((s, r) => s + r.ytdTarget, 0);
    const ytdR = amTableData.reduce((s, r) => s + r.ytdReal, 0);
    return { cmTarget: cmT, cmReal: cmR, cmAch: cmT > 0 ? cmR / cmT * 100 : 0, ytdAch: ytdT > 0 ? ytdR / ytdT * 100 : 0, ytdReal: ytdR };
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

  const toggleRow = useCallback((nik: string) => {
    setExpandedRows(prev => { const n = new Set(prev); if (n.has(nik)) n.delete(nik); else n.add(nik); return n; });
  }, []);

  const hasData = amTableData.length > 0;

  return (
    <div className="h-screen bg-background font-sans text-foreground text-sm flex flex-col overflow-hidden">

      {/* ─── Slide Navigation Overlay (all screen sizes) ────── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-56 bg-card border-r border-border flex flex-col shadow-2xl z-10">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-xs font-bold text-foreground">Navigasi Slide</span>
              <button onClick={() => setSidebarOpen(false)} className="p-1 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 py-2 space-y-1 px-2">
              {SLIDES.map((slide, i) => {
                const Icon = slide.icon;
                return (
                  <button key={i} onClick={() => { setCurrentSlide(i); setSidebarOpen(false); }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-xs transition-colors",
                      currentSlide === i
                        ? "bg-primary text-white font-semibold shadow-sm"
                        : "text-foreground hover:bg-secondary"
                    )}
                  >
                    <span className={cn("w-5 h-5 rounded flex items-center justify-center text-[10px] font-black shrink-0", currentSlide === i ? "bg-white/20" : "bg-secondary/80")}>{i + 1}</span>
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{slide.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="px-4 py-3 border-t border-border text-[10px] text-muted-foreground">← → untuk berpindah slide</div>
          </div>
        </div>
      )}

      {/* ─── Top Navbar ───────────── */}
      <div className="bg-card border-b border-border shrink-0 z-30">
        {/* Main row — always visible */}
        <div className="flex items-center gap-2 px-4 h-[76px]">
          {/* Logo + Brand */}
          <div className="flex items-center gap-2 shrink-0">
            <img src={`${import.meta.env.BASE_URL}logo-tr3.png`} alt="Logo TR3" className="h-10 object-contain" />
            <div className="leading-tight">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest leading-none">LESA VI WITEL SURAMADU</p>
              <p className="text-sm font-bold text-foreground">
                {currentSlide === 1
                  ? `SALES FUNNELING LOP MYTENS ${funnelSubtitle}`
                  : "AM Performance Report"}
              </p>
            </div>
          </div>
          {/* Desktop-only divider + filters */}
          {currentSlide === 0 && (
            <>
              <div className="hidden sm:block w-px h-9 bg-border/60 shrink-0 mx-0.5" />
              <div className="hidden sm:flex items-end gap-2 flex-1 min-w-0">
                <SelectDropdown
                  label="📷 Snapshot"
                  value={String(snapshotId ?? "")}
                  onChange={v => { setSnapshotId(Number(v)); setFilterPeriodes(new Set()); }}
                  options={imports.length === 0 ? [{ value: "", label: "Belum ada data" }] : imports.map(imp => ({ value: String(imp.id), label: shortSnap(imp.createdAt) }))}
                  disabled={!imports.length}
                  className="flex-1 min-w-0"
                />
                <CheckboxDropdown label="Periode" options={availablePeriodes} selected={filterPeriodes} onChange={setFilterPeriodes} labelFn={periodeLabel} headerLabel="" summaryLabel="Periode" className="flex-1 min-w-0" />
                <SelectDropdown
                  label="Divisi"
                  value={filterDivisi}
                  onChange={v => { setFilterDivisi(v); setFilterNamaAms(new Set()); }}
                  options={[{ value: "All", label: "Semua Divisi" }, ...divisiOptions.map(d => ({ value: d, label: d }))]}
                  disabled={!divisiOptions.length}
                  className="flex-1 min-w-0"
                />
                <CheckboxDropdown label="Nama AM" options={amNames} selected={filterNamaAms} onChange={setFilterNamaAms} placeholder="Semua AM" headerLabel="Pilih AM" summaryLabel="AM" className="flex-1 min-w-0" />
                <SelectDropdown
                  label="Tipe Rank"
                  value={filterTipeRank}
                  onChange={setFilterTipeRank}
                  options={TIPE_RANK.map(t => ({ value: t, label: t }))}
                  className="flex-1 min-w-0"
                />
                <SelectDropdown
                  label="Revenue"
                  value={filterTipeRevenue}
                  onChange={setFilterTipeRevenue}
                  options={TIPE_REVENUE.map(t => ({ value: t, label: t }))}
                  className="flex-1 min-w-0"
                />
              </div>
            </>
          )}
          {currentSlide === 1 && (
            <>
              <div className="hidden sm:block w-px h-9 bg-border/60 shrink-0 mx-0.5" />
              <div id="funnel-navbar-portal" className="hidden sm:flex items-end gap-2 flex-1 min-w-0 overflow-x-auto" />
            </>
          )}
          {/* Slide arrows + fullscreen — always pushed to the right */}
          <div className="ml-auto flex items-center gap-1 shrink-0">
            <button onClick={() => setCurrentSlide(s => Math.max(s - 1, 0))} disabled={currentSlide === 0}
              className="p-1 rounded-lg hover:bg-secondary transition-colors disabled:opacity-30">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="hidden sm:flex items-center gap-1">
              {SLIDES.map((_, i) => (
                <button key={i} onClick={() => setCurrentSlide(i)}
                  className={cn("rounded-full transition-all", i === currentSlide ? "w-4 h-2 bg-primary" : "w-2 h-2 bg-border hover:bg-muted-foreground")} />
              ))}
            </div>
            <button onClick={() => setCurrentSlide(s => Math.min(s + 1, SLIDES.length - 1))} disabled={currentSlide === SLIDES.length - 1}
              className="p-1 rounded-lg hover:bg-secondary transition-colors disabled:opacity-30">
              <ChevronRight className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-border/60 mx-0.5 hidden sm:block" />
            <button onClick={toggleFullscreen} title={isFullscreen ? "Keluar fullscreen" : "Fullscreen (F11)"}
              className="p-1 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground hidden sm:block">
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
        {/* Mobile-only filter row — scrollable, only on slide 0 */}
        {currentSlide === 0 && (
          <div className="sm:hidden flex items-end gap-2 overflow-x-auto px-3 pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <SelectDropdown
              label="📷 Snapshot"
              value={String(snapshotId ?? "")}
              onChange={v => { setSnapshotId(Number(v)); setFilterPeriodes(new Set()); }}
              options={imports.length === 0 ? [{ value: "", label: "Belum ada data" }] : imports.map(imp => ({ value: String(imp.id), label: shortSnap(imp.createdAt) }))}
              disabled={!imports.length}
              className="shrink-0 w-28"
            />
            <CheckboxDropdown label="Periode" options={availablePeriodes} selected={filterPeriodes} onChange={setFilterPeriodes} labelFn={periodeLabel} headerLabel="" summaryLabel="Periode" className="shrink-0 w-24" />
            <SelectDropdown
              label="Divisi"
              value={filterDivisi}
              onChange={v => { setFilterDivisi(v); setFilterNamaAms(new Set()); }}
              options={[{ value: "All", label: "Semua Divisi" }, ...divisiOptions.map(d => ({ value: d, label: d }))]}
              disabled={!divisiOptions.length}
              className="shrink-0 w-24"
            />
            <CheckboxDropdown label="Nama AM" options={amNames} selected={filterNamaAms} onChange={setFilterNamaAms} placeholder="Semua AM" headerLabel="Pilih AM" summaryLabel="AM" className="shrink-0 w-24" />
            <SelectDropdown
              label="Tipe Rank"
              value={filterTipeRank}
              onChange={setFilterTipeRank}
              options={TIPE_RANK.map(t => ({ value: t, label: t }))}
              className="shrink-0 w-24"
            />
            <SelectDropdown
              label="Revenue"
              value={filterTipeRevenue}
              onChange={setFilterTipeRevenue}
              options={TIPE_REVENUE.map(t => ({ value: t, label: t }))}
              className="shrink-0 w-24"
            />
          </div>
        )}
      </div>

      {/* ─── Main Scrollable Content ─────────────────────── */}
      <div className="flex-1 overflow-y-auto">

      {/* ─── Slide: Sales Funnel ──────────────────────────── */}
      {currentSlide === 1 && <FunnelSlide onTitleChange={setFunnelSubtitle} />}

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
                title="TOP AM BY CURRENT MONTH"
                subtitle={topCm ? `Divisi ${topCm.divisi} · ${cmPeriode ? periodeLabel(cmPeriode) : "—"}` : ""}
                am={topCm} value={topCm ? `${(topCm.cmAch * 100).toFixed(1).replace(".", ",")}%` : "–"}
                realValue={topCm ? formatRupiah(topCm.cmReal) : undefined}
                targetValue={topCm ? formatRupiah(topCm.cmTarget) : undefined}
              />
              <TrophyCard colorScheme="blue"
                title="TOP AM BY YEAR TO DATE"
                subtitle={topYtd ? `Divisi ${topYtd.divisi} · ${filterPeriodes.size > 1 ? `${filterPeriodes.size} Periode` : cmPeriode ? periodeLabel(cmPeriode) : "—"}` : ""}
                am={topYtd} value={topYtd ? `${(topYtd.ytdAch * 100).toFixed(1).replace(".", ",")}%` : "–"}
                realValue={topYtd ? formatRupiah(topYtd.ytdReal) : undefined}
                targetValue={topYtd ? formatRupiah(topYtd.ytdTarget) : undefined}
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
            <div className="bg-card border border-border rounded-xl">
              <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center justify-between gap-3 flex-wrap">
                <h3 className="text-sm font-bold text-foreground">AM Performance Report</h3>
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
              </div>
              <div className="p-3">
                <div className="border border-border rounded-lg overflow-visible">
                <div className="[overflow-x:clip]">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-red-700 text-white">
                      <th className="px-3 py-3 w-5 rounded-tl-lg"></th>
                      <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wide">Nama AM</th>
                      <th className="px-3 py-3 text-center text-xs font-black uppercase tracking-wide">Rank</th>
                      <th className={cn("px-4 py-3 text-right text-xs font-black uppercase tracking-wide", filterTipeRank === "Real Revenue" && "underline underline-offset-2")}>Target {filterTipeRevenue}</th>
                      <th className={cn("px-4 py-3 text-right text-xs font-black uppercase tracking-wide", filterTipeRank === "Real Revenue" && "underline underline-offset-2")}>Real {filterTipeRevenue}</th>
                      <th className={cn("px-3 py-3 text-right text-xs font-black uppercase tracking-wide", filterTipeRank === "Ach MTD" && "underline underline-offset-2")}>CM %</th>
                      <th className={cn("px-3 py-3 text-right text-xs font-black uppercase tracking-wide rounded-tr-lg", filterTipeRank === "YTD" && "underline underline-offset-2")}>YTD %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {filteredAmData.map(row => {
                      const isExpanded = effectiveExpandedRows.has(row.nik);
                      const hasCustomers = row.customers.length > 0;
                      return (
                        <React.Fragment key={row.nik}>
                          <tr className={cn("hover:bg-secondary/20 transition-colors", hasCustomers && "cursor-pointer")}
                            onClick={() => hasCustomers && toggleRow(row.nik)}>
                            <td className="px-2 py-2 text-muted-foreground">
                              {hasCustomers ? (isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />) : null}
                            </td>
                            <td className="px-4 py-2 font-medium text-foreground overflow-visible">
                              <div className="group relative flex flex-col w-fit">
                                <span>{row.namaAm}</span>
                                <span className="text-[10px] text-muted-foreground">{row.divisi}</span>
                                {/* Hover tooltip */}
                                <div className="pointer-events-none absolute left-0 top-full mt-1.5 z-[200] w-56 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                                  <div className="bg-card border border-border rounded-xl shadow-xl px-3 py-2.5 text-xs">
                                    <p className="font-bold text-foreground mb-2 leading-snug">{row.namaAm}</p>
                                    <div className="space-y-1.5">
                                      <div className="flex justify-between gap-3">
                                        <span className="text-muted-foreground">Total Pelanggan</span>
                                        <span className="font-semibold text-foreground">{(row.customers || []).length}</span>
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
                            <td className="px-3 py-2 text-center font-bold text-foreground">{row.displayRank}</td>
                            <td className="px-4 py-2 text-right text-foreground tabular-nums">{formatRupiah(row.cmTarget)}</td>
                            <td className="px-4 py-2 text-right font-medium tabular-nums">{formatRupiah(row.cmReal)}</td>
                            <td className={cn("px-3 py-2 text-right font-bold tabular-nums", row.cmAch >= 1 ? "text-green-600" : row.cmAch >= 0.8 ? "text-orange-500" : "text-red-600")}>
                              {(row.cmAch * 100).toFixed(1).replace(".", ",")}%
                            </td>
                            <td className={cn("px-3 py-2 text-right font-bold tabular-nums", row.ytdAch >= 1 ? "text-green-600" : row.ytdAch >= 0.8 ? "text-blue-600" : "text-red-600")}>
                              {(row.ytdAch * 100).toFixed(1).replace(".", ",")}%
                            </td>
                          </tr>
                          {isExpanded && hasCustomers && (
                            <tr className="bg-rose-50/40 dark:bg-rose-950/10">
                              <td colSpan={7} className="px-0 pb-3 pt-0">
                                <div className="mx-4 mt-2 mb-1 border-2 border-rose-200 dark:border-rose-800/50 rounded-xl overflow-hidden shadow-sm">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="bg-rose-50 dark:bg-rose-950/30">
                                        <th className="px-3 py-2 text-left text-xs font-black text-rose-800 dark:text-rose-300 uppercase tracking-wide">Pelanggan / NIP</th>
                                        <th className="px-3 py-2 text-right text-xs font-black text-rose-800 dark:text-rose-300 uppercase tracking-wide">Proporsi</th>
                                        <th className="px-3 py-2 text-right text-xs font-black text-rose-800 dark:text-rose-300 uppercase tracking-wide">Target</th>
                                        <th className="px-3 py-2 text-right text-xs font-black text-rose-800 dark:text-rose-300 uppercase tracking-wide">Real</th>
                                        <th className="px-3 py-2 text-right text-xs font-black text-rose-800 dark:text-rose-300 uppercase tracking-wide">Ach %</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/40">
                                      {row.customers.map((c: any, ci: number) => {
                                        const cReal = c.realTotal ?? 0;
                                        const cTarget = c.targetTotal ?? 0;
                                        const prop = c.proporsi != null ? c.proporsi * 100 : 0;
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
                  <tfoot>
                    <tr className="bg-secondary/60 border-t-2 border-border">
                      <td className="px-2 py-3" />
                      <td className="px-4 py-3 font-bold text-sm text-foreground" colSpan={2}>Total ({amTableData.length} AM)</td>
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
                    </tr>
                  </tfoot>
                </table>
              </div>
              </div>
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
      </div>{/* end main scrollable */}
    </div>
  );
}

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Pencil, Trash2, Users, Wifi, WifiOff, Search, X,
  MessageSquare, ShieldCheck, AlertTriangle, RefreshCw, UserCog
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AM {
  id: number;
  nik: string;
  nama: string;
  role: string;
  divisi: string;
  segmen: string | null;
  witel: string;
  telegramChatId: string | null;
  telegramConnected: boolean;
  kpiActivity: number;
  crossWitel: boolean;
  createdAt: string;
}

interface AmFormData {
  nik: string;
  nama: string;
  role: string;
  divisi: string;
  segmen: string;
  witel: string;
  telegramChatId: string;
  kpiActivity: string;
}

const EMPTY_FORM: AmFormData = {
  nik: "", nama: "", role: "AM", divisi: "DPS", segmen: "",
  witel: "SURAMADU", telegramChatId: "", kpiActivity: "30",
};

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { credentials: "include", ...opts });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error((body as any).error || `HTTP ${r.status}`);
  }
  if (r.status === 204) return undefined as T;
  return r.json();
}

// ─── Reusable: FormField ─────────────────────────────────────────────────────

function FormField({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-foreground">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ─── Reusable: SelectField ───────────────────────────────────────────────────

function SelectField({ value, onChange, options, disabled, className }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean; className?: string;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
        "focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ─── Reusable: ConfirmDeleteDialog ────────────────────────────────────────────

function ConfirmDeleteDialog({ open, onClose, onConfirm, name, loading }: {
  open: boolean; onClose: () => void; onConfirm: () => void;
  name: string; loading?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-destructive" />
            </div>
            <DialogTitle className="text-base">Hapus Account Manager</DialogTitle>
          </div>
          <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
            Apakah kamu yakin ingin menghapus <span className="font-semibold text-foreground">{name}</span>?
            Data ini tidak dapat dikembalikan.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>Batal</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Hapus
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── AM Form Dialog ───────────────────────────────────────────────────────────

function AmFormDialog({ open, onClose, onSubmit, initial, loading, mode }: {
  open: boolean; onClose: () => void;
  onSubmit: (data: AmFormData) => void;
  initial?: AmFormData; loading?: boolean; mode: "add" | "edit";
}) {
  const [form, setForm] = useState<AmFormData>(initial ?? EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<AmFormData>>({});

  useEffect(() => {
    if (open) { setForm(initial ?? EMPTY_FORM); setErrors({}); }
  }, [open, initial]);

  function set(field: keyof AmFormData) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }));
  }
  function setSelect(field: keyof AmFormData) {
    return (v: string) => setForm(f => ({ ...f, [field]: v }));
  }

  const isManager = form.role === "MANAGER";

  function validate(): boolean {
    const errs: Partial<AmFormData> = {};
    if (!form.nik.trim()) errs.nik = "NIK wajib diisi";
    else if (!/^\d+$/.test(form.nik.trim())) errs.nik = "NIK harus berupa angka";
    if (!form.nama.trim()) errs.nama = "Nama wajib diisi";
    if (!isManager && !form.divisi) errs.divisi = "Divisi wajib dipilih";
    const kpi = Number(form.kpiActivity);
    if (!form.kpiActivity || isNaN(kpi) || kpi < 0) errs.kpiActivity = "KPI harus angka ≥ 0";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validate()) onSubmit(form);
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Users className="w-4 h-4 text-primary" />
            {mode === "add"
              ? `Tambah ${isManager ? "Manager" : "Account Manager"}`
              : `Edit ${isManager ? "Manager" : "Account Manager"}`}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {mode === "add"
              ? "Isi data lengkap Account Manager baru."
              : "Ubah informasi Account Manager yang dipilih."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-1">

          {/* Role Selector */}
          <FormField label="Role">
            <div className="flex gap-2">
              {[{v:"AM",label:"Account Manager"},{v:"MANAGER",label:"Manager"}].map(opt=>(
                <button
                  key={opt.v} type="button"
                  onClick={()=>setForm(f=>({...f,role:opt.v}))}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-lg border text-sm font-semibold transition-colors",
                    form.role===opt.v
                      ? "bg-primary text-white border-primary"
                      : "bg-secondary text-muted-foreground border-border hover:border-primary/40"
                  )}
                >{opt.label}</button>
              ))}
            </div>
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="NIK" required error={errors.nik}>
              <Input
                value={form.nik} onChange={set("nik")}
                placeholder="mis. 405690"
                disabled={mode === "edit"}
                className={errors.nik ? "border-destructive" : ""}
              />
            </FormField>
            {!isManager && (
              <FormField label="Divisi" required error={errors.divisi}>
                <SelectField
                  value={form.divisi}
                  onChange={setSelect("divisi")}
                  options={[
                    { value: "DPS", label: "DPS" },
                    { value: "DSS", label: "DSS" },
                  ]}
                />
              </FormField>
            )}
          </div>

          <FormField label="Nama Lengkap" required error={errors.nama}>
            <Input
              value={form.nama} onChange={set("nama")}
              placeholder={isManager ? "mis. RENI WULANDARI" : "mis. CAESAR RIO ANGGINA TORUAN"}
              className={errors.nama ? "border-destructive" : ""}
            />
          </FormField>

          {!isManager && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Segmen">
                  <SelectField
                    value={form.segmen}
                    onChange={setSelect("segmen")}
                    options={[
                      { value: "", label: "— Pilih Segmen —" },
                      { value: "Enterprise", label: "Enterprise" },
                      { value: "Government", label: "Government" },
                      { value: "SME", label: "SME" },
                    ]}
                  />
                </FormField>
                <FormField label="Witel">
                  <SelectField
                    value={form.witel}
                    onChange={setSelect("witel")}
                    options={[
                      { value: "SURAMADU", label: "SURAMADU" },
                      { value: "SURABAYA", label: "SURABAYA" },
                      { value: "MADURA", label: "MADURA" },
                    ]}
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="KPI Activity (hari/bulan)" error={errors.kpiActivity}>
                  <Input
                    type="number" min="0" max="365"
                    value={form.kpiActivity} onChange={set("kpiActivity")}
                    placeholder="30"
                    className={errors.kpiActivity ? "border-destructive" : ""}
                  />
                </FormField>
                <FormField label="Telegram Chat ID">
                  <Input
                    value={form.telegramChatId} onChange={set("telegramChatId")}
                    placeholder="mis. 123456789"
                  />
                </FormField>
              </div>
            </>
          )}

          <DialogFooter className="pt-2 gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Batal</Button>
            <Button type="submit" disabled={loading}>
              {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              {mode === "add" ? `Tambah ${isManager ? "Manager" : "AM"}` : "Simpan Perubahan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── AM Table Row ─────────────────────────────────────────────────────────────

function AmRow({ am, onEdit, onDelete }: { am: AM; onEdit: () => void; onDelete: () => void }) {
  const isManager = am.role === "MANAGER";
  return (
    <tr className="border-b border-border/50 hover:bg-secondary/30 transition-colors group">
      <td className="px-4 py-3 font-mono text-xs font-semibold text-muted-foreground whitespace-nowrap">
        {am.nik}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-8 h-8 rounded-full border flex items-center justify-center shrink-0",
            isManager ? "bg-orange-50 border-orange-200" : "bg-primary/10 border-primary/20"
          )}>
            <span className={cn("text-[10px] font-black", isManager ? "text-orange-600" : "text-primary")}>
              {am.nama.split(" ").slice(0, 2).map(n => n[0]).join("")}
            </span>
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-foreground leading-tight truncate max-w-[200px]">{am.nama}</p>
            {am.crossWitel && !isManager && (
              <span className="text-[10px] text-amber-600 font-bold">Cross Witel</span>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <Badge className={cn(
          "text-[11px] font-bold",
          isManager
            ? "bg-orange-100 text-orange-700 border-orange-200"
            : "bg-emerald-100 text-emerald-700 border-emerald-200"
        )}>
          {isManager ? "MANAGER" : "AM"}
        </Badge>
      </td>
      {!isManager ? (
        <td className="px-4 py-3">
          <Badge className={cn(
            "text-[11px] font-bold",
            am.divisi === "DPS"
              ? "bg-blue-100 text-blue-700 border-blue-200"
              : "bg-violet-100 text-violet-700 border-violet-200"
          )}>
            {am.divisi}
          </Badge>
        </td>
      ) : (
        <td className="px-4 py-3 text-xs text-muted-foreground">–</td>
      )}
      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
        {isManager ? <span className="text-muted-foreground/40">–</span> : (am.segmen || <span className="text-border">–</span>)}
      </td>
      <td className="px-4 py-3 text-center">
        {isManager
          ? <span className="text-muted-foreground/40 text-xs">–</span>
          : <><span className="font-mono text-sm font-semibold text-foreground">{am.kpiActivity}</span><span className="text-xs text-muted-foreground ml-1">hr</span></>
        }
      </td>
      <td className="px-4 py-3">
        {isManager ? <span className="text-xs text-muted-foreground/40">–</span> : am.telegramConnected ? (
          <div className="flex items-center gap-1.5">
            <Wifi className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span className="text-xs font-semibold text-emerald-600">Terhubung</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <WifiOff className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
            <span className="text-xs text-muted-foreground/60">Belum</span>
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost" size="sm"
            onClick={onEdit}
            className="h-7 w-7 p-0 hover:bg-primary/10 hover:text-primary"
            title="Edit"
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost" size="sm"
            onClick={onDelete}
            className="h-7 w-7 p-0 hover:bg-destructive/10 hover:text-destructive"
            title="Hapus"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: React.ReactNode;
  sub?: string; color?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", color || "bg-primary/10")}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide leading-none mb-1">{label}</p>
        <p className="text-2xl font-black text-foreground leading-none">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ManajemenAmPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterDivisi, setFilterDivisi] = useState<"all" | "DPS" | "DSS">("all");
  const [filterRole, setFilterRole] = useState<"all" | "AM" | "MANAGER">("all");

  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<AM | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AM | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: ams = [], isLoading, error } = useQuery<AM[]>({
    queryKey: ["am-list"],
    queryFn: () => apiFetch("/api/am"),
    staleTime: 30_000,
  });

  const addMutation = useMutation({
    mutationFn: (data: AmFormData) => apiFetch<AM>("/api/am", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nik: data.nik.trim(),
        nama: data.nama.trim().toUpperCase(),
        role: data.role,
        divisi: data.role === "MANAGER" ? "DPS" : data.divisi,
        segmen: data.role === "MANAGER" ? null : (data.segmen || null),
        witel: data.role === "MANAGER" ? "SURAMADU" : data.witel,
        telegramChatId: data.role === "MANAGER" ? null : (data.telegramChatId || null),
        kpiActivity: data.role === "MANAGER" ? 0 : Number(data.kpiActivity),
      }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["am-list"] }); setShowAdd(false); setFormError(null); },
    onError: (e: Error) => setFormError(e.message),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: AmFormData }) =>
      apiFetch<AM>(`/api/am/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nama: data.nama.trim().toUpperCase(),
          role: data.role,
          divisi: data.role === "MANAGER" ? undefined : data.divisi,
          segmen: data.role === "MANAGER" ? null : (data.segmen || null),
          witel: data.role === "MANAGER" ? undefined : data.witel,
          telegramChatId: data.role === "MANAGER" ? undefined : (data.telegramChatId || null),
          kpiActivity: data.role === "MANAGER" ? undefined : Number(data.kpiActivity),
        }),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["am-list"] }); setEditTarget(null); setFormError(null); },
    onError: (e: Error) => setFormError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch<void>(`/api/am/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["am-list"] }); setDeleteTarget(null); },
  });

  const amOnly = ams.filter(a => a.role !== "MANAGER");
  const managerOnly = ams.filter(a => a.role === "MANAGER");

  const filtered = ams.filter(am => {
    if (filterRole !== "all" && am.role !== filterRole) return false;
    if (filterDivisi !== "all" && am.divisi !== filterDivisi) return false;
    if (search) {
      const q = search.toLowerCase();
      return am.nama.toLowerCase().includes(q) || am.nik.includes(q) || (am.segmen || "").toLowerCase().includes(q);
    }
    return true;
  });

  const telegramCount = amOnly.filter(a => a.telegramConnected).length;
  const dpsCount = amOnly.filter(a => a.divisi === "DPS").length;
  const dssCount = amOnly.filter(a => a.divisi === "DSS").length;

  function toFormData(am: AM): AmFormData {
    return {
      nik: am.nik, nama: am.nama, role: am.role || "AM",
      divisi: am.divisi, segmen: am.segmen || "", witel: am.witel,
      telegramChatId: am.telegramChatId || "",
      kpiActivity: String(am.kpiActivity),
    };
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-display font-bold text-foreground">Manajemen Lesa</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Kelola data Account Manager dan Manager Witel Suramadu</p>
        </div>
        <Button onClick={() => { setFormError(null); setShowAdd(true); }} className="gap-2 shrink-0">
          <Plus className="w-4 h-4" />
          Tambah Anggota
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={<Users className="w-5 h-5 text-primary" />}
          label="Total AM" value={amOnly.length}
          sub={`${dpsCount} DPS · ${dssCount} DSS`}
          color="bg-primary/10"
        />
        <StatCard
          icon={<UserCog className="w-5 h-5 text-orange-600" />}
          label="Manager" value={managerOnly.length}
          sub="LESA & Witel"
          color="bg-orange-50 dark:bg-orange-950/30"
        />
        <StatCard
          icon={<MessageSquare className="w-5 h-5 text-emerald-600" />}
          label="Telegram Aktif" value={telegramCount}
          sub={`dari ${amOnly.length} AM`}
          color="bg-emerald-50 dark:bg-emerald-950/30"
        />
        <StatCard
          icon={<WifiOff className="w-5 h-5 text-amber-600" />}
          label="Belum Terhubung" value={amOnly.length - telegramCount}
          sub="perlu koneksi Telegram"
          color="bg-amber-50 dark:bg-amber-950/30"
        />
      </div>

      {/* Table Card */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {/* Filter Bar */}
        <div className="px-4 py-3 border-b border-border bg-secondary/20 flex items-center gap-3 flex-wrap">
          {/* Role tabs */}
          <div className="flex items-center gap-1">
            {([
              {v:"all",label:"Semua"},
              {v:"AM",label:"AM"},
              {v:"MANAGER",label:"Manager"},
            ] as const).map(opt => (
              <button
                key={opt.v}
                onClick={() => setFilterRole(opt.v)}
                className={cn(
                  "h-7 px-3 rounded-lg text-xs font-semibold transition-colors",
                  filterRole === opt.v
                    ? "bg-primary text-white"
                    : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                )}
              >{opt.label}</button>
            ))}
          </div>

          {/* Divisi filter (only when showing AM) */}
          {filterRole !== "MANAGER" && (
            <div className="flex items-center gap-1">
              {(["all", "DPS", "DSS"] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setFilterDivisi(d)}
                  className={cn(
                    "h-7 px-3 rounded-lg text-xs font-semibold transition-colors",
                    filterDivisi === d
                      ? "bg-blue-600 text-white"
                      : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                  )}
                >
                  {d === "all" ? "All Divisi" : d}
                </button>
              ))}
            </div>
          )}

          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Cari nama atau NIK…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-7 py-1.5 text-sm bg-background border border-border rounded-lg w-full focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/60"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <span className="text-xs text-muted-foreground ml-auto shrink-0">
            {filtered.length} dari {ams.length} anggota
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-red-700 text-white text-xs font-black uppercase tracking-wide">
                <th className="px-4 py-3 whitespace-nowrap w-24">NIK</th>
                <th className="px-4 py-3 min-w-[200px]">Nama</th>
                <th className="px-4 py-3 w-24">Role</th>
                <th className="px-4 py-3 w-20">Divisi</th>
                <th className="px-4 py-3 w-28">Segmen</th>
                <th className="px-4 py-3 w-24 text-center">KPI</th>
                <th className="px-4 py-3 w-32">Telegram</th>
                <th className="px-4 py-3 w-20">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    {[...Array(8)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-secondary rounded animate-pulse" style={{ width: `${[60, 160, 60, 40, 70, 30, 80, 50][j]}px` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : error ? (
                <tr><td colSpan={8} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <AlertTriangle className="w-6 h-6 text-destructive" />
                    <p className="text-sm">Gagal memuat data</p>
                  </div>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-16">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <Users className="w-8 h-8 opacity-30" />
                    <p className="text-sm font-medium">
                      {search || filterDivisi !== "all" || filterRole !== "all" ? "Tidak ada anggota yang cocok" : "Belum ada data"}
                    </p>
                    {!search && filterDivisi === "all" && filterRole === "all" && (
                      <Button size="sm" onClick={() => setShowAdd(true)}>
                        <Plus className="w-3.5 h-3.5" /> Tambah Anggota Pertama
                      </Button>
                    )}
                  </div>
                </td></tr>
              ) : filtered.map(am => (
                <AmRow
                  key={am.id}
                  am={am}
                  onEdit={() => { setFormError(null); setEditTarget(am); }}
                  onDelete={() => setDeleteTarget(am)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Dialog */}
      <AmFormDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSubmit={data => addMutation.mutate(data)}
        loading={addMutation.isPending}
        mode="add"
      />
      {formError && showAdd && (
        <div className="text-sm text-destructive text-center">{formError}</div>
      )}

      {/* Edit Dialog */}
      <AmFormDialog
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        onSubmit={data => editTarget && editMutation.mutate({ id: editTarget.id, data })}
        initial={editTarget ? toFormData(editTarget) : undefined}
        loading={editMutation.isPending}
        mode="edit"
      />

      {/* Delete Confirm Dialog */}
      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        name={deleteTarget?.nama ?? ""}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

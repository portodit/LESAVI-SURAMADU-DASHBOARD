import React, { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import * as XLSX from "xlsx";
import { useImportPerformance, useImportFunnel, useImportActivity, useListImportHistory } from "@workspace/api-client-react";
import { useToast } from "@/shared/hooks/use-toast";
import { Button } from "@/shared/ui/button";
import {
  UploadCloud, CheckCircle2, History, Loader2, Calendar,
  AlertCircle, ArrowRight, X, FileSpreadsheet, Trash2,
  Eye, AlertTriangle, RefreshCw, BarChart2, Filter, Activity, Layers
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { format } from "date-fns";
import { id } from "date-fns/locale";

const TABS = [
  { id: "performansi", label: "Performa AM", icon: BarChart2, type: "performance" },
  { id: "funnel",      label: "Sales Funnel", icon: Filter,    type: "funnel" },
  { id: "activity",   label: "Sales Activity", icon: Activity, type: "activity" },
];

function extractDateFromFilename(source: string): { display: string; isoDate: string; period: string } | null {
  const match = source.match(/[_-](\d{8})[._?&\s]/);
  if (!match) return null;
  const raw = match[1];
  const year = raw.slice(0, 4);
  const month = raw.slice(4, 6);
  const day = raw.slice(6, 8);
  const y = parseInt(year), mo = parseInt(month), d = parseInt(day);
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return {
    isoDate: `${year}-${month}-${day}`,
    period: `${year}-${month}`,
    display: `${day}/${month}/${year}`,
  };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const result = e.target?.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Read just the sheet names from an Excel file (fast, no full parse) */
async function readSheetNames(file: File): Promise<string[]> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = e.target?.result;
        const wb = XLSX.read(data, { bookSheets: true });
        resolve(wb.SheetNames || []);
      } catch {
        resolve([]);
      }
    };
    reader.onerror = () => resolve([]);
    reader.readAsArrayBuffer(file);
  });
}

function formatSnapshotTitle(createdAt: string, type: string): string {
  const date = format(new Date(createdAt), "d MMMM yyyy", { locale: id });
  const upper = date.toUpperCase();
  if (type === "performance") return `SNAPSHOT PERFORMANSI AM WITEL SURAMADU (${upper})`;
  if (type === "funnel") return `SNAPSHOT SALES FUNNEL WITEL SURAMADU (${upper})`;
  return `SNAPSHOT SALES ACTIVITY WITEL SURAMADU (${upper})`;
}

type ConflictInfo = {
  error: string;
  existingId: number;
  existingRows: number;
  period: string;
  importedAt: string;
  pendingBody: any;
  pendingTab: string;
};

type SheetPicker = {
  file: File;
  sheets: string[];
};

export default function ImportData() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("performansi");
  const [files, setFiles] = useState<Record<string, File | null>>({ performansi: null, funnel: null, activity: null });
  const [sheetNames, setSheetNames] = useState<Record<string, string>>({ performansi: "", funnel: "", activity: "" });
  const [snapshotOverride, setSnapshotOverride] = useState<Record<string, string>>({ performansi: "", funnel: "", activity: "" });
  const [isDragOver, setIsDragOver] = useState(false);
  const [sheetPicker, setSheetPicker] = useState<SheetPicker | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [conflictInfo, setConflictInfo] = useState<ConflictInfo | null>(null);
  const [isOverwriting, setIsOverwriting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ percent: number; stage: string } | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: history, refetch } = useListImportHistory();
  const perfMut = useImportPerformance();
  const funnelMut = useImportFunnel();
  const actMut = useImportActivity();

  const activeTabData = TABS.find(t => t.id === activeTab)!;
  const currentFile = files[activeTab] || null;
  const currentSnapshotOverride = snapshotOverride[activeTab] || "";
  const currentSheetName = sheetNames[activeTab] || "";

  const fileDetected = currentFile ? extractDateFromFilename(currentFile.name) : null;
  // Final snapshot = override OR auto-detected from filename
  const finalSnapshotDate = currentSnapshotOverride || fileDetected?.isoDate || null;
  const finalPeriod = finalSnapshotDate ? finalSnapshotDate.slice(0, 7) : fileDetected?.period || null;

  const isPending =
    (activeTab === "performansi" && perfMut.isPending) ||
    (activeTab === "funnel" && funnelMut.isPending) ||
    (activeTab === "activity" && actMut.isPending);

  const filteredHistory = history?.filter(h => h.type === activeTabData.type) || [];
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const sameDayImport = filteredHistory.find(h => format(new Date(h.createdAt), "yyyy-MM-dd") === todayStr);

  // ── File selection handler ─────────────────────────────────────────────────
  const applyFile = useCallback(async (file: File) => {
    const sheets = await readSheetNames(file);
    if (sheets.length > 1) {
      setSheetPicker({ file, sheets });
    } else {
      commitFile(file, sheets[0] || "");
    }
  }, [activeTab]);

  const commitFile = useCallback((file: File, sheet: string) => {
    setFiles(prev => ({ ...prev, [activeTab]: file }));
    setSheetNames(prev => ({ ...prev, [activeTab]: sheet }));
    // Auto-fill snapshot date from filename
    const detected = extractDateFromFilename(file.name);
    if (detected) {
      setSnapshotOverride(prev => ({ ...prev, [activeTab]: detected.isoDate }));
    }
    setSheetPicker(null);
  }, [activeTab]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) applyFile(file);
    e.target.value = "";
  };

  const clearFile = () => {
    setFiles(prev => ({ ...prev, [activeTab]: null }));
    setSheetNames(prev => ({ ...prev, [activeTab]: "" }));
    setSnapshotOverride(prev => ({ ...prev, [activeTab]: "" }));
  };

  // ── Drag & Drop ────────────────────────────────────────────────────────────
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls"))) {
      applyFile(file);
    } else if (file) {
      toast({ title: "Format Tidak Didukung", description: "Hanya file .xlsx atau .xls yang diperbolehkan", variant: "destructive" });
    }
  };

  // ── Progress simulation ────────────────────────────────────────────────────
  const PROGRESS_STAGES = [
    { to: 18, step: 0.7,  label: "Membaca & encode file..." },
    { to: 58, step: 0.35, label: "Proses cleaning data..." },
    { to: 87, step: 0.12, label: "Menyimpan ke database..." },
  ];

  function startProgressSim() {
    let p = 0;
    let si = 0;
    setImportProgress({ percent: 0, stage: PROGRESS_STAGES[0].label });
    progressIntervalRef.current = setInterval(() => {
      p += PROGRESS_STAGES[si].step;
      if (p >= PROGRESS_STAGES[si].to && si < PROGRESS_STAGES.length - 1) si++;
      const capped = Math.min(p, PROGRESS_STAGES[si].to);
      setImportProgress({ percent: Math.round(capped), stage: PROGRESS_STAGES[si].label });
    }, 50);
  }

  function stopProgressSim(success: boolean) {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    if (success) {
      setImportProgress({ percent: 100, stage: "Selesai ✓" });
      setTimeout(() => setImportProgress(null), 2000);
    } else {
      setImportProgress(null);
    }
  }

  // ── Import logic ───────────────────────────────────────────────────────────
  const buildBody = async (): Promise<any | null> => {
    if (!currentFile) {
      toast({ title: "File Kosong", description: "Pilih file Excel terlebih dahulu", variant: "destructive" });
      return null;
    }
    try {
      const fileData = await fileToBase64(currentFile);
      const body: any = { fileData };
      if (currentSheetName) body.sheetName = currentSheetName;
      if (finalPeriod) body.period = finalPeriod;
      if (finalSnapshotDate) body.snapshotDate = finalSnapshotDate;
      return body;
    } catch {
      toast({ title: "Gagal Membaca File", description: "File tidak dapat dibaca", variant: "destructive" });
      return null;
    }
  };

  const runImport = async (body: any, tab: string) => {
    const mut = tab === "performansi" ? perfMut : tab === "funnel" ? funnelMut : actMut;
    const tabData = TABS.find(t => t.id === tab)!;
    const res = await mut.mutateAsync({ data: body });
    const extraInfo = (res as any).rawCount != null
      ? ` (${(res as any).rawCount} baris mentah, ${res.rowsImported} lolos cleaning)`
      : ` (${res.rowsImported} baris)`;
    toast({
      title: "Import Berhasil",
      description: `Data ${tabData.label} berhasil diimport${extraInfo}. Periode: ${res.period}`,
    });
    setConflictInfo(null);
    refetch();
  };

  const handleSync = async () => {
    const body = await buildBody();
    if (!body) return;
    startProgressSim();
    try {
      await runImport(body, activeTab);
      stopProgressSim(true);
    } catch (e: any) {
      stopProgressSim(false);
      const errData = e?.data || e?.error;
      if (e?.status === 409 || errData?.conflict) {
        const info = errData || e?.data;
        setConflictInfo({
          error: info?.error || "Data periode ini sudah ada",
          existingId: info?.existingId,
          existingRows: info?.existingRows,
          period: info?.period,
          importedAt: info?.importedAt,
          pendingBody: body,
          pendingTab: activeTab,
        });
        return;
      }
      const errMsg = e?.data?.error || e?.error?.error || e?.message || "Gagal menghubungi server";
      toast({ title: "Import Gagal", description: errMsg, variant: "destructive" });
    }
  };

  const handleOverwrite = async () => {
    if (!conflictInfo) return;
    setIsOverwriting(true);
    startProgressSim();
    try {
      await runImport({ ...conflictInfo.pendingBody, forceOverwrite: true }, conflictInfo.pendingTab);
      stopProgressSim(true);
    } catch (e: any) {
      stopProgressSim(false);
      const errMsg = e?.data?.error || e?.message || "Gagal menimpa data";
      toast({ title: "Gagal Menimpa", description: errMsg, variant: "destructive" });
    } finally {
      setIsOverwriting(false);
    }
  };

  const handleDeleteImport = async (importId: number) => {
    setIsDeleting(true);
    try {
      const base = (import.meta.env.BASE_URL || "").replace(/\/$/, "");
      const res = await fetch(`${base}/api/import/${importId}`, { method: "DELETE", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menghapus");
      toast({ title: "Import Dihapus", description: data.message });
      setDeleteConfirmId(null);
      refetch();
    } catch (e: any) {
      toast({ title: "Gagal Menghapus", description: e.message || "Terjadi kesalahan", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Sheet Picker Modal */}
      {sheetPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center gap-3">
              <Layers className="w-4 h-4 text-primary" />
              <div>
                <p className="font-display font-bold text-sm text-foreground">Pilih Sheet</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[220px]">{sheetPicker.file.name}</p>
              </div>
            </div>
            <div className="p-4 space-y-2">
              <p className="text-xs text-muted-foreground mb-3">File ini memiliki {sheetPicker.sheets.length} sheet. Pilih sheet yang berisi data:</p>
              {sheetPicker.sheets.map(sheet => (
                <button
                  key={sheet}
                  onClick={() => commitFile(sheetPicker.file, sheet)}
                  className="w-full text-left px-4 py-2.5 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 text-sm font-medium text-foreground transition-all"
                >
                  {sheet}
                </button>
              ))}
            </div>
            <div className="px-4 pb-4">
              <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => setSheetPicker(null)}>
                Batal
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Conflict Warning Banner */}
      {conflictInfo && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-display font-bold text-amber-900 text-sm mb-1">Data Duplikat Terdeteksi</p>
              <p className="text-amber-800 text-xs mb-3">{conflictInfo.error}</p>
              <div className="bg-amber-100/70 border border-amber-200 rounded-xl px-4 py-2.5 mb-4 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-amber-700">Import yang ada:</span><span className="font-semibold text-amber-900">#{conflictInfo.existingId}</span></div>
                <div className="flex justify-between"><span className="text-amber-700">Baris lama:</span><span className="font-semibold text-amber-900">{conflictInfo.existingRows?.toLocaleString("id-ID")} baris</span></div>
                <div className="flex justify-between"><span className="text-amber-700">Waktu import lama:</span><span className="font-semibold text-amber-900">{conflictInfo.importedAt ? format(new Date(conflictInfo.importedAt), "dd MMM yyyy, HH:mm", { locale: id }) : "-"}</span></div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" onClick={handleOverwrite} disabled={isOverwriting} className="bg-amber-600 hover:bg-amber-700">
                  {isOverwriting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                  Timpa Data Lama
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConflictInfo(null)} disabled={isOverwriting}>Batalkan</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main card */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        {/* Tab bar */}
        <div className="flex border-b border-border bg-secondary/20">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setConflictInfo(null); }}
              className={cn(
                "flex items-center gap-2 px-5 py-4 text-sm font-semibold transition-all relative",
                activeTab === tab.id ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />
              )}
            </button>
          ))}
        </div>

        <div className="p-6 space-y-4">
          {/* File upload with drag & drop */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              File Excel (.xlsx / .xls)
            </label>

            {currentFile ? (
              <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-emerald-800 truncate">{currentFile.name}</p>
                  <p className="text-xs text-emerald-600">
                    {(currentFile.size / 1024).toFixed(0)} KB
                    {currentSheetName && <> · Sheet: <span className="font-medium">{currentSheetName}</span></>}
                  </p>
                </div>
                <button onClick={clearFile} className="text-emerald-400 hover:text-emerald-700 transition-colors p-0.5">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  "w-full px-4 py-8 border-2 border-dashed rounded-xl text-center cursor-pointer transition-all select-none",
                  isDragOver
                    ? "border-primary bg-primary/5 scale-[1.01]"
                    : "border-border hover:border-primary/40 hover:bg-primary/[0.02]"
                )}
              >
                <UploadCloud className={cn("w-8 h-8 mx-auto mb-2 transition-colors", isDragOver ? "text-primary" : "text-muted-foreground/40")} />
                <p className={cn("text-sm font-semibold transition-colors", isDragOver ? "text-primary" : "text-muted-foreground")}>
                  {isDragOver ? "Lepaskan file di sini" : "Klik atau seret file Excel ke sini"}
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">Format: .xlsx atau .xls</p>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileInputChange} />
          </div>

          {/* Auto-detected / warning banners */}
          {fileDetected && (
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border bg-emerald-50 border-emerald-200 text-emerald-700 text-xs font-medium">
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span>Snapshot terdeteksi dari nama file: <strong>{fileDetected.display}</strong> (Periode: {fileDetected.period})</span>
            </div>
          )}
          {!fileDetected && currentFile && (
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border bg-amber-50 border-amber-200 text-amber-700 text-xs font-medium">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Tanggal tidak terdeteksi dari nama file — isi tanggal snapshot secara manual di bawah</span>
            </div>
          )}

          {/* Same-day duplicate warning */}
          {sameDayImport && (
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl border bg-amber-50 border-amber-300 text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <div className="text-xs">
                <p className="font-bold mb-0.5">Sudah Ada Snapshot Hari Ini</p>
                <p className="text-amber-700 leading-relaxed">
                  {formatSnapshotTitle(sameDayImport.createdAt, sameDayImport.type)} sudah tersimpan ({sameDayImport.rowsImported} baris).
                  Jika Anda mengimport ulang, data lama untuk periode ini akan <strong>ditimpa</strong>.
                </p>
              </div>
            </div>
          )}

          {/* Snapshot date + Import button */}
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" /> Tanggal Snapshot
                <span className="text-[10px] font-normal normal-case text-muted-foreground/60">(opsional)</span>
              </label>
              <input
                type="date"
                value={currentSnapshotOverride}
                onChange={e => setSnapshotOverride(prev => ({ ...prev, [activeTab]: e.target.value }))}
                className="h-9 px-3 bg-secondary/40 border border-border rounded-lg text-sm font-sans focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all"
              />
            </div>
            {currentSnapshotOverride && !isPending && (
              <Button size="sm" variant="outline" onClick={() => setSnapshotOverride(prev => ({ ...prev, [activeTab]: "" }))}>
                Reset
              </Button>
            )}
            {/* Progress bar (inline, appears when importing) */}
            {importProgress && (
              <div className="flex-1 min-w-[160px] flex flex-col justify-end gap-1.5 pb-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-muted-foreground truncate">{importProgress.stage}</span>
                  <span className={cn(
                    "text-[11px] font-bold tabular-nums shrink-0",
                    importProgress.percent === 100 ? "text-emerald-600" : "text-primary"
                  )}>{importProgress.percent}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-border overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-200 ease-out",
                      importProgress.percent === 100 ? "bg-emerald-500" : "bg-primary"
                    )}
                    style={{ width: `${importProgress.percent}%` }}
                  />
                </div>
              </div>
            )}
            <Button onClick={handleSync} disabled={isPending || !currentFile} className="h-9 px-5 gap-2">
              {isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Mengimport...</>
                : <><UploadCloud className="w-4 h-4" /> Import Sekarang <ArrowRight className="w-3.5 h-3.5" /></>
              }
            </Button>
          </div>

          {/* Period info */}
          {finalPeriod && !isPending && (
            <p className="text-xs text-muted-foreground">
              periode: <span className="font-semibold text-foreground">{finalPeriod}</span>
              {finalSnapshotDate && <> &middot; snapshot: <span className="font-semibold text-foreground">{finalSnapshotDate}</span></>}
            </p>
          )}

          {/* Cleaning info */}
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-secondary/60 border border-border text-xs text-muted-foreground">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary/60" />
            <div>
              <span className="font-semibold text-foreground">Pipeline cleaning aktif:</span>
              {activeTab === "performansi" && " File RAW (PERIODE, NAMA_AM, TARGET_REVENUE, REAL_REVENUE per pelanggan) — otomatis diagregasi per AM."}
              {activeTab === "funnel" && " Filter witel=SURAMADU, divisi=DPS/DSS, validasi NIK, fix AM Reni→Havea (mulai 2026), UPPER+TRIM pelanggan."}
              {activeTab === "activity" && " Filter witel=SURAMADU, divisi=DPS/DSS, validasi NIK, UPPER+TRIM nama customer."}
            </div>
          </div>
        </div>
      </div>

      {/* History Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-border flex items-center gap-3">
          <History className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-display font-bold text-sm text-foreground">Riwayat Import — {activeTabData.label}</h2>
          <span className="ml-auto text-xs text-muted-foreground">{filteredHistory.length} snapshot tersedia</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-secondary/30 border-b border-border">
                <th className="px-6 py-3 text-xs font-bold text-foreground uppercase tracking-wide">Versi Snapshot</th>
                <th className="px-5 py-3 text-xs font-bold text-foreground uppercase tracking-wide">Periode</th>
                <th className="px-5 py-3 text-xs font-bold text-foreground uppercase tracking-wide text-right">Baris</th>
                <th className="px-5 py-3 text-xs font-bold text-foreground uppercase tracking-wide">Status</th>
                <th className="px-5 py-3 text-xs font-bold text-foreground uppercase tracking-wide text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filteredHistory.map((h, i) => (
                <tr key={i} className={cn("transition-colors", deleteConfirmId === h.id ? "bg-red-50" : "hover:bg-secondary/20")}>
                  <td className="px-6 py-3.5">
                    <p className="text-xs font-semibold text-foreground leading-snug">{formatSnapshotTitle(h.createdAt, h.type)}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{format(new Date(h.createdAt), 'HH:mm:ss', { locale: id })} WIB · ID #{h.id}</p>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-sm text-foreground">{h.period}</td>
                  <td className="px-5 py-3.5 text-right font-semibold text-foreground tabular-nums">{h.rowsImported.toLocaleString('id-ID')}</td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-semibold bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3" /> Sukses
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {deleteConfirmId === h.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-xs text-red-600 font-semibold">Hapus semua data?</span>
                        <Button size="sm" variant="destructive" onClick={() => handleDeleteImport(h.id)} disabled={isDeleting}>
                          {isDeleting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Trash2 className="w-3 h-3 mr-1" />}
                          Ya, Hapus
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setDeleteConfirmId(null)} disabled={isDeleting}>Batal</Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => navigate(`/import/detail/${h.id}`)} className="text-muted-foreground hover:text-blue-600 hover:bg-blue-50">
                          <Eye className="w-3 h-3 mr-1" /> Lihat Data
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleteConfirmId(h.id)} className="text-muted-foreground hover:text-red-600 hover:bg-red-50">
                          <Trash2 className="w-3 h-3 mr-1" /> Hapus
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {filteredHistory.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-14 text-center text-muted-foreground text-sm">
                    <History className="w-8 h-8 mx-auto mb-3 opacity-30" />
                    Belum ada riwayat import untuk {activeTabData.label}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

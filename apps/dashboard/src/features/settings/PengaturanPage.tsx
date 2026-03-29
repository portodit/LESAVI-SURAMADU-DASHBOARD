import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/shared/hooks/use-toast";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import {
  Settings, Bot, CheckCircle2, XCircle, Eye, EyeOff, Save, Loader2, ExternalLink, Zap,
  Sheet, FolderOpen, RefreshCw, Play, History, Terminal, CircleCheck, CircleX,
  SkipForward, AlertCircle, ChevronDown, ChevronUp,
} from "lucide-react";

const API = import.meta.env.BASE_URL?.replace(/\/$/, "") + "/api";

async function apiFetch<T = any>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(API + path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...opts?.headers },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw new Error(err.error || err.message || `API ${res.status}`);
  }
  return res.json();
}

const TABS = [
  { id: "bot",  label: "Bot Telegram",      icon: Bot },
  { id: "sync", label: "Sinkronisasi Data",  icon: RefreshCw },
] as const;
type TabId = typeof TABS[number]["id"];

export default function PengaturanPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>("bot");

  // ── Bot / Notif state ─────────────────────────────────────────────────────
  const [showToken, setShowToken] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [autoSend, setAutoSend] = useState(true);
  const [kpiDefault, setKpiDefault] = useState(30);

  // ── GSheets / Drive state ─────────────────────────────────────────────────
  const [syncMode, setSyncMode] = useState<"sheets" | "drive">("sheets");
  const [gsForm, setGsForm] = useState({
    spreadsheetId: "", apiKey: "", funnelPattern: "TREG3_SALES_FUNNEL_",
    syncEnabled: false, syncHourWib: 6, syncIntervalDays: 1,
  });
  const [driveForm, setDriveForm] = useState({
    folderPerformance: "", folderFunnel: "", folderActivity: "", folderTarget: "",
  });
  const [driveSchedulerForm, setDriveSchedulerForm] = useState({ enabled: false, hourWib: 7, intervalDays: 1 });
  const [driveSchedulerSaving, setDriveSchedulerSaving] = useState(false);
  const [checkNowLoading, setCheckNowLoading] = useState(false);
  const [driveLogsOpen, setDriveLogsOpen] = useState(true);
  const [gsSaving, setGsSaving] = useState(false);
  const [gsSyncing, setGsSyncing] = useState(false);
  const [gsSyncResult, setGsSyncResult] = useState<any>(null);
  const [gsSheets, setGsSheets] = useState<any[]>([]);
  const [gsLoadingSheets, setGsLoadingSheets] = useState(false);
  const [gsSelected, setGsSelected] = useState<Record<string, boolean>>({});
  const [gsTypeOverride, setGsTypeOverride] = useState<Record<string, "funnel" | "activity" | "performance" | "">>({});
  const [gsSyncingSelected, setGsSyncingSelected] = useState(false);
  const [driveSaving, setDriveSaving] = useState(false);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: settings, refetch: refetchSettings } = useQuery<any>({
    queryKey: ["settings"],
    queryFn: () => apiFetch("/settings"),
  });

  const { data: botStatus, refetch: refetchStatus, isLoading: checkingBot } = useQuery<any>({
    queryKey: ["bot-status"],
    queryFn: () => apiFetch("/telegram/bot-status"),
    refetchInterval: false,
    enabled: activeTab === "bot",
  });

  const { data: gsStatus, refetch: refetchGsStatus } = useQuery<any>({
    queryKey: ["gsheets-status"],
    queryFn: () => apiFetch("/gsheets/sync-status"),
    staleTime: 30_000,
    enabled: activeTab === "sync",
  });

  const { data: driveLogsData, refetch: refetchDriveLogs } = useQuery<{ logs: any[] }>({
    queryKey: ["drive-read-logs"],
    queryFn: () => apiFetch("/gdrive/read-logs?limit=30"),
    staleTime: 30_000,
    enabled: activeTab === "sync" && syncMode === "drive",
  });

  // ── Populate forms from settings ──────────────────────────────────────────
  useEffect(() => {
    if (!settings) return;
    setAutoSend(settings.autoSendOnImport ?? true);
    setKpiDefault(settings.kpiActivityDefault ?? 30);
    if (settings.telegramBotToken) setTokenInput(settings.telegramBotToken);
    const hasDriveFolders = !!(settings.gDriveFolderFunnel || settings.gDriveFolderPerformance || settings.gDriveFolderActivity);
    setGsForm(p => ({
      spreadsheetId: settings.gSheetsSpreadsheetId || "",
      apiKey: settings.gSheetsApiKey?.startsWith("***") ? p.apiKey : (settings.gSheetsApiKey || ""),
      funnelPattern: settings.gSheetsFunnelPattern || "TREG3_SALES_FUNNEL_",
      syncEnabled: settings.gSheetsSyncEnabled ?? false,
      syncHourWib: settings.gSheetsSyncHourWib ?? 6,
      syncIntervalDays: settings.gSheetsSyncIntervalDays ?? 1,
    }));
    setDriveForm({
      folderPerformance: settings.gDriveFolderPerformance || "",
      folderFunnel: settings.gDriveFolderFunnel || "",
      folderActivity: settings.gDriveFolderActivity || "",
      folderTarget: settings.gDriveFolderTarget || "",
    });
    setDriveSchedulerForm({
      enabled: settings.gDriveSyncEnabled ?? false,
      hourWib: settings.gDriveSyncHourWib ?? 7,
      intervalDays: settings.gDriveSyncIntervalDays ?? 1,
    });
    if (hasDriveFolders) setSyncMode("drive");
  }, [settings]);

  // ── Bot mutation ──────────────────────────────────────────────────────────
  const saveBotMut = useMutation({
    mutationFn: (body: object) => apiFetch("/settings", { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "Pengaturan disimpan" });
      refetchSettings();
      refetchStatus();
    },
    onError: (e: any) => toast({ title: "Gagal menyimpan", description: e.message, variant: "destructive" }),
  });

  const handleSaveBot = () => {
    const body: any = { autoSendOnImport: autoSend, kpiActivityDefault: kpiDefault };
    if (tokenInput && !tokenInput.startsWith("***")) body.telegramBotToken = tokenInput;
    saveBotMut.mutate(body);
  };

  // ── GSheets handlers ──────────────────────────────────────────────────────
  const handleSaveGsSettings = async () => {
    setGsSaving(true);
    try {
      await apiFetch("/settings", {
        method: "PATCH",
        body: JSON.stringify({
          gSheetsSpreadsheetId: gsForm.spreadsheetId,
          gSheetsApiKey: gsForm.apiKey || undefined,
          gSheetsFunnelPattern: gsForm.funnelPattern,
          gSheetsSyncEnabled: gsForm.syncEnabled,
          gSheetsSyncHourWib: gsForm.syncHourWib,
          gSheetsSyncIntervalDays: gsForm.syncIntervalDays,
        }),
      });
      toast({ title: "Konfigurasi Google Sheets disimpan" });
      refetchGsStatus();
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e: any) {
      toast({ title: "Gagal Simpan", description: e.message, variant: "destructive" });
    } finally { setGsSaving(false); }
  };

  const handleSaveDriveFolders = async () => {
    setDriveSaving(true);
    try {
      await apiFetch("/settings", {
        method: "PATCH",
        body: JSON.stringify({
          gDriveFolderPerformance: driveForm.folderPerformance || null,
          gDriveFolderFunnel: driveForm.folderFunnel || null,
          gDriveFolderActivity: driveForm.folderActivity || null,
          gDriveFolderTarget: driveForm.folderTarget || null,
        }),
      });
      toast({ title: "Folder Google Drive disimpan" });
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e: any) {
      toast({ title: "Gagal Simpan", description: e.message, variant: "destructive" });
    } finally { setDriveSaving(false); }
  };

  const handleSaveDriveScheduler = async () => {
    setDriveSchedulerSaving(true);
    try {
      await apiFetch("/settings", {
        method: "PATCH",
        body: JSON.stringify({
          gDriveSyncEnabled: driveSchedulerForm.enabled,
          gDriveSyncHourWib: driveSchedulerForm.hourWib,
          gDriveSyncIntervalDays: driveSchedulerForm.intervalDays,
        }),
      });
      toast({
        title: "Jadwal Drive Disimpan",
        description: driveSchedulerForm.enabled
          ? `Cek otomatis jam ${String(driveSchedulerForm.hourWib).padStart(2,"0")}:00 WIB setiap ${driveSchedulerForm.intervalDays} hari`
          : "Jadwal otomatis dinonaktifkan",
      });
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e: any) {
      toast({ title: "Gagal Simpan", description: e.message, variant: "destructive" });
    } finally { setDriveSchedulerSaving(false); }
  };

  const handleCheckNow = async () => {
    setCheckNowLoading(true);
    try {
      const result = await apiFetch<{ results: any[] }>("/gdrive/check-now?type=all", { method: "POST" });
      const imported = (result.results || []).filter(r => r.condition === "imported").length;
      const skipped = (result.results || []).filter(r => r.condition === "date_same").length;
      const errors = (result.results || []).filter(r => ["api_error","import_error"].includes(r.condition)).length;
      toast({
        title: imported > 0 ? `${imported} folder berhasil diimport` : "Pengecekan selesai",
        description: `${imported} import · ${skipped} dilewati · ${errors} error`,
      });
      refetchDriveLogs();
    } catch (e: any) {
      toast({ title: "Gagal Cek Drive", description: e.message, variant: "destructive" });
    } finally { setCheckNowLoading(false); }
  };

  const handleLoadGsSheets = async () => {
    setGsLoadingSheets(true);
    setGsSheets([]);
    setGsSelected({});
    setGsTypeOverride({});
    try {
      const data = await apiFetch<{ sheets: any[] }>("/gsheets/sheets");
      const sheets = data.sheets || [];
      setGsSheets(sheets);
      const autoSel: Record<string, boolean> = {};
      const autoType: Record<string, "funnel" | "activity" | "performance" | ""> = {};
      sheets.forEach((s: any) => {
        autoSel[s.title] = !!s.detectedType;
        autoType[s.title] = s.detectedType || "";
      });
      setGsSelected(autoSel);
      setGsTypeOverride(autoType);
    } catch (e: any) {
      toast({ title: "Gagal Memuat Sheet", description: e.message, variant: "destructive" });
    } finally { setGsLoadingSheets(false); }
  };

  const handleGsSync = async () => {
    setGsSyncing(true);
    setGsSyncResult(null);
    try {
      const result = await apiFetch<any>("/gsheets/sync", { method: "POST" });
      setGsSyncResult(result);
      refetchGsStatus();
      const imported = result.results?.filter((r: any) => r.status === "imported").length ?? 0;
      toast({ title: imported > 0 ? `${imported} snapshot berhasil diimport` : "Sync selesai", description: `${result.sheetsFound || 0} sheet ditemukan` });
    } catch (e: any) {
      toast({ title: "Sync Gagal", description: e.message, variant: "destructive" });
    } finally { setGsSyncing(false); }
  };

  const handleSyncSelected = async () => {
    const selections = gsSheets
      .filter((s: any) => gsSelected[s.title])
      .map((s: any) => ({
        title: s.title,
        sheetId: s.sheetId,
        type: (gsTypeOverride[s.title] || s.detectedType) as "funnel" | "activity" | "performance",
      }))
      .filter(sel => !!sel.type);
    if (selections.length === 0) {
      toast({ title: "Belum ada pilihan", description: "Pilih minimal satu sheet dan pastikan tipe data dipilih", variant: "destructive" });
      return;
    }
    setGsSyncingSelected(true);
    try {
      const result = await apiFetch<any>("/gsheets/sync-selected", {
        method: "POST",
        body: JSON.stringify({ selections }),
      });
      setGsSyncResult(result);
      refetchGsStatus();
      const imported = (result.results || []).filter((r: any) => r.status === "imported").length;
      toast({ title: imported > 0 ? `${imported} sheet berhasil diimport` : "Sync selesai", description: `${selections.length} sheet diproses` });
    } catch (e: any) {
      toast({ title: "Gagal Import", description: e.message, variant: "destructive" });
    } finally { setGsSyncingSelected(false); }
  };

  const isTokenMasked = settings?.telegramBotToken && tokenInput === settings?.telegramBotToken && tokenInput.startsWith("***");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
          <Settings className="w-5 h-5 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-display font-bold text-foreground">Pengaturan</h1>
          <p className="text-sm text-muted-foreground">Konfigurasi integrasi bot, notifikasi, dan sinkronisasi data</p>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 p-1 bg-secondary/50 border border-border rounded-xl w-fit">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                activeTab === tab.id
                  ? "bg-background text-foreground shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Bot Telegram Tab ─────────────────────────────────────────────────── */}
      {activeTab === "bot" && (
        <div className="space-y-4 max-w-2xl">
          {/* Telegram Bot Token card */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex-1">
                <h2 className="font-display font-bold text-sm text-foreground">Integrasi Telegram Bot</h2>
                <p className="text-xs text-muted-foreground">Token dari @BotFather</p>
              </div>
              {checkingBot ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-secondary px-2.5 py-1 rounded-full">
                  <Loader2 className="w-3 h-3 animate-spin" /> Cek...
                </span>
              ) : botStatus?.connected ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Terhubung
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-secondary px-2.5 py-1 rounded-full">
                  <XCircle className="w-3.5 h-3.5" /> Belum terhubung
                </span>
              )}
            </div>

            {botStatus?.connected && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-emerald-800">@{botStatus.botUsername}</p>
                  <p className="text-xs text-emerald-700 mt-0.5">{botStatus.botName} · Siap mengirim notifikasi</p>
                </div>
                <a href={`https://t.me/${botStatus.botUsername}`} target="_blank" rel="noopener noreferrer"
                  className="shrink-0 flex items-center gap-1 text-xs text-emerald-700 font-semibold hover:underline">
                  <ExternalLink className="w-3 h-3" /> Buka
                </a>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">
                  Bot Token (dari BotFather)
                </label>
                <div className="relative">
                  <input
                    type={showToken ? "text" : "password"}
                    value={tokenInput}
                    onChange={e => setTokenInput(e.target.value)}
                    placeholder="1234567890:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full px-4 py-2.5 pr-10 bg-secondary/50 border border-border rounded-lg text-sm font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  />
                  <button type="button" onClick={() => setShowToken(!showToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {isTokenMasked && (
                  <p className="text-xs text-muted-foreground mt-1">Token tersimpan. Masukkan token baru untuk mengganti.</p>
                )}
              </div>
              <div className="bg-secondary/40 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground/70">Cara mendapatkan token:</p>
                <ol className="list-decimal list-inside space-y-0.5 pl-1">
                  <li>Buka Telegram → cari <span className="font-mono bg-secondary px-1 rounded">@BotFather</span></li>
                  <li>Ketik <span className="font-mono bg-secondary px-1 rounded">/newbot</span> dan ikuti instruksi</li>
                  <li>Salin token yang diberikan ke kolom di atas</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Notifikasi card */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <h2 className="font-display font-bold text-sm text-foreground">Notifikasi & KPI</h2>
                <p className="text-xs text-muted-foreground">Pengaturan reminder otomatis</p>
              </div>
            </div>
            <div className="space-y-5">
              <label className="flex items-center justify-between gap-4 cursor-pointer">
                <div>
                  <p className="text-sm font-semibold text-foreground">Kirim reminder saat import data</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Bot otomatis kirim ke semua AM setelah data berhasil diimport</p>
                </div>
                <div onClick={() => setAutoSend(!autoSend)} className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 cursor-pointer",
                  autoSend ? "bg-primary" : "bg-secondary border border-border"
                )}>
                  <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
                    autoSend ? "translate-x-6" : "translate-x-1")} />
                </div>
              </label>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">
                  KPI Kunjungan Default per AM (per bulan)
                </label>
                <div className="flex items-center gap-3">
                  <input type="number" value={kpiDefault} onChange={e => setKpiDefault(Number(e.target.value))}
                    min={1} max={100}
                    className="w-24 px-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                  <span className="text-sm text-muted-foreground">kunjungan/bulan</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Target KPI jika tidak diset per-AM</p>
              </div>
            </div>
          </div>

          {/* Save button */}
          <button onClick={handleSaveBot} disabled={saveBotMut.isPending}
            className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/25 hover:shadow-primary/40 active:scale-[0.99] transition-all disabled:opacity-50">
            {saveBotMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saveBotMut.isPending ? "Menyimpan..." : "Simpan Pengaturan Bot"}
          </button>

          {botStatus?.connected && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-blue-700 mb-2">Cara AM menghubungkan akun ke bot:</p>
              <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
                <li>Buka halaman Bot Telegram → tab "Koneksi AM"</li>
                <li>Klik "Generate Kode" untuk AM yang ingin dihubungkan</li>
                <li>Bagikan kode 6 digit ke AM tersebut</li>
                <li>AM buka Telegram → cari <span className="font-mono bg-blue-100 px-1 rounded">@{botStatus.botUsername}</span> → Start</li>
                <li>AM kirimkan kode ke bot → akun otomatis terhubung</li>
              </ol>
            </div>
          )}
        </div>
      )}

      {/* ── Sinkronisasi Data Tab ─────────────────────────────────────────────── */}
      {activeTab === "sync" && (
        <div className="space-y-3">

          {/* Top bar: API Key + Mode selector */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-1 min-w-[260px]">
                <div className="shrink-0">
                  {settings?.gSheetsApiKey
                    ? <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3" /> API Key
                      </span>
                    : <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                        <AlertCircle className="w-3 h-3" /> API Key
                      </span>
                  }
                </div>
                <input
                  type="password"
                  value={gsForm.apiKey}
                  onChange={e => setGsForm(p => ({ ...p, apiKey: e.target.value }))}
                  placeholder={settings?.gSheetsApiKey ? "Sudah tersimpan — isi untuk mengganti" : "AIza... (Google API Key)"}
                  className="flex-1 h-8 px-3 bg-background border border-border rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <Button size="sm" onClick={handleSaveGsSettings} disabled={gsSaving || !gsForm.apiKey} className="h-8 gap-1.5 text-xs shrink-0">
                  {gsSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Simpan
                </Button>
              </div>

              <div className="flex items-center gap-1 p-0.5 bg-secondary/60 border border-border rounded-lg shrink-0">
                {([
                  { key: "sheets" as const, label: "Google Sheets", icon: Sheet, iconCls: "text-emerald-600" },
                  { key: "drive"  as const, label: "Google Drive",  icon: FolderOpen, iconCls: "text-amber-500" },
                ]).map(({ key, label, icon: Icon, iconCls }) => (
                  <button key={key} onClick={() => setSyncMode(key)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all",
                      syncMode === key
                        ? "bg-background text-foreground shadow-sm border border-border"
                        : "text-muted-foreground hover:text-foreground"
                    )}>
                    <Icon className={cn("w-3.5 h-3.5", iconCls)} />
                    {label}
                    {key === "drive" && driveSchedulerForm.enabled && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Sheets Mode ──────────────────────────────────────────────────── */}
          {syncMode === "sheets" && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border flex items-center gap-3">
                <Sheet className="w-4 h-4 text-emerald-600" />
                <h2 className="font-display font-bold text-sm text-foreground">Import dari Google Sheets</h2>
                <p className="text-[11px] text-muted-foreground">Paste URL → Cek Sheet → Pilih → Import</p>
              </div>
              <div className="p-5 space-y-4">
                {/* URL + save + cek */}
                <div className="space-y-1.5">
                  <div className="flex gap-2">
                    <input type="text" value={gsForm.spreadsheetId}
                      onChange={e => {
                        const val = e.target.value.trim();
                        const match = val.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
                        setGsForm(p => ({ ...p, spreadsheetId: match ? match[1] : val }));
                      }}
                      placeholder="Paste URL Google Sheets atau Spreadsheet ID..."
                      className="flex-1 h-9 px-3 bg-background border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <Button variant="outline" onClick={handleSaveGsSettings} disabled={gsSaving} className="gap-1.5 h-9 text-xs shrink-0">
                      {gsSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      Simpan ID
                    </Button>
                    <Button variant="outline" onClick={handleLoadGsSheets} disabled={gsLoadingSheets || !gsForm.spreadsheetId} className="gap-1.5 h-9 text-xs shrink-0">
                      {gsLoadingSheets ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sheet className="w-3.5 h-3.5" />}
                      Cek Sheet
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Pola otomatis: <span className="font-mono">TREG3_SALES_FUNNEL_YYYYMMDD</span> · <span className="font-mono">TREG3_ACTIVITY_YYYYMMDD</span> · <span className="font-mono">PERFORMANSI_YYYYMMDD</span></p>
                </div>

                {/* Sheet list */}
                {gsSheets.length > 0 && (() => {
                  const detected = gsSheets.filter((s: any) => s.detectedType);
                  const selectedCount = gsSheets.filter((s: any) => gsSelected[s.title]).length;
                  return (
                    <div className="border border-border rounded-xl overflow-hidden">
                      <div className="px-4 py-2 bg-secondary/40 border-b border-border flex items-center gap-2">
                        <Sheet className="w-3.5 h-3.5 text-primary" />
                        <p className="text-xs font-bold text-foreground flex-1">
                          {gsSheets.length} sheet
                          {detected.length > 0 && <span className="ml-1 font-normal text-emerald-700">({detected.length} auto-detect)</span>}
                        </p>
                        <div className="flex items-center gap-2 ml-auto">
                          <button onClick={() => { const a: Record<string, boolean> = {}; gsSheets.forEach((s: any) => { a[s.title] = true; }); setGsSelected(a); }}
                            className="text-[11px] text-primary font-semibold hover:underline">Pilih Semua</button>
                          <span className="text-muted-foreground text-[11px]">·</span>
                          <button onClick={() => setGsSelected({})} className="text-[11px] text-muted-foreground font-semibold hover:underline">Batal</button>
                        </div>
                      </div>
                      <div className="divide-y divide-border max-h-52 overflow-y-auto">
                        {gsSheets.map((s: any) => {
                          const match = s.title.match(/(\d{8})$/);
                          const dateStr = match ? `${match[1].slice(0,4)}-${match[1].slice(4,6)}-${match[1].slice(6,8)}` : null;
                          const currentType = gsTypeOverride[s.title] || s.detectedType || "";
                          const isChecked = !!gsSelected[s.title];
                          return (
                            <div key={s.sheetId} className={cn("px-3 py-2 flex items-center gap-2.5 transition-colors", isChecked ? "bg-primary/5" : "hover:bg-secondary/20")}>
                              <input type="checkbox" checked={isChecked} onChange={e => setGsSelected(p => ({ ...p, [s.title]: e.target.checked }))} className="w-3.5 h-3.5 accent-primary shrink-0 cursor-pointer" />
                              <Sheet className="w-3 h-3 text-muted-foreground shrink-0" />
                              <span className="font-mono text-[11px] text-foreground flex-1 truncate" title={s.title}>{s.title}</span>
                              {dateStr && <span className="text-[10px] text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded-full shrink-0">{dateStr}</span>}
                              <select value={currentType} onChange={e => setGsTypeOverride(p => ({ ...p, [s.title]: e.target.value as any }))}
                                className={cn("h-6 px-1.5 text-[10px] font-semibold rounded border focus:outline-none shrink-0",
                                  currentType === "funnel" ? "bg-blue-50 border-blue-200 text-blue-700"
                                    : currentType === "activity" ? "bg-purple-50 border-purple-200 text-purple-700"
                                    : currentType === "performance" ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                    : "bg-secondary border-border text-muted-foreground")}>
                                <option value="">-- Tipe --</option>
                                <option value="funnel">Sales Funnel</option>
                                <option value="activity">Sales Activity</option>
                                <option value="performance">Performa AM</option>
                              </select>
                            </div>
                          );
                        })}
                      </div>
                      <div className="px-4 py-2.5 bg-secondary/20 border-t border-border flex items-center justify-between gap-3">
                        <p className="text-[11px] text-muted-foreground">
                          {selectedCount > 0 ? <><strong className="text-foreground">{selectedCount} sheet</strong> dipilih</> : "Centang sheet yang ingin diimport"}
                        </p>
                        <Button onClick={handleSyncSelected} disabled={gsSyncingSelected || selectedCount === 0} size="sm" className="gap-2 h-8 text-xs">
                          {gsSyncingSelected ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                          Import Pilihan ({selectedCount})
                        </Button>
                      </div>
                    </div>
                  );
                })()}

                {/* Quick sync + result */}
                <div className="flex items-center gap-3">
                  <Button onClick={handleGsSync} disabled={gsSyncing || !gsStatus?.configured} variant="outline" size="sm" className="gap-2 h-8 text-xs">
                    {gsSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Sync Semua (skip duplikat)
                  </Button>
                  {!gsStatus?.configured && <p className="text-xs text-amber-600 font-medium">Simpan Spreadsheet ID dulu</p>}
                </div>

                {(gsSyncResult || gsStatus?.lastSyncResult) && (() => {
                  const result = gsSyncResult || gsStatus?.lastSyncResult;
                  return (
                    <div className="border border-border rounded-xl overflow-hidden">
                      <div className="px-4 py-2 bg-secondary/30 border-b border-border flex items-center gap-2 text-xs">
                        <History className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="font-bold text-foreground flex-1">Hasil Sync Terakhir</span>
                        {result.syncedAt && <span className="text-muted-foreground">{format(new Date(result.syncedAt), "d MMM, HH:mm", { locale: id })}</span>}
                      </div>
                      <div className="divide-y divide-border/50 max-h-48 overflow-y-auto">
                        {(result.results || []).map((r: any, i: number) => (
                          <div key={i} className="px-4 py-2 flex items-center gap-3">
                            {r.status === "imported" && <CircleCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                            {r.status === "skipped"  && <SkipForward className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                            {r.status === "error"    && <CircleX    className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                            <p className="font-mono text-[11px] text-foreground flex-1 truncate">{r.sheetName}</p>
                            <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{r.message}</p>
                            {r.rowsImported && <span className="text-[10px] font-bold text-emerald-600 shrink-0">{r.rowsImported}b</span>}
                          </div>
                        ))}
                      </div>
                      <div className="px-4 py-1.5 bg-secondary/20 border-t border-border flex items-center gap-4 text-[11px]">
                        <span className="text-emerald-600 font-bold">{(result.results || []).filter((r: any) => r.status === "imported").length} import</span>
                        <span className="text-amber-600 font-bold">{(result.results || []).filter((r: any) => r.status === "skipped").length} skip</span>
                        <span className="text-red-600 font-bold">{(result.results || []).filter((r: any) => r.status === "error").length} error</span>
                      </div>
                    </div>
                  );
                })()}

                {/* GSheets scheduler */}
                <div className="bg-secondary/30 border border-border rounded-xl p-4 space-y-3">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Sheet className="w-3.5 h-3.5 text-emerald-600" /> Jadwal Sync Otomatis
                  </p>
                  <div className="flex items-center gap-2">
                    <div className={cn("w-9 h-5 rounded-full transition-colors relative cursor-pointer shrink-0", gsForm.syncEnabled ? "bg-emerald-500" : "bg-secondary border border-border")}
                      onClick={() => setGsForm(p => ({ ...p, syncEnabled: !p.syncEnabled }))}>
                      <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all", gsForm.syncEnabled ? "left-4" : "left-0.5")} />
                    </div>
                    <span className="text-sm font-semibold">{gsForm.syncEnabled ? `Jam ${String(gsForm.syncHourWib).padStart(2,"0")}:00 WIB · setiap ${gsForm.syncIntervalDays} hari` : "Nonaktif"}</span>
                  </div>
                  {gsForm.syncEnabled && (
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1">Jam</label>
                        <select value={gsForm.syncHourWib} onChange={e => setGsForm(p => ({ ...p, syncHourWib: Number(e.target.value) }))}
                          className="w-full h-8 px-2 bg-background border border-border rounded-lg text-xs focus:outline-none">
                          {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2,"0")}:00</option>)}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1">Interval</label>
                        <select value={gsForm.syncIntervalDays} onChange={e => setGsForm(p => ({ ...p, syncIntervalDays: Number(e.target.value) }))}
                          className="w-full h-8 px-2 bg-background border border-border rounded-lg text-xs focus:outline-none">
                          <option value={1}>Harian</option>
                          <option value={2}>2 hari</option>
                          <option value={3}>3 hari</option>
                          <option value={7}>Mingguan</option>
                        </select>
                      </div>
                      <Button onClick={handleSaveGsSettings} disabled={gsSaving} size="sm" variant="outline" className="h-8 text-xs gap-1">
                        {gsSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        Simpan Jadwal
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Drive Mode ────────────────────────────────────────────────────── */}
          {syncMode === "drive" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {/* Folder URLs */}
                <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-border flex items-center gap-3">
                    <FolderOpen className="w-4 h-4 text-amber-500" />
                    <h2 className="font-display font-bold text-sm text-foreground">URL Folder Google Drive</h2>
                    <p className="text-[11px] text-muted-foreground ml-1">Akses: "Anyone with link can view"</p>
                  </div>
                  <div className="p-5 space-y-3">
                    {([
                      { key: "folderPerformance" as const, label: "Performa AM",    color: "text-emerald-600", configured: !!settings?.gDriveFolderPerformance },
                      { key: "folderFunnel"       as const, label: "Sales Funnel",   color: "text-blue-600",   configured: !!settings?.gDriveFolderFunnel },
                      { key: "folderActivity"     as const, label: "Sales Activity", color: "text-purple-600", configured: !!settings?.gDriveFolderActivity },
                      { key: "folderTarget"       as const, label: "Target HO",      color: "text-red-600",    configured: !!settings?.gDriveFolderTarget },
                    ]).map(({ key, label, color, configured }) => (
                      <div key={key} className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 w-28 shrink-0">
                          <label className={cn("text-[11px] font-bold uppercase tracking-wide", color)}>{label}</label>
                          {configured && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                        </div>
                        <input type="text" value={driveForm[key]} onChange={e => setDriveForm(p => ({ ...p, [key]: e.target.value }))}
                          placeholder="https://drive.google.com/drive/folders/..."
                          className="flex-1 h-8 px-3 bg-background border border-border rounded-lg text-[11px] font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                    ))}
                    <div className="flex items-center gap-2 pt-1">
                      <Button onClick={handleSaveDriveFolders} disabled={driveSaving} size="sm" className="gap-1.5 h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white">
                        {driveSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Simpan Folder
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Scheduler */}
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-border flex items-center gap-3">
                    <RefreshCw className="w-4 h-4 text-blue-500" />
                    <h2 className="font-display font-bold text-sm text-foreground">Jadwal Otomatis</h2>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-9 h-5 rounded-full transition-colors relative cursor-pointer shrink-0", driveSchedulerForm.enabled ? "bg-primary" : "bg-secondary border border-border")}
                        onClick={() => setDriveSchedulerForm(p => ({ ...p, enabled: !p.enabled }))}>
                        <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all", driveSchedulerForm.enabled ? "left-4" : "left-0.5")} />
                      </div>
                      <span className="text-sm font-semibold">{driveSchedulerForm.enabled ? "Aktif" : "Nonaktif"}</span>
                    </div>
                    {driveSchedulerForm.enabled && (
                      <>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Jam WIB</label>
                          <select value={driveSchedulerForm.hourWib} onChange={e => setDriveSchedulerForm(p => ({ ...p, hourWib: Number(e.target.value) }))}
                            className="w-full h-8 px-2 bg-background border border-border rounded-lg text-xs focus:outline-none">
                            {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2,"0")}:00</option>)}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Interval</label>
                          <select value={driveSchedulerForm.intervalDays} onChange={e => setDriveSchedulerForm(p => ({ ...p, intervalDays: Number(e.target.value) }))}
                            className="w-full h-8 px-2 bg-background border border-border rounded-lg text-xs focus:outline-none">
                            <option value={1}>Harian</option>
                            <option value={2}>2 hari</option>
                            <option value={3}>3 hari</option>
                            <option value={7}>Mingguan</option>
                          </select>
                        </div>
                      </>
                    )}
                    {settings?.gDriveLastCheckAt && (
                      <p className="text-[10px] text-muted-foreground">
                        Cek terakhir: <strong className="text-foreground">{format(new Date(settings.gDriveLastCheckAt), "d MMM, HH:mm", { locale: id })}</strong>
                      </p>
                    )}
                    <Button onClick={handleSaveDriveScheduler} disabled={driveSchedulerSaving} size="sm" className="w-full gap-1.5 h-8 text-xs">
                      {driveSchedulerSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      Simpan Jadwal
                    </Button>

                    {/* GSheets sub-scheduler */}
                    <div className="pt-2 border-t border-border space-y-2">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                        <Sheet className="w-3 h-3 text-emerald-600" /> Jadwal Google Sheets
                      </p>
                      <div className="flex items-center gap-2">
                        <div className={cn("w-8 h-4 rounded-full transition-colors relative cursor-pointer shrink-0", gsForm.syncEnabled ? "bg-emerald-500" : "bg-secondary border border-border")}
                          onClick={() => setGsForm(p => ({ ...p, syncEnabled: !p.syncEnabled }))}>
                          <div className={cn("absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all", gsForm.syncEnabled ? "left-4" : "left-0.5")} />
                        </div>
                        <span className="text-[11px] font-semibold">{gsForm.syncEnabled ? `Jam ${String(gsForm.syncHourWib).padStart(2,"0")}:00 · ${gsForm.syncIntervalDays}h` : "Nonaktif"}</span>
                      </div>
                      {gsForm.syncEnabled && (
                        <>
                          <div className="flex gap-1.5">
                            <select value={gsForm.syncHourWib} onChange={e => setGsForm(p => ({ ...p, syncHourWib: Number(e.target.value) }))}
                              className="flex-1 h-7 px-2 bg-background border border-border rounded text-[11px] focus:outline-none">
                              {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2,"0")}:00</option>)}
                            </select>
                            <select value={gsForm.syncIntervalDays} onChange={e => setGsForm(p => ({ ...p, syncIntervalDays: Number(e.target.value) }))}
                              className="flex-1 h-7 px-2 bg-background border border-border rounded text-[11px] focus:outline-none">
                              <option value={1}>Harian</option>
                              <option value={2}>2 hari</option>
                              <option value={7}>Mingguan</option>
                            </select>
                          </div>
                          <Button onClick={handleSaveGsSettings} disabled={gsSaving} size="sm" variant="outline" className="w-full h-7 text-[11px] gap-1">
                            {gsSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                            Simpan
                          </Button>
                        </>
                      )}
                    </div>

                    {/* Check Now */}
                    <div className="pt-2 border-t border-border">
                      <Button onClick={handleCheckNow} disabled={checkNowLoading} variant="outline" size="sm" className="w-full gap-1.5 h-8 text-xs">
                        {checkNowLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        Cek Semua Sekarang
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Drive Read Logs */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <button onClick={() => setDriveLogsOpen(p => !p)}
                  className="w-full px-5 py-3.5 flex items-center gap-3 hover:bg-secondary/20 transition-colors text-left border-b border-border">
                  <Terminal className="w-4 h-4 text-muted-foreground" />
                  <h2 className="font-display font-bold text-sm text-foreground flex-1">Riwayat Baca Folder Google Drive</h2>
                  <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); refetchDriveLogs(); }}
                    className="h-7 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground">
                    <RefreshCw className="w-3 h-3" /> Refresh
                  </Button>
                  {driveLogsOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                </button>
                {driveLogsOpen && (() => {
                  const logs = driveLogsData?.logs || [];
                  const conditionConfig: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
                    imported:        { label: "Imported",     cls: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: <CircleCheck className="w-3 h-3" /> },
                    date_same:       { label: "Skip (sama)",  cls: "bg-amber-100 text-amber-700 border-amber-200",       icon: <SkipForward  className="w-3 h-3" /> },
                    no_files:        { label: "Kosong",       cls: "bg-gray-100 text-gray-600 border-gray-200",           icon: <FolderOpen   className="w-3 h-3" /> },
                    format_invalid:  { label: "Format Salah", cls: "bg-orange-100 text-orange-700 border-orange-200",     icon: <AlertCircle  className="w-3 h-3" /> },
                    api_error:       { label: "API Error",    cls: "bg-red-100 text-red-700 border-red-200",             icon: <CircleX      className="w-3 h-3" /> },
                    import_error:    { label: "Import Error", cls: "bg-red-100 text-red-700 border-red-200",             icon: <CircleX      className="w-3 h-3" /> },
                    api_key_missing: { label: "No API Key",   cls: "bg-red-100 text-red-700 border-red-200",             icon: <AlertCircle  className="w-3 h-3" /> },
                    folder_missing:  { label: "No Folder",    cls: "bg-gray-100 text-gray-600 border-gray-200",           icon: <AlertCircle  className="w-3 h-3" /> },
                    folder_invalid:  { label: "URL Error",    cls: "bg-orange-100 text-orange-700 border-orange-200",     icon: <AlertCircle  className="w-3 h-3" /> },
                  };
                  const typeLabels: Record<string, { label: string; cls: string }> = {
                    performance: { label: "Performa AM",    cls: "bg-emerald-100 text-emerald-700" },
                    funnel:      { label: "Sales Funnel",   cls: "bg-blue-100 text-blue-700" },
                    activity:    { label: "Sales Activity", cls: "bg-purple-100 text-purple-700" },
                    target:      { label: "Target HO",      cls: "bg-red-100 text-red-700" },
                  };
                  return (
                    <div>
                      {logs.length === 0 ? (
                        <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                          <Terminal className="w-8 h-8 mx-auto mb-3 opacity-20" />
                          <p>Belum ada riwayat baca folder</p>
                          <p className="text-xs mt-1">Klik "Cek Semua Sekarang" untuk mulai, atau tunggu jadwal otomatis</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left">
                            <thead>
                              <tr className="bg-secondary/30 border-b border-border text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                                <th className="px-4 py-2">Waktu</th>
                                <th className="px-3 py-2">Tipe</th>
                                <th className="px-3 py-2">Kondisi</th>
                                <th className="px-3 py-2">File Terbaru</th>
                                <th className="px-3 py-2">Tgl File</th>
                                <th className="px-3 py-2">Snapshot DB</th>
                                <th className="px-3 py-2 text-right">Baris</th>
                                <th className="px-3 py-2">Pemicu</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                              {logs.map((log: any) => {
                                const cond = conditionConfig[log.condition] || { label: log.condition, cls: "bg-gray-100 text-gray-600 border-gray-200", icon: null };
                                const typeInfo = typeLabels[log.type] || { label: log.type, cls: "bg-gray-100 text-gray-600" };
                                return (
                                  <tr key={log.id} className={cn("hover:bg-secondary/20 transition-colors",
                                    log.condition === "imported" ? "bg-emerald-50/40" : log.condition === "date_same" ? "bg-amber-50/20" : "")}>
                                    <td className="px-4 py-2.5">
                                      <p className="text-[11px] font-semibold text-foreground">{format(new Date(log.checkedAt), "d MMM", { locale: id })}</p>
                                      <p className="text-[10px] text-muted-foreground">{format(new Date(log.checkedAt), "HH:mm:ss", { locale: id })}</p>
                                    </td>
                                    <td className="px-3 py-2.5">
                                      <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", typeInfo.cls)}>{typeInfo.label}</span>
                                    </td>
                                    <td className="px-3 py-2.5">
                                      <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border", cond.cls)}>
                                        {cond.icon}{cond.label}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2.5 max-w-[180px]">
                                      <p className="text-[10px] font-mono text-foreground truncate" title={log.latestFileName || ""}>{log.latestFileName || <span className="text-muted-foreground">—</span>}</p>
                                    </td>
                                    <td className="px-3 py-2.5">
                                      {log.latestFileDateExtracted
                                        ? <span className="text-[11px] font-semibold text-foreground font-mono">{log.latestFileDateExtracted}</span>
                                        : <span className="text-muted-foreground text-[10px]">—</span>}
                                    </td>
                                    <td className="px-3 py-2.5">
                                      {log.existingSnapshotDate
                                        ? <span className="text-[11px] font-mono text-muted-foreground">{log.existingSnapshotDate}</span>
                                        : <span className="text-muted-foreground text-[10px]">—</span>}
                                    </td>
                                    <td className="px-3 py-2.5 text-right">
                                      {log.rowsImported != null
                                        ? <span className="text-[11px] font-bold text-emerald-700 tabular-nums">{log.rowsImported.toLocaleString("id-ID")}</span>
                                        : <span className="text-muted-foreground text-[10px]">—</span>}
                                    </td>
                                    <td className="px-3 py-2.5">
                                      <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded",
                                        log.triggeredBy === "auto" ? "bg-blue-100 text-blue-700" : "bg-secondary text-muted-foreground")}>
                                        {log.triggeredBy === "auto" ? "Otomatis" : "Manual"}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          <div className="px-5 py-2 border-t border-border bg-secondary/20 flex items-center gap-4 text-[10px] text-muted-foreground">
                            <span>{logs.length} entri log terakhir</span>
                            <span className="ml-auto text-emerald-600 font-semibold">{logs.filter((l: any) => l.condition === "imported").length} import</span>
                            <span className="text-amber-600 font-semibold">{logs.filter((l: any) => l.condition === "date_same").length} skip</span>
                            <span className="text-red-600 font-semibold">{logs.filter((l: any) => ["api_error","import_error"].includes(l.condition)).length} error</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

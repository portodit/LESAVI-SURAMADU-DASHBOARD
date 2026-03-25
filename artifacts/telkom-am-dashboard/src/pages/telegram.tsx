import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  Send, History, CheckCircle2, XCircle, Users, RefreshCw,
  Link2, Unlink, BarChart2, GitBranch, Activity, MessageSquare,
  Copy, Clock, ChevronRight, Download
} from "lucide-react";
import { cn } from "@/lib/utils";

const API = import.meta.env.BASE_URL?.replace(/\/$/, "") + "/api";

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(API + path, {
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...opts?.headers },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw err;
  }
  return res.json();
}

type MsgTab = "semua" | "performa" | "funnel" | "activity";

const MSG_TABS: { id: MsgTab; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: "semua", label: "Semua Data", icon: <MessageSquare className="w-4 h-4" />, desc: "Kirim gabungan performa, funnel, dan activity" },
  { id: "performa", label: "Performa Revenue", icon: <BarChart2 className="w-4 h-4" />, desc: "Kirim laporan target vs real revenue AM" },
  { id: "funnel", label: "Sales Funnel", icon: <GitBranch className="w-4 h-4" />, desc: "Kirim ringkasan LOP aktif dan pipeline" },
  { id: "activity", label: "Sales Activity", icon: <Activity className="w-4 h-4" />, desc: "Kirim status KPI kunjungan AM" },
];

function KirimPesanSection() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [msgTab, setMsgTab] = useState<MsgTab>("semua");
  const [period, setPeriod] = useState(format(new Date(), "yyyy-MM"));
  const [customMsg, setCustomMsg] = useState("");
  const [targetNiks, setTargetNiks] = useState<string[] | null>(null);

  const { data: ams } = useQuery<any[]>({ queryKey: ["ams"], queryFn: () => apiFetch("/am") });

  const sendMut = useMutation({
    mutationFn: (body: object) => apiFetch("/telegram/send", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (res: any) => {
      toast({ title: "Broadcast Selesai", description: `Terkirim: ${res.sent} · Gagal: ${res.failed} · Lewati: ${res.skipped}` });
      qc.invalidateQueries({ queryKey: ["tg-logs"] });
    },
    onError: (e: any) => toast({ title: "Gagal Kirim", description: e.error || "Terjadi kesalahan", variant: "destructive" }),
  });

  const getIncludes = (tab: MsgTab) => ({
    includePerformance: tab === "semua" || tab === "performa",
    includeFunnel: tab === "semua" || tab === "funnel",
    includeActivity: tab === "semua" || tab === "activity",
  });

  const handleSend = () => {
    sendMut.mutate({
      period,
      ...getIncludes(msgTab),
      customMessage: customMsg || null,
      targetNiks,
    });
  };

  const connectedAms = ams?.filter((a: any) => a.telegramConnected) || [];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
      {/* Left: Config */}
      <div className="xl:col-span-2 space-y-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-display font-bold text-sm mb-4 text-foreground">Konfigurasi Pesan</h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Periode Data</label>
              <input
                type="month"
                value={period}
                onChange={e => setPeriod(e.target.value)}
                className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Target Penerima</label>
              <select
                value={targetNiks === null ? "" : "specific"}
                onChange={e => setTargetNiks(e.target.value === "" ? null : [])}
                className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              >
                <option value="">Semua AM Terhubung ({connectedAms.length} orang)</option>
                <option value="specific">Pilih AM tertentu</option>
              </select>
              {targetNiks !== null && (
                <div className="mt-2 space-y-1 max-h-36 overflow-y-auto border border-border rounded-lg p-2">
                  {connectedAms.map((am: any) => (
                    <label key={am.nik} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-secondary/50 px-2 py-1 rounded">
                      <input
                        type="checkbox"
                        checked={targetNiks.includes(am.nik)}
                        onChange={e => {
                          if (e.target.checked) setTargetNiks([...(targetNiks || []), am.nik]);
                          else setTargetNiks((targetNiks || []).filter(n => n !== am.nik));
                        }}
                        className="w-3.5 h-3.5"
                      />
                      <span className="font-medium">{am.nama}</span>
                      <span className="text-xs text-muted-foreground">({am.divisi})</span>
                    </label>
                  ))}
                  {connectedAms.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Belum ada AM terhubung</p>}
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Pesan Tambahan (Opsional)</label>
              <textarea
                rows={3}
                value={customMsg}
                onChange={e => setCustomMsg(e.target.value)}
                placeholder="Semangat pagi, mohon cek performa kamu..."
                className="w-full px-3 py-2.5 bg-secondary/50 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none"
              />
            </div>
          </div>
        </div>

        {/* AM connection status */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-amber-700 mb-1">Info Koneksi</p>
          <p className="text-sm font-bold text-amber-900">{connectedAms.length} dari {ams?.length || 0} AM terhubung</p>
          <p className="text-xs text-amber-600 mt-1">AM yang belum terhubung tidak akan menerima pesan. Hubungkan di tab "Koneksi AM".</p>
        </div>
      </div>

      {/* Right: Message type tabs + preview */}
      <div className="xl:col-span-3 space-y-4">
        {/* Message type selector */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-display font-bold text-sm mb-3 text-foreground">Tipe Pesan</h3>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {MSG_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setMsgTab(tab.id)}
                className={cn(
                  "flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all",
                  msgTab === tab.id
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border bg-secondary/30 text-muted-foreground hover:border-primary/40 hover:bg-secondary/50"
                )}
              >
                <span className={cn("mt-0.5 shrink-0", msgTab === tab.id ? "text-primary" : "text-muted-foreground")}>{tab.icon}</span>
                <div>
                  <p className="text-xs font-bold">{tab.label}</p>
                  <p className="text-[10px] mt-0.5 leading-tight">{tab.desc}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Preview what's included */}
          <div className="bg-secondary/40 rounded-lg p-3 mb-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Konten yang dikirim:</p>
            <div className="flex flex-wrap gap-1.5">
              {(msgTab === "semua" || msgTab === "performa") && (
                <span className="inline-flex items-center gap-1 text-[11px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                  <BarChart2 className="w-3 h-3" /> Performa Revenue
                </span>
              )}
              {(msgTab === "semua" || msgTab === "funnel") && (
                <span className="inline-flex items-center gap-1 text-[11px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                  <GitBranch className="w-3 h-3" /> Sales Funnel
                </span>
              )}
              {(msgTab === "semua" || msgTab === "activity") && (
                <span className="inline-flex items-center gap-1 text-[11px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                  <Activity className="w-3 h-3" /> Sales Activity
                </span>
              )}
            </div>
          </div>

          <button
            onClick={handleSend}
            disabled={sendMut.isPending || connectedAms.length === 0}
            className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-white rounded-lg font-bold shadow-lg shadow-primary/25 hover:shadow-primary/40 active:scale-[0.99] transition-all disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {sendMut.isPending ? "Mengirim..." : `Kirim ${targetNiks?.length ? `ke ${targetNiks.length} AM` : `ke Semua (${connectedAms.length})`}`}
          </button>

          {sendMut.isSuccess && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
              <p className="font-semibold mb-1">Broadcast selesai!</p>
              <p>Terkirim: {(sendMut.data as any).sent} · Gagal: {(sendMut.data as any).failed} · Dilewati: {(sendMut.data as any).skipped}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KoneksiAmSection() {
  const { toast } = useToast();
  const [linkTarget, setLinkTarget] = useState<string | null>(null);
  const [selectedAmId, setSelectedAmId] = useState<string>("");

  const { data: ams, refetch: refetchAms } = useQuery<any[]>({
    queryKey: ["ams"],
    queryFn: () => apiFetch("/am"),
    staleTime: 0,
  });
  const { data: updates, isLoading: pollLoading, refetch: refetchUpdates, error: pollError } = useQuery<any>({
    queryKey: ["tg-updates"],
    queryFn: () => apiFetch("/telegram/updates"),
    enabled: false,
    retry: false,
  });

  const syncAll = async () => {
    // Trigger an immediate on-demand poll of Telegram's getUpdates
    // so that any messages sent in the last few seconds are captured now
    try { await apiFetch("/telegram/sync-now", { method: "POST" }); } catch { /* non-fatal */ }
    await refetchUpdates();
    await refetchAms();
  };

  const genCodeMut = useMutation({
    mutationFn: (amId: number) => apiFetch("/telegram/register-code", { method: "POST", body: JSON.stringify({ amId }) }),
    onSuccess: () => { refetchAms(); },
  });

  const linkMut = useMutation({
    mutationFn: (body: { amId: number; chatId: string }) =>
      apiFetch("/telegram/link-am", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: async () => {
      toast({ title: "Berhasil Dihubungkan", description: "AM berhasil dikaitkan dengan akun Telegram" });
      setLinkTarget(null); setSelectedAmId("");
      await refetchAms();
      await refetchUpdates();
    },
    onError: (e: any) => toast({ title: "Gagal", description: e.error, variant: "destructive" }),
  });

  const unlinkMut = useMutation({
    mutationFn: (amId: number) => apiFetch(`/telegram/unlink-am/${amId}`, { method: "DELETE" }),
    onSuccess: async () => {
      toast({ title: "Koneksi dilepas" });
      await refetchAms();
      await refetchUpdates();
    },
  });

  const subscribers: any[] = updates?.subscribers || [];
  const unlinkedSubscribers = subscribers.filter(s => !s.linked);

  return (
    <div className="space-y-5">
      {/* Top: Sync button + subscriber list */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display font-bold text-sm text-foreground">Pengguna Bot Telegram</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Pengguna yang chat ke bot setelah sistem ini aktif (tersimpan di database)</p>
          </div>
          <button
            onClick={syncAll}
            disabled={pollLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", pollLoading && "animate-spin")} />
            {pollLoading ? "Memuat..." : "Refresh Daftar"}
          </button>
        </div>

        {/* Warning box about historical message limitation */}
        <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          <p className="font-semibold mb-0.5">⚠️ Mengapa daftar masih kosong?</p>
          <p className="text-amber-700 leading-relaxed">
            Telegram <strong>tidak menyimpan riwayat pesan lama</strong> — pesan /start yang dikirim sebelum sistem ini aktif sudah hilang dari antrian bot dan tidak dapat diambil kembali.
            Minta semua AM untuk kirim <code className="bg-amber-100 px-1 rounded">/start</code> atau <code className="bg-amber-100 px-1 rounded">/myid</code> ke bot lagi. Setelah itu, data mereka akan otomatis tersimpan di sini.
          </p>
        </div>

        {/* Info box: how to get Chat ID */}
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
          <p className="font-semibold mb-0.5">💡 Cara menghubungkan akun Telegram AM:</p>
          <ol className="list-decimal list-inside space-y-0.5 text-blue-700">
            <li>AM kirim <code className="bg-blue-100 px-1 rounded">/start</code> atau <code className="bg-blue-100 px-1 rounded">/myid</code> ke bot → bot balas dengan <strong>Chat ID</strong> mereka</li>
            <li>Admin generate kode verifikasi (klik "Generate Kode" di tabel bawah) → AM kirim kode ke bot → terhubung otomatis</li>
            <li><strong>Atau:</strong> klik "Manual" di tabel bawah → masukkan Chat ID secara langsung</li>
          </ol>
        </div>

        {pollError && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 mb-4 text-xs text-destructive">
            {(pollError as any).error || "Gagal memuat data pengguna bot."}
          </div>
        )}

        {updates && (
          <div className="mb-4 p-3 bg-secondary/40 rounded-lg text-xs text-muted-foreground">
            Ditemukan <span className="font-bold text-foreground">{subscribers.length}</span> pengguna bot
            {unlinkedSubscribers.length > 0 && (
              <span className="ml-2 text-amber-600 font-semibold">· {unlinkedSubscribers.length} belum dipetakan ke AM</span>
            )}
          </div>
        )}

        {!updates && !pollLoading && (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Klik "Refresh Daftar" untuk melihat siapa yang sudah chat ke bot</p>
          </div>
        )}

        {subscribers.length > 0 && (
          <div className="space-y-2">
            {subscribers.map(s => (
              <div key={s.chatId} className={cn(
                "flex items-center gap-3 p-3 rounded-lg border text-sm",
                s.linked ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"
              )}>
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                  {(s.firstName || "?")[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">
                    {s.firstName} {s.lastName}
                    {s.username && <span className="ml-1.5 text-xs text-muted-foreground font-normal">@{s.username}</span>}
                  </p>
                  <p className="text-[11px] text-muted-foreground font-mono">Chat ID: <span className="font-bold select-all">{s.chatId}</span></p>
                  {s.lastMessage && <p className="text-[11px] text-muted-foreground truncate">Pesan: "{s.lastMessage}"</p>}
                  {s.lastSeen
                    ? <p className="text-[10px] text-muted-foreground/60">Terakhir: {format(new Date(s.lastSeen), "dd MMM HH:mm", { locale: idLocale })}</p>
                    : <p className="text-[10px] text-blue-500/70">Terhubung via DB</p>
                  }
                </div>
                {s.linked ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p className="text-[11px] font-bold text-green-700">{s.linkedNama}</p>
                      <p className="text-[10px] text-green-600">NIK: {s.linkedNik}</p>
                    </div>
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  </div>
                ) : (
                  <div className="shrink-0">
                    {linkTarget === s.chatId ? (
                      <div className="flex items-center gap-1.5">
                        <select
                          value={selectedAmId}
                          onChange={e => setSelectedAmId(e.target.value)}
                          className="text-xs px-2 py-1 border border-border rounded bg-background"
                        >
                          <option value="">Pilih AM...</option>
                          {ams?.filter((a: any) => !a.telegramConnected).map((a: any) => (
                            <option key={a.id} value={a.id}>{a.nama}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => selectedAmId && linkMut.mutate({ amId: Number(selectedAmId), chatId: s.chatId })}
                          disabled={!selectedAmId || linkMut.isPending}
                          className="text-xs px-2 py-1 bg-primary text-white rounded font-semibold disabled:opacity-50"
                        >
                          Link
                        </button>
                        <button onClick={() => setLinkTarget(null)} className="text-xs text-muted-foreground">Batal</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setLinkTarget(s.chatId)}
                        className="flex items-center gap-1 text-xs text-amber-600 font-semibold hover:text-amber-700"
                      >
                        <Link2 className="w-3.5 h-3.5" /> Petakan ke AM
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom: AM list with connection status */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-display font-bold text-sm text-foreground">Status Koneksi per AM</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Kelola koneksi Telegram masing-masing AM</p>
          </div>
          <BulkDownloadButton onRefresh={refetchAms} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-muted-foreground font-medium">
              <tr>
                <th className="px-5 py-3 text-left text-xs">Nama AM</th>
                <th className="px-5 py-3 text-left text-xs">NIK</th>
                <th className="px-5 py-3 text-left text-xs">Divisi</th>
                <th className="px-5 py-3 text-left text-xs">Status</th>
                <th className="px-5 py-3 text-left text-xs">Kode Verifikasi</th>
                <th className="px-5 py-3 text-left text-xs">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ams?.map((am: any) => (
                <AmRow key={am.id} am={am} genCodeMut={genCodeMut} unlinkMut={unlinkMut} linkMut={linkMut} />
              ))}
              {!ams?.length && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-muted-foreground text-xs">Belum ada data AM</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BulkDownloadButton({ onRefresh }: { onRefresh: () => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/telegram/bulk-generate-codes", { method: "POST" });
      if (!data.results?.length) {
        toast({ title: "Semua AM sudah terhubung", description: "Tidak ada AM yang perlu dibuatkan kode verifikasi." });
        return;
      }

      const header = "Nama AM,NIK,Divisi,Kode Verifikasi,Berlaku Sampai";
      const rows = data.results.map((r: any) => {
        const expiry = new Date(r.expiresAt).toLocaleString("id-ID", { hour12: false });
        return `"${r.nama}","${r.nik}","${r.divisi}","${r.code}","${expiry}"`;
      });
      const csv = [header, ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kode-verifikasi-telegram-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast({ title: `${data.total} kode berhasil dibuat`, description: "File CSV telah diunduh. Bagikan kode kepada masing-masing AM." });
      onRefresh();
    } catch {
      toast({ title: "Gagal generate kode", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-border text-foreground rounded-lg hover:bg-secondary/50 disabled:opacity-50 transition-colors"
    >
      <Download className={cn("w-3.5 h-3.5", loading && "animate-pulse")} />
      {loading ? "Membuat kode..." : "Generate & Download CSV"}
    </button>
  );
}

function AmRow({ am, genCodeMut, unlinkMut, linkMut }: any) {
  const [copied, setCopied] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualChatId, setManualChatId] = useState("");

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isExpired = am.telegramCodeExpiry && new Date(am.telegramCodeExpiry) < new Date();

  return (
    <tr className="hover:bg-secondary/20">
      <td className="px-5 py-3 font-semibold text-foreground">{am.nama}</td>
      <td className="px-5 py-3 text-muted-foreground font-mono text-xs">{am.nik}</td>
      <td className="px-5 py-3 text-muted-foreground text-xs">{am.divisi}</td>
      <td className="px-5 py-3">
        {am.telegramConnected ? (
          <span className="inline-flex items-center gap-1 text-[11px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">
            <CheckCircle2 className="w-3 h-3" /> Terhubung
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] bg-secondary text-muted-foreground px-2 py-0.5 rounded-full font-medium">
            <XCircle className="w-3 h-3" /> Belum
          </span>
        )}
      </td>
      <td className="px-5 py-3">
        {am.telegramConnected ? (
          <span className="text-xs text-muted-foreground">Chat ID: {am.telegramChatId}</span>
        ) : am.telegramCode && !isExpired ? (
          <div className="flex items-center gap-1.5">
            <code className="text-xs font-bold bg-secondary px-2 py-0.5 rounded tracking-widest">{am.telegramCode}</code>
            <button onClick={() => copy(am.telegramCode)} className="text-muted-foreground hover:text-foreground">
              {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />
              {format(new Date(am.telegramCodeExpiry), "HH:mm", { locale: idLocale })}
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-5 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          {am.telegramConnected ? (
            <button
              onClick={() => unlinkMut.mutate(am.id)}
              className="flex items-center gap-1 text-xs text-destructive/70 hover:text-destructive font-medium"
            >
              <Unlink className="w-3 h-3" /> Putuskan
            </button>
          ) : (
            <>
              <button
                onClick={() => genCodeMut.mutate(am.id)}
                disabled={genCodeMut.isPending}
                className="flex items-center gap-1 text-xs text-primary font-semibold hover:text-primary/80 disabled:opacity-50"
              >
                <ChevronRight className="w-3 h-3" /> Generate Kode
              </button>
              {showManual ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    placeholder="Chat ID"
                    value={manualChatId}
                    onChange={e => setManualChatId(e.target.value)}
                    className="text-xs px-2 py-1 border border-border rounded w-24"
                  />
                  <button
                    onClick={() => { linkMut.mutate({ amId: am.id, chatId: manualChatId }); setShowManual(false); }}
                    className="text-xs px-1.5 py-1 bg-primary text-white rounded"
                  >OK</button>
                  <button onClick={() => setShowManual(false)} className="text-xs text-muted-foreground">Batal</button>
                </div>
              ) : (
                <button onClick={() => setShowManual(true)} className="text-xs text-muted-foreground hover:text-foreground">
                  <Link2 className="w-3 h-3 inline mr-0.5" /> Manual
                </button>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function RiwayatSection() {
  const { data: logs } = useQuery<any[]>({
    queryKey: ["tg-logs"],
    queryFn: () => apiFetch("/telegram/logs"),
  });

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="p-5 border-b border-border">
        <h3 className="font-display font-bold text-sm text-foreground flex items-center gap-2">
          <History className="w-4 h-4 text-muted-foreground" /> Riwayat Pengiriman Bot
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-secondary/50 text-muted-foreground font-medium">
            <tr>
              <th className="px-5 py-3 text-left text-xs">Waktu</th>
              <th className="px-5 py-3 text-left text-xs">Nama AM</th>
              <th className="px-5 py-3 text-left text-xs">Periode</th>
              <th className="px-5 py-3 text-left text-xs">Status</th>
              <th className="px-5 py-3 text-left text-xs">Keterangan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {logs?.map((log: any) => (
              <tr key={log.id} className="hover:bg-secondary/20">
                <td className="px-5 py-3 text-muted-foreground text-xs">{format(new Date(log.createdAt), "dd/MM/yy HH:mm")}</td>
                <td className="px-5 py-3 font-semibold">{log.namaAm}</td>
                <td className="px-5 py-3 text-xs text-muted-foreground">{log.period}</td>
                <td className="px-5 py-3">
                  {log.status === "success" || log.status === "sent" ? (
                    <span className="inline-flex items-center gap-1 text-[11px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">
                      <CheckCircle2 className="w-3 h-3" /> Terkirim
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] bg-destructive/10 text-destructive px-2 py-0.5 rounded-full font-bold">
                      <XCircle className="w-3 h-3" /> Gagal
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 text-xs text-muted-foreground max-w-[220px] truncate">{log.error || "OK"}</td>
              </tr>
            ))}
            {logs?.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-12 text-center text-muted-foreground text-sm">Belum ada riwayat pengiriman</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type MainTab = "kirim" | "koneksi" | "riwayat";

const MAIN_TABS: { id: MainTab; label: string; icon: React.ReactNode }[] = [
  { id: "kirim", label: "Kirim Pesan", icon: <Send className="w-4 h-4" /> },
  { id: "koneksi", label: "Koneksi AM", icon: <Users className="w-4 h-4" /> },
  { id: "riwayat", label: "Riwayat Log", icon: <History className="w-4 h-4" /> },
];

export default function TelegramBot() {
  const [mainTab, setMainTab] = useState<MainTab>("kirim");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
          <Send className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-display font-bold text-foreground">Bot Telegram RLEGS</h1>
          <p className="text-sm text-muted-foreground">Kirim reminder performa otomatis ke AM via Telegram</p>
        </div>
      </div>

      {/* Main tabs */}
      <div className="flex gap-1 bg-secondary/50 p-1 rounded-xl w-fit">
        {MAIN_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setMainTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
              mainTab === tab.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {mainTab === "kirim" && <KirimPesanSection />}
      {mainTab === "koneksi" && <KoneksiAmSection />}
      {mainTab === "riwayat" && <RiwayatSection />}
    </div>
  );
}

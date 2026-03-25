import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useListImportHistory } from "@workspace/api-client-react";
import { cn, formatRupiah } from "@/lib/utils";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { ArrowLeft, Loader2, Database, Search, ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightIcon } from "lucide-react";

async function apiFetch(path: string, opts?: RequestInit) {
  const base = (import.meta.env.BASE_URL || "").replace(/\/$/, "");
  const res = await fetch(`${base}${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw d; }
  return res.json();
}

const PAGE_SIZE = 50;

function formatSnapshotTitle(createdAt: string, type: string): string {
  const date = format(new Date(createdAt), "d MMMM yyyy", { locale: id });
  const upper = date.toUpperCase();
  if (type === "performance") return `SNAPSHOT PERFORMANSI AM WITEL SURAMADU (${upper})`;
  if (type === "funnel") return `SNAPSHOT SALES FUNNEL WITEL SURAMADU (${upper})`;
  return `SNAPSHOT SALES ACTIVITY WITEL SURAMADU (${upper})`;
}

function formatPeriod(period: string) {
  const MONTHS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
  const [y, m] = period.split("-");
  return `${MONTHS[parseInt(m, 10) - 1] || m} ${y}`;
}

// ─── Performance Table ─────────────────────────────────────────────────────────
function PerformanceTable({ rows, search }: { rows: any[]; search: string }) {
  const [page, setPage] = useState(1);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const filtered = rows.filter(r =>
    !search || r.namaAm?.toLowerCase().includes(search.toLowerCase()) ||
    r.nik?.includes(search) || r.divisi?.toLowerCase().includes(search.toLowerCase()) ||
    r.witelAm?.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleRow(idx: number) {
    setExpandedRows(prev => { const n = new Set(prev); if (n.has(idx)) n.delete(idx); else n.add(idx); return n; });
  }

  return (
    <div>
      <div className="text-xs text-muted-foreground mb-2">{filtered.length} baris AM ditemukan · Klik baris untuk lihat detail pelanggan</div>
      <div className="overflow-x-auto border border-border rounded-xl">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-secondary/50 text-muted-foreground font-semibold text-[10px] uppercase tracking-wide">
              <th className="px-2 py-2.5 w-5"></th>
              <th className="px-3 py-2.5">NIK</th>
              <th className="px-4 py-2.5">Nama AM</th>
              <th className="px-3 py-2.5">Level AM</th>
              <th className="px-3 py-2.5">Witel AM</th>
              <th className="px-3 py-2.5">Divisi</th>
              <th className="px-3 py-2.5 text-center">Periode</th>
              <th className="px-4 py-2.5 text-right">Target Revenue</th>
              <th className="px-4 py-2.5 text-right">Real Revenue</th>
              <th className="px-3 py-2.5 text-right">Target Sustain</th>
              <th className="px-3 py-2.5 text-right">Real Sustain</th>
              <th className="px-3 py-2.5 text-right">Target Scaling</th>
              <th className="px-3 py-2.5 text-right">Real Scaling</th>
              <th className="px-3 py-2.5 text-right">Target NGTMA</th>
              <th className="px-3 py-2.5 text-right">Real NGTMA</th>
              <th className="px-3 py-2.5 text-right">Ach %</th>
              <th className="px-3 py-2.5 text-center">Status</th>
              <th className="px-4 py-2.5 text-center">CC</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {paged.map((r, i) => {
              const absIdx = (page - 1) * PAGE_SIZE + i;
              const customers: any[] = (() => {
                try { return r.komponenDetail ? JSON.parse(r.komponenDetail) : []; } catch { return []; }
              })();
              const isExpanded = expandedRows.has(absIdx);
              return (
                <React.Fragment key={i}>
                  <tr
                    className={cn("transition-colors", customers.length > 0 ? "cursor-pointer hover:bg-secondary/20" : "hover:bg-secondary/10", isExpanded && "bg-secondary/10")}
                    onClick={() => customers.length > 0 && toggleRow(absIdx)}
                  >
                    <td className="px-2 py-2 text-muted-foreground">
                      {customers.length > 0 ? (isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRightIcon className="w-3.5 h-3.5" />) : null}
                    </td>
                    <td className="px-3 py-2 font-mono text-muted-foreground text-[10px]">{r.nik}</td>
                    <td className="px-4 py-2 font-medium text-foreground whitespace-nowrap">{r.namaAm}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.levelAm || "–"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.witelAm || "–"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.divisi}</td>
                    <td className="px-3 py-2 text-center font-mono text-[10px]">{r.tahun}/{String(r.bulan).padStart(2,"0")}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{formatRupiah(r.targetRevenue)}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">{formatRupiah(r.realRevenue)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatRupiah(r.targetSustain ?? 0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatRupiah(r.realSustain ?? 0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatRupiah(r.targetScaling ?? 0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatRupiah(r.realScaling ?? 0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatRupiah(r.targetNgtma ?? 0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatRupiah(r.realNgtma ?? 0)}</td>
                    <td className={cn("px-3 py-2 text-right font-bold tabular-nums", r.achRate >= 1 ? "text-green-600" : r.achRate >= 0.8 ? "text-orange-500" : "text-red-600")}>
                      {(r.achRate * 100).toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold border",
                        r.statusWarna === "hijau" ? "text-green-700 bg-green-50 border-green-200" :
                        r.statusWarna === "oranye" ? "text-orange-700 bg-orange-50 border-orange-200" :
                        "text-red-700 bg-red-50 border-red-200"
                      )}>
                        {r.statusWarna?.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center text-muted-foreground font-mono">{customers.length > 0 ? customers.length : "–"}</td>
                  </tr>

                  {/* Customer detail rows */}
                  {isExpanded && customers.length > 0 && (
                    <tr>
                      <td colSpan={18} className="px-0 py-0 bg-secondary/5">
                        <div className="mx-3 my-1.5 border border-border/60 rounded-lg overflow-x-auto">
                          <table className="w-full text-[10px] text-left">
                            <thead>
                              <tr className="bg-secondary/60 text-muted-foreground font-semibold uppercase tracking-wide">
                                <th className="px-3 py-1.5">NIP NAS</th>
                                <th className="px-3 py-1.5">Standard Name</th>
                                <th className="px-3 py-1.5">Group</th>
                                <th className="px-3 py-1.5">Industri</th>
                                <th className="px-3 py-1.5">L.Segmen</th>
                                <th className="px-3 py-1.5">S.Segmen</th>
                                <th className="px-3 py-1.5">Witel CC</th>
                                <th className="px-3 py-1.5">Telda</th>
                                <th className="px-3 py-1.5">Regional</th>
                                <th className="px-3 py-1.5">Divisi CC</th>
                                <th className="px-3 py-1.5">Kawasan</th>
                                <th className="px-3 py-1.5 text-right">Proporsi</th>
                                <th className="px-3 py-1.5 text-right">T.Revenue</th>
                                <th className="px-3 py-1.5 text-right">R.Revenue</th>
                                <th className="px-3 py-1.5 text-right">T.Sustain</th>
                                <th className="px-3 py-1.5 text-right">R.Sustain</th>
                                <th className="px-3 py-1.5 text-right">T.Scaling</th>
                                <th className="px-3 py-1.5 text-right">R.Scaling</th>
                                <th className="px-3 py-1.5 text-right">T.NGTMA</th>
                                <th className="px-3 py-1.5 text-right">R.NGTMA</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/40">
                              {customers.map((c: any, ci: number) => (
                                <tr key={ci} className="hover:bg-secondary/30">
                                  <td className="px-3 py-1.5 font-mono text-muted-foreground">{c.nip || "–"}</td>
                                  <td className="px-3 py-1.5 font-medium max-w-[160px] truncate" title={c.pelanggan}>{c.pelanggan || "–"}</td>
                                  <td className="px-3 py-1.5 text-muted-foreground">{c.group || "–"}</td>
                                  <td className="px-3 py-1.5 text-muted-foreground">{c.industri || "–"}</td>
                                  <td className="px-3 py-1.5 text-muted-foreground">{c.lsegmen || "–"}</td>
                                  <td className="px-3 py-1.5 text-muted-foreground">{c.ssegmen || "–"}</td>
                                  <td className="px-3 py-1.5 text-muted-foreground">{c.witelCc || "–"}</td>
                                  <td className="px-3 py-1.5 text-muted-foreground">{c.telda || "–"}</td>
                                  <td className="px-3 py-1.5 text-muted-foreground">{c.regional || "–"}</td>
                                  <td className="px-3 py-1.5 text-muted-foreground">{c.divisiCc || "–"}</td>
                                  <td className="px-3 py-1.5 text-muted-foreground">{c.kawasan || "–"}</td>
                                  <td className="px-3 py-1.5 text-right tabular-nums">{c.proporsi?.toFixed(2) ?? "–"}</td>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{formatRupiah(c.targetTotal ?? 0)}</td>
                                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatRupiah(c.realTotal ?? 0)}</td>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{formatRupiah(c.Sustain?.target ?? 0)}</td>
                                  <td className="px-3 py-1.5 text-right tabular-nums">{formatRupiah(c.Sustain?.real ?? 0)}</td>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{formatRupiah(c.Scaling?.target ?? 0)}</td>
                                  <td className="px-3 py-1.5 text-right tabular-nums">{formatRupiah(c.Scaling?.real ?? 0)}</td>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{formatRupiah(c.NGTMA?.target ?? 0)}</td>
                                  <td className="px-3 py-1.5 text-right tabular-nums">{formatRupiah(c.NGTMA?.real ?? 0)}</td>
                                </tr>
                              ))}
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
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
          <span>Halaman {page} dari {totalPages}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 border rounded disabled:opacity-40 hover:bg-secondary transition-colors"><ChevronLeft className="w-3.5 h-3.5" /></button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2 py-1 border rounded disabled:opacity-40 hover:bg-secondary transition-colors"><ChevronRight className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Funnel Table ──────────────────────────────────────────────────────────────
function FunnelTable({ rows, search }: { rows: any[]; search: string }) {
  const [page, setPage] = useState(1);
  const filtered = rows.filter(r =>
    !search || r.pelanggan?.toLowerCase().includes(search.toLowerCase()) ||
    r.namaAm?.toLowerCase().includes(search.toLowerCase()) ||
    r.lopid?.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="text-xs text-muted-foreground mb-2">{filtered.length} LOP ditemukan</div>
      <div className="overflow-x-auto border border-border rounded-xl">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-secondary/50 text-muted-foreground font-semibold text-[10px] uppercase tracking-wide">
              <th className="px-4 py-2.5">LOP ID</th>
              <th className="px-4 py-2.5">Pelanggan</th>
              <th className="px-4 py-2.5">Judul Proyek</th>
              <th className="px-3 py-2.5">Divisi</th>
              <th className="px-3 py-2.5">Status F</th>
              <th className="px-4 py-2.5 text-right">Nilai Proyek</th>
              <th className="px-4 py-2.5">Nama AM</th>
              <th className="px-3 py-2.5">Report Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {paged.map((r, i) => (
              <tr key={i} className="hover:bg-secondary/10">
                <td className="px-4 py-2 font-mono text-[10px] text-muted-foreground">{r.lopid}</td>
                <td className="px-4 py-2 font-medium truncate max-w-[140px]" title={r.pelanggan}>{r.pelanggan}</td>
                <td className="px-4 py-2 truncate max-w-[180px] text-muted-foreground" title={r.judulProyek}>{r.judulProyek}</td>
                <td className="px-3 py-2">{r.divisi}</td>
                <td className="px-3 py-2"><span className="bg-secondary px-1.5 py-0.5 rounded text-[10px]">{r.statusF}</span></td>
                <td className="px-4 py-2 text-right tabular-nums">{formatRupiah(r.nilaiProyek)}</td>
                <td className="px-4 py-2">{r.namaAm}</td>
                <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{r.reportDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
          <span>Halaman {page} dari {totalPages}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 border rounded disabled:opacity-40 hover:bg-secondary transition-colors"><ChevronLeft className="w-3.5 h-3.5" /></button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2 py-1 border rounded disabled:opacity-40 hover:bg-secondary transition-colors"><ChevronRight className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Activity Table ────────────────────────────────────────────────────────────
function ActivityTable({ rows, search }: { rows: any[]; search: string }) {
  const [page, setPage] = useState(1);
  const filtered = rows.filter(r =>
    !search || r.fullname?.toLowerCase().includes(search.toLowerCase()) ||
    r.caName?.toLowerCase().includes(search.toLowerCase()) ||
    r.activityType?.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="text-xs text-muted-foreground mb-2">{filtered.length} aktivitas ditemukan</div>
      <div className="overflow-x-auto border border-border rounded-xl">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-secondary/50 text-muted-foreground font-semibold text-[10px] uppercase tracking-wide">
              <th className="px-4 py-2.5">NIK</th>
              <th className="px-4 py-2.5">Nama AM</th>
              <th className="px-3 py-2.5">Divisi</th>
              <th className="px-4 py-2.5">CA Name</th>
              <th className="px-3 py-2.5">Tipe Aktivitas</th>
              <th className="px-3 py-2.5">Label</th>
              <th className="px-4 py-2.5">Tanggal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {paged.map((r, i) => (
              <tr key={i} className="hover:bg-secondary/10">
                <td className="px-4 py-2 font-mono text-muted-foreground">{r.nik}</td>
                <td className="px-4 py-2 font-medium">{r.fullname}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.divisi}</td>
                <td className="px-4 py-2 truncate max-w-[140px]" title={r.caName}>{r.caName || "–"}</td>
                <td className="px-3 py-2"><span className="bg-secondary px-1.5 py-0.5 rounded text-[10px]">{r.activityType}</span></td>
                <td className="px-3 py-2 text-muted-foreground">{r.label || "–"}</td>
                <td className="px-4 py-2 font-mono text-[10px] text-muted-foreground">{r.activityEndDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
          <span>Halaman {page} dari {totalPages}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 border rounded disabled:opacity-40 hover:bg-secondary transition-colors"><ChevronLeft className="w-3.5 h-3.5" /></button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2 py-1 border rounded disabled:opacity-40 hover:bg-secondary transition-colors"><ChevronRight className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Detail Page ──────────────────────────────────────────────────────────
export default function ImportDetail({ params }: { params: { id: string } }) {
  const [, navigate] = useLocation();
  const importId = parseInt(params.id, 10);
  const { data: history } = useListImportHistory();

  const [dataRows, setDataRows] = useState<any[] | null>(null);
  const [dataType, setDataType] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const imp = (history as any[] | undefined)?.find((h: any) => h.id === importId);

  useEffect(() => {
    if (!importId) return;
    setLoading(true);
    setError(null);
    apiFetch(`/api/import/${importId}/data`)
      .then((d: any) => {
        setDataRows(d.rows || []);
        setDataType(d.type || "");
      })
      .catch((e: any) => setError(e?.message || "Gagal memuat data"))
      .finally(() => setLoading(false));
  }, [importId]);

  return (
    <div className="space-y-5">
      {/* Back button */}
      <button
        onClick={() => navigate("/import")}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Kembali ke Import Data
      </button>

      {/* Snapshot header card */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Database className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Versi Snapshot</p>
            {imp ? (
              <>
                <h1 className="text-base font-display font-bold text-foreground leading-snug">
                  {formatSnapshotTitle(imp.createdAt, imp.type)}
                </h1>
                <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
                  <span>Import ID: <strong className="text-foreground">#{imp.id}</strong></span>
                  <span>Tipe: <strong className="text-foreground">{imp.type === "performance" ? "Performa AM" : imp.type === "funnel" ? "Sales Funnel" : "Sales Activity"}</strong></span>
                  <span>Periode: <strong className="text-foreground">{formatPeriod(imp.period)}</strong></span>
                  <span>Total baris: <strong className="text-foreground">{imp.rowsImported?.toLocaleString("id-ID")} baris</strong></span>
                  <span>Diimport: <strong className="text-foreground">{format(new Date(imp.createdAt), "dd MMMM yyyy, HH:mm:ss", { locale: id })} WIB</strong></span>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Memuat metadata snapshot...</p>
            )}
          </div>
        </div>
      </div>

      {/* Data table card */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4 gap-3">
          <h2 className="text-sm font-display font-bold text-foreground">
            Data Hasil Import
            {dataRows !== null && <span className="ml-2 text-xs font-normal text-muted-foreground">({dataRows.length} baris tersimpan)</span>}
          </h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari data..."
              className="pl-8 pr-3 h-8 text-xs border border-border rounded-lg bg-secondary/40 focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all w-48"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Memuat data...</span>
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-600 text-sm">{error}</div>
        ) : !dataRows?.length ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Tidak ada data untuk import ini</div>
        ) : dataType === "performance" ? (
          <PerformanceTable rows={dataRows} search={search} />
        ) : dataType === "funnel" ? (
          <FunnelTable rows={dataRows} search={search} />
        ) : (
          <ActivityTable rows={dataRows} search={search} />
        )}
      </div>
    </div>
  );
}

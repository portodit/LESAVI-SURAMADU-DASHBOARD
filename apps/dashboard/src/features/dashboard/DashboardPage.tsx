import React from "react";
import { useListAccountManagers, useListPerformance } from "@workspace/api-client-react";
import { formatRupiah, formatPercent, getStatusColor, cn } from "@/shared/lib/utils";
import { Users, TrendingUp, AlertCircle, CheckCircle2 } from "lucide-react";

export default function Dashboard() {
  const { data: ams, isLoading: amLoading } = useListAccountManagers();
  const { data: perfs, isLoading: perfLoading } = useListPerformance();

  if (amLoading || perfLoading) return <div className="p-8">Loading dashboard...</div>;

  const totalAm = ams?.length || 0;
  const connectedAm = ams?.filter(a => a.telegramConnected).length || 0;
  
  const hijau = perfs?.filter(p => p.statusWarna.toLowerCase() === 'hijau').length || 0;
  const merah = perfs?.filter(p => p.statusWarna.toLowerCase() === 'merah').length || 0;

  // Merge Data for Table
  const tableData = ams?.map(am => {
    const perf = perfs?.find(p => p.nik === am.nik);
    return { ...am, perf };
  }) || [];

  return (
    <div className="space-y-8">
      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-card rounded-2xl p-6 border border-border shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total AM</p>
              <h3 className="text-2xl font-display font-bold text-foreground">{totalAm}</h3>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-2xl p-6 border border-border shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-success/10 text-success flex items-center justify-center">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">AM Performance Hijau</p>
              <h3 className="text-2xl font-display font-bold text-foreground">{hijau}</h3>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-2xl p-6 border border-border shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">AM Performance Merah</p>
              <h3 className="text-2xl font-display font-bold text-foreground">{merah}</h3>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-2xl p-6 border border-border shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Bot Telegram Terhubung</p>
              <h3 className="text-2xl font-display font-bold text-foreground">{connectedAm} <span className="text-sm font-normal text-muted-foreground">/ {totalAm}</span></h3>
            </div>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-bold font-display">Overview Account Manager</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-secondary/50 text-muted-foreground font-medium">
              <tr>
                <th className="px-6 py-4">Nama AM</th>
                <th className="px-6 py-4">Divisi</th>
                <th className="px-6 py-4">Target (Bulan ini)</th>
                <th className="px-6 py-4">Realisasi</th>
                <th className="px-6 py-4">Ach %</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Telegram</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tableData.map((row, idx) => (
                <tr key={idx} className="hover:bg-secondary/20 transition-colors">
                  <td className="px-6 py-4 font-semibold text-foreground">{row.nama}</td>
                  <td className="px-6 py-4 text-muted-foreground">{row.divisi}</td>
                  <td className="px-6 py-4">{row.perf ? formatRupiah(row.perf.targetRevenue) : '-'}</td>
                  <td className="px-6 py-4">{row.perf ? formatRupiah(row.perf.realRevenue) : '-'}</td>
                  <td className="px-6 py-4 font-medium">{row.perf ? formatPercent(row.perf.achRate) : '-'}</td>
                  <td className="px-6 py-4">
                    {row.perf ? (
                      <span className={cn("px-2.5 py-1 rounded-full text-xs font-semibold border", getStatusColor(row.perf.statusWarna))}>
                        {row.perf.statusWarna.toUpperCase()}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-6 py-4">
                    {row.telegramConnected ? (
                      <span className="flex items-center gap-1.5 text-success text-xs font-medium">
                        <CheckCircle2 className="w-4 h-4" /> Terhubung
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium">
                        <AlertCircle className="w-4 h-4" /> Belum
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {tableData.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">Belum ada data</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Quick component inline for missing import
function MessageSquare({className}: {className?: string}) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
}

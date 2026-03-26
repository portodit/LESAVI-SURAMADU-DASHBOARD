import React from "react";
import { useListActivity } from "@workspace/api-client-react";
import { cn } from "@/shared/lib/utils";
import { Activity as ActivityIcon, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";

export default function ActivityVis() {
  const { data, isLoading } = useListActivity();

  if (isLoading) return <div>Loading...</div>;
  if (!data) return <div>No data</div>;

  return (
    <div className="space-y-6">
      <div className="bg-card p-6 rounded-2xl border border-border flex items-center justify-between shadow-sm">
        <div>
          <h2 className="text-2xl font-display font-bold">Sales Activity Overview</h2>
          <p className="text-muted-foreground mt-1">Monitoring KPI Kunjungan AM ke Pelanggan</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-muted-foreground">Total Activity Terpusat</p>
          <p className="text-3xl font-display font-extrabold text-primary">{data.totalActivity}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {data.byAm.map(am => (
          <div key={am.nik} className={cn(
            "p-5 rounded-2xl border transition-all",
            am.kpiAchieved ? "bg-success/5 border-success/20" : "bg-card border-border hover:border-primary/30"
          )}>
            <div className="flex justify-between items-start mb-4">
              <div className="truncate">
                <h4 className="font-bold text-foreground truncate">{am.fullname}</h4>
                <p className="text-xs text-muted-foreground">{am.divisi}</p>
              </div>
              {am.kpiAchieved ? (
                <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 text-destructive shrink-0" />
              )}
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Pencapaian:</span>
                <span className="font-bold">{am.activityCount} / {am.kpiTarget}</span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                <div 
                  className={cn("h-full rounded-full transition-all", am.kpiAchieved ? "bg-success" : "bg-primary")}
                  style={{ width: `${Math.min((am.activityCount / am.kpiTarget) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden mt-8">
        <div className="p-6 border-b border-border flex items-center gap-3">
          <ActivityIcon className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold font-display">Log Aktivitas Terbaru</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-secondary/50 text-muted-foreground font-medium">
              <tr>
                <th className="px-6 py-4">Tanggal</th>
                <th className="px-6 py-4">Nama AM</th>
                <th className="px-6 py-4">Pelanggan / PIC</th>
                <th className="px-6 py-4">Tipe & Label</th>
                <th className="px-6 py-4">Catatan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.activities.slice(0, 20).map((act, i) => (
                <tr key={i} className="hover:bg-secondary/20">
                  <td className="px-6 py-4 font-medium">{act.activityEndDate ? (() => { try { return format(new Date(act.activityEndDate), 'dd MMM yyyy'); } catch { return act.activityEndDate; } })() : '–'}</td>
                  <td className="px-6 py-4">{act.fullname}</td>
                  <td className="px-6 py-4">
                    <p className="font-semibold text-foreground">{act.caName || '-'}</p>
                    <p className="text-xs text-muted-foreground">{act.picName}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-secondary rounded-md text-xs font-semibold mr-2">{act.activityType}</span>
                    <span className="text-xs text-muted-foreground border border-border px-2 py-1 rounded-md">{act.label}</span>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground truncate max-w-xs">{act.activityNotes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

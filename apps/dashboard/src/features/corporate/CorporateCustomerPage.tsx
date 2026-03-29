import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Search, TrendingUp, Users, ChevronUp, ChevronDown } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Badge } from "@/shared/ui/badge";

type Customer = {
  nama: string;
  nipnas: string | null;
  segmen: string | null;
  ssegmen: string | null;
  totalRevenue: number;
  totalTarget: number;
};

type SortField = "nama" | "totalRevenue" | "segmen";
type SortDir = "asc" | "desc";

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") + "/api";

function fmt(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} M`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)} Jt`;
  return n.toLocaleString("id-ID");
}

function segmenColor(segmen: string | null) {
  if (!segmen) return "secondary";
  const s = segmen.toUpperCase();
  if (s.includes("ENT") || s === "ENTERPRISE") return "default";
  if (s.includes("GOVER") || s.includes("GOV"))  return "outline";
  if (s.includes("MID"))   return "secondary";
  if (s.includes("SME") || s.includes("SMALL")) return "secondary";
  return "secondary";
}

export default function CorporateCustomerPage() {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("totalRevenue");
  const [sortDir,   setSortDir]   = useState<SortDir>("desc");

  const { data, isLoading, isError } = useQuery<{ customers: Customer[]; total: number }>({
    queryKey: ["corporate-customers"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/corporate-customers`, { credentials: "include" });
      if (!res.ok) throw new Error("Gagal memuat data");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  const customers = data?.customers ?? [];

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q
      ? customers.filter(c =>
          c.nama.toLowerCase().includes(q) ||
          (c.nipnas || "").toLowerCase().includes(q) ||
          (c.segmen || "").toLowerCase().includes(q)
        )
      : customers;

    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === "totalRevenue") cmp = a.totalRevenue - b.totalRevenue;
      else if (sortField === "nama")    cmp = a.nama.localeCompare(b.nama);
      else if (sortField === "segmen")  cmp = (a.segmen || "").localeCompare(b.segmen || "");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [customers, search, sortField, sortDir]);

  const totalRevAll  = customers.reduce((s, c) => s + c.totalRevenue, 0);
  const withRevenue  = customers.filter(c => c.totalRevenue > 0).length;

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronUp className="w-3 h-3 opacity-30" />;
    return sortDir === "asc"
      ? <ChevronUp   className="w-3 h-3 text-white" />
      : <ChevronDown className="w-3 h-3 text-white" />;
  }

  return (
    <div className="p-4 md:p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-red-700 flex items-center justify-center shrink-0">
          <Building2 className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold leading-tight">Corporate Customer</h1>
          <p className="text-xs text-muted-foreground">Daftar pelanggan korporat LESA VI Witel Suramadu</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Pelanggan</span>
          </div>
          <p className="text-2xl font-black text-foreground">{isLoading ? "–" : customers.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Ada Revenue</span>
          </div>
          <p className="text-2xl font-black text-foreground">{isLoading ? "–" : withRevenue}</p>
        </div>
        <div className="col-span-2 md:col-span-1 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-green-600" />
            <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Real Revenue</span>
          </div>
          <p className="text-2xl font-black text-green-600">{isLoading ? "–" : fmt(totalRevAll)}</p>
        </div>
      </div>

      {/* Table Section */}
      <div className="rounded-xl bg-card border border-border">
        {/* Toolbar */}
        <div className="p-3 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Cari nama, NIK NAS, atau segmen…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <p className="text-xs text-muted-foreground self-center sm:ml-auto">
            {isLoading ? "Memuat…" : `${filtered.length} dari ${customers.length} pelanggan`}
          </p>
        </div>

        {/* Table */}
        <div className="border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-red-700 text-white">
                  <th className="px-3 py-2.5 text-left font-black uppercase tracking-wide text-xs w-8">#</th>
                  <th
                    className="px-3 py-2.5 text-left font-black uppercase tracking-wide text-xs cursor-pointer hover:bg-red-600 select-none"
                    onClick={() => toggleSort("nama")}
                  >
                    <div className="flex items-center gap-1">Nama Pelanggan <SortIcon field="nama" /></div>
                  </th>
                  <th className="px-3 py-2.5 text-left font-black uppercase tracking-wide text-xs">NIK NAS</th>
                  <th
                    className="px-3 py-2.5 text-left font-black uppercase tracking-wide text-xs cursor-pointer hover:bg-red-600 select-none"
                    onClick={() => toggleSort("segmen")}
                  >
                    <div className="flex items-center gap-1">Segmen <SortIcon field="segmen" /></div>
                  </th>
                  <th
                    className="px-3 py-2.5 text-right font-black uppercase tracking-wide text-xs cursor-pointer hover:bg-red-600 select-none"
                    onClick={() => toggleSort("totalRevenue")}
                  >
                    <div className="flex items-center justify-end gap-1">Total Revenue <SortIcon field="totalRevenue" /></div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading && Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-3 py-2.5"><div className="h-4 w-6 bg-muted rounded animate-pulse" /></td>
                    <td className="px-3 py-2.5"><div className="h-4 w-48 bg-muted rounded animate-pulse" /></td>
                    <td className="px-3 py-2.5"><div className="h-4 w-24 bg-muted rounded animate-pulse" /></td>
                    <td className="px-3 py-2.5"><div className="h-4 w-20 bg-muted rounded animate-pulse" /></td>
                    <td className="px-3 py-2.5"><div className="h-4 w-24 bg-muted rounded animate-pulse ml-auto" /></td>
                  </tr>
                ))}

                {isError && (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-destructive text-sm">
                      Gagal memuat data corporate customer.
                    </td>
                  </tr>
                )}

                {!isLoading && !isError && filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground text-sm">
                      {search ? "Tidak ada pelanggan yang cocok dengan pencarian." : "Belum ada data corporate customer."}
                    </td>
                  </tr>
                )}

                {!isLoading && !isError && filtered.map((c, idx) => (
                  <tr
                    key={c.nama}
                    className="border-t border-border hover:bg-muted/40 transition-colors"
                  >
                    <td className="px-3 py-2.5 text-muted-foreground text-xs tabular-nums">{idx + 1}</td>
                    <td className="px-3 py-2.5 font-medium max-w-xs">
                      <span className="line-clamp-2 leading-snug">{c.nama}</span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground tabular-nums text-xs">
                      {c.nipnas || <span className="italic opacity-50">–</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {c.segmen
                        ? <Badge variant={segmenColor(c.segmen)} className="text-xs font-semibold">{c.segmen}</Badge>
                        : <span className="text-muted-foreground text-xs italic">–</span>
                      }
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                      {c.totalRevenue > 0
                        ? <span className="text-green-600">{fmt(c.totalRevenue)}</span>
                        : <span className="text-muted-foreground text-xs italic">–</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer note */}
        {!isLoading && !isError && customers.length > 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground border-t border-border">
            Revenue diambil dari data performa AM (bukan Sales Funnel). Angka dalam format: M = Miliar, Jt = Juta.
          </p>
        )}
      </div>
    </div>
  );
}

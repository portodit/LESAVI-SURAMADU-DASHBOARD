import { Router, type IRouter } from "express";
import { db, salesFunnelTable, salesFunnelTargetTable, dataImportsTable, accountManagersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router: IRouter = Router();

const PUBLIC_HEADERS = {
  "Cache-Control": "no-store",
  "X-Frame-Options": "ALLOWALL",
  "Access-Control-Allow-Origin": "*",
};

router.get("/public/funnel/snapshots", async (req, res): Promise<void> => {
  Object.entries(PUBLIC_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  const imports = await db
    .select()
    .from(dataImportsTable)
    .where(eq(dataImportsTable.type, "funnel"))
    .orderBy(desc(dataImportsTable.createdAt));

  res.json(imports.map(imp => ({
    id: imp.id,
    period: imp.period,
    rowsImported: imp.rowsImported,
    createdAt: imp.createdAt?.toISOString(),
    snapshotDate: imp.snapshotDate ?? null,
  })));
});

router.get("/public/funnel", async (req, res): Promise<void> => {
  Object.entries(PUBLIC_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  const { import_id, divisi, status, nama_am, kategori_kontrak, tahun } = req.query;

  const masterAms = await db.select().from(accountManagersTable);
  const masterAmByNik = new Map(masterAms.map(m => [m.nik, m.nama]));
  const activeNikSet = new Set(masterAms.filter(m => m.aktif).map(m => m.nik));

  let allLops = await db.select().from(salesFunnelTable);

  allLops = allLops.map(l => {
    const isUnresolved = !l.namaAm || l.namaAm === "" || /^\d+$/.test(l.namaAm.trim());
    if (isUnresolved && l.nikAm && masterAmByNik.has(l.nikAm)) {
      return { ...l, namaAm: masterAmByNik.get(l.nikAm) || l.namaAm };
    }
    return l;
  });

  if (import_id) allLops = allLops.filter(l => l.importId === Number(import_id));
  if (tahun) {
    const yr = Number(tahun);
    allLops = allLops.filter(l => l.reportDate && new Date(l.reportDate as string).getFullYear() === yr);
  }
  if (divisi) allLops = allLops.filter(l => l.divisi === String(divisi));
  if (status) allLops = allLops.filter(l => l.statusF === String(status));
  if (nama_am) allLops = allLops.filter(l => l.namaAm?.toLowerCase().includes(String(nama_am).toLowerCase()));
  if (kategori_kontrak) allLops = allLops.filter(l => l.kategoriKontrak === String(kategori_kontrak));

  const totalLop = allLops.length;
  const totalNilai = allLops.reduce((s, l) => s + (l.nilaiProyek || 0), 0);
  const namedLops = allLops.filter(l => l.namaAm && l.namaAm !== "");
  const amSet = new Set(namedLops.map(l => l.nikAm).filter(Boolean));
  const pelangganSet = new Set(allLops.map(l => l.pelanggan).filter(Boolean));
  const unidentifiedCount = allLops.length - namedLops.length;

  const statusGroups = Object.entries(
    allLops.reduce((acc: any, l) => {
      const s = l.statusF || "Unknown";
      if (!acc[s]) acc[s] = { status: s, count: 0, totalNilai: 0 };
      acc[s].count++;
      acc[s].totalNilai += l.nilaiProyek || 0;
      return acc;
    }, {})
  ).map(([, v]) => v);

  const masterLops = namedLops.filter(l => l.nikAm && activeNikSet.has(l.nikAm));
  const amGroups = Object.entries(
    masterLops.reduce((acc: any, l) => {
      const key = l.nikAm || l.namaAm || "Unknown";
      if (!acc[key]) acc[key] = {
        namaAm: l.namaAm || "", nik: l.nikAm || "", divisi: l.divisi || "",
        totalLop: 0, totalNilai: 0, shortage: 0, statusMap: {}
      };
      acc[key].totalLop++;
      acc[key].totalNilai += l.nilaiProyek || 0;
      const s = l.statusF || "Unknown";
      if (!acc[key].statusMap[s]) acc[key].statusMap[s] = { status: s, count: 0, totalNilai: 0 };
      acc[key].statusMap[s].count++;
      acc[key].statusMap[s].totalNilai += l.nilaiProyek || 0;
      return acc;
    }, {})
  ).map(([, v]: any) => ({
    namaAm: v.namaAm, nik: v.nik, divisi: v.divisi,
    totalLop: v.totalLop, totalNilai: v.totalNilai, shortage: 0,
    byStatus: Object.values(v.statusMap),
  }));

  let targetHoVal = 0, targetFullHoVal = 0;
  const allTargets = await db.select().from(salesFunnelTargetTable)
    .orderBy(desc(salesFunnelTargetTable.tahun), desc(salesFunnelTargetTable.bulan));

  if (allTargets.length > 0) {
    const selectedYear = tahun ? Number(tahun) : null;
    const importPeriod = import_id
      ? (await db.select().from(dataImportsTable).where(eq(dataImportsTable.id, Number(import_id))))[0]?.period
      : null;
    const importYear = importPeriod ? Number(importPeriod.slice(0, 4)) : null;
    const importMonth = importPeriod ? Number(importPeriod.slice(5, 7)) : null;
    const lookupYear = selectedYear || importYear;
    const lookupMonth = importMonth;
    const divisiFilter = divisi ? String(divisi) : null;

    let matched = allTargets;
    if (lookupYear) matched = matched.filter(t => t.tahun === lookupYear);
    if (lookupMonth) matched = matched.filter(t => t.bulan === lookupMonth);

    if (divisiFilter && divisiFilter !== "all") {
      const divMatch = matched.filter(t => t.divisi === divisiFilter);
      if (divMatch.length > 0) {
        targetHoVal = divMatch.reduce((s, t) => s + (t.targetHo || 0), 0);
        targetFullHoVal = divMatch.reduce((s, t) => s + (t.targetFullHo || 0), 0);
      }
    } else {
      const withDivisi = matched.filter(t => t.divisi);
      if (withDivisi.length > 0) {
        targetHoVal = withDivisi.reduce((s, t) => s + (t.targetHo || 0), 0);
        targetFullHoVal = withDivisi.reduce((s, t) => s + (t.targetFullHo || 0), 0);
      } else if (matched.length > 0) {
        targetHoVal = matched[0].targetHo || 0;
        targetFullHoVal = matched[0].targetFullHo || 0;
      }
    }
  }

  const shortage = targetFullHoVal > 0 ? targetFullHoVal - totalNilai : 0;

  res.json({
    totalLop, totalNilai,
    targetHo: targetHoVal,
    targetFullHo: targetFullHoVal,
    realFullHo: totalNilai,
    shortage,
    amCount: amSet.size,
    pelangganCount: pelangganSet.size,
    unidentifiedLops: unidentifiedCount,
    byStatus: statusGroups,
    byAm: amGroups,
    lops: allLops.map(l => ({
      id: l.id,
      lopid: l.lopid,
      judulProyek: l.judulProyek,
      pelanggan: l.pelanggan,
      nilaiProyek: l.nilaiProyek,
      divisi: l.divisi,
      segmen: l.segmen,
      statusF: l.statusF,
      proses: l.proses,
      statusProyek: l.statusProyek,
      kategoriKontrak: l.kategoriKontrak,
      estimateBulan: l.estimateBulan,
      namaAm: l.namaAm,
      nikAm: l.nikAm,
      reportDate: l.reportDate,
    })),
  });
});

export default router;

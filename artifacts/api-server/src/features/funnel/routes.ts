import { Router, type IRouter } from "express";
import { db, salesFunnelTable, salesFunnelTargetTable, dataImportsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../../shared/auth";

const router: IRouter = Router();

router.get("/funnel/snapshots", requireAuth, async (req, res): Promise<void> => {
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
  })));
});

router.get("/funnel", requireAuth, async (req, res): Promise<void> => {
  const { import_id, divisi, status, nama_am, kategori_kontrak } = req.query;

  let allLops = await db.select().from(salesFunnelTable);

  if (import_id) {
    allLops = allLops.filter(l => l.importId === Number(import_id));
  }
  if (divisi) allLops = allLops.filter(l => l.divisi === String(divisi));
  if (status) allLops = allLops.filter(l => l.statusF === String(status));
  if (nama_am) allLops = allLops.filter(l => l.namaAm?.toLowerCase().includes(String(nama_am).toLowerCase()));
  if (kategori_kontrak) allLops = allLops.filter(l => l.kategoriKontrak === String(kategori_kontrak));

  const totalLop = allLops.length;
  const totalNilai = allLops.reduce((s, l) => s + (l.nilaiProyek || 0), 0);
  const amSet = new Set(allLops.map(l => l.nikAm).filter(Boolean));
  const pelangganSet = new Set(allLops.map(l => l.pelanggan).filter(Boolean));

  const statusGroups = Object.entries(
    allLops.reduce((acc: any, l) => {
      const s = l.statusF || "Unknown";
      if (!acc[s]) acc[s] = { status: s, count: 0, totalNilai: 0 };
      acc[s].count++;
      acc[s].totalNilai += l.nilaiProyek || 0;
      return acc;
    }, {})
  ).map(([, v]) => v);

  const amGroups = Object.entries(
    allLops.reduce((acc: any, l) => {
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

  const targets = await db.select().from(salesFunnelTargetTable).catch(() => []);
  const latestTarget = targets[targets.length - 1] as any;
  const targetFullHo = (latestTarget?.targetFullHo as number) || 0;
  const shortage = targetFullHo > 0 ? targetFullHo - totalNilai : 0;

  res.json({
    totalLop, totalNilai, targetFullHo,
    realFullHo: totalNilai,
    shortage,
    amCount: amSet.size,
    pelangganCount: pelangganSet.size,
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

router.get("/funnel/:nik", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.nik) ? req.params.nik[0] : req.params.nik;
  const lops = await db.select().from(salesFunnelTable).where(eq(salesFunnelTable.nikAm, raw));

  const totalLop = lops.length;
  const totalNilai = lops.reduce((s, l) => s + (l.nilaiProyek || 0), 0);
  const namaAm = lops[0]?.namaAm || "";
  const divisi = lops[0]?.divisi || "";

  res.json({
    nik: raw, namaAm, divisi, totalLop, totalNilai, shortage: 0,
    lops: lops.map(l => ({
      lopid: l.lopid, judulProyek: l.judulProyek, pelanggan: l.pelanggan,
      nilaiProyek: l.nilaiProyek, divisi: l.divisi, statusF: l.statusF,
      statusProyek: l.statusProyek, kategoriKontrak: l.kategoriKontrak,
      estimateBulan: l.estimateBulan, namaAm: l.namaAm, reportDate: l.reportDate || "",
    })),
  });
});

export default router;

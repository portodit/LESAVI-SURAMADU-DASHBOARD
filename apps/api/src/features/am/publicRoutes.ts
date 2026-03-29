import { Router, type IRouter } from "express";
import { db, accountManagersTable, performanceDataTable, salesFunnelTable, salesActivityTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/public/am/:slug", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;
  const { nik } = req.query;

  const [am] = await db.select().from(accountManagersTable).where(eq(accountManagersTable.slug, raw));
  if (!am) { res.status(404).json({ error: "AM tidak ditemukan" }); return; }

  if (!nik || String(nik) !== am.nik) {
    res.status(401).json({ error: "NIK tidak sesuai" });
    return;
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const perfs = await db.select().from(performanceDataTable)
    .where(eq(performanceDataTable.nik, am.nik));
  const latestPerf = perfs.find(p => p.tahun === year && p.bulan === month) || perfs[perfs.length - 1];

  const lops = await db.select().from(salesFunnelTable)
    .where(eq(salesFunnelTable.nikAm, am.nik));

  const acts = await db.select().from(salesActivityTable)
    .where(eq(salesActivityTable.nik, am.nik));
  const monthActs = acts.filter(a => a.activityEndDate?.startsWith(`${year}-${String(month).padStart(2, "0")}`));

  res.json({
    nik: am.nik, nama: am.nama, slug: am.slug,
    divisi: am.divisi, witel: am.witel,
    performance: latestPerf ? {
      nik: am.nik, namaAm: am.nama, divisi: am.divisi,
      tahun: latestPerf.tahun, bulan: latestPerf.bulan,
      targetRevenue: latestPerf.targetRevenue, realRevenue: latestPerf.realRevenue,
      achRate: latestPerf.achRate, achRateYtd: latestPerf.achRateYtd,
      rankAch: latestPerf.rankAch, statusWarna: latestPerf.statusWarna,
    } : null,
    funnel: {
      nik: am.nik, namaAm: am.nama, divisi: am.divisi,
      totalLop: lops.length, totalNilai: lops.reduce((s, l) => s + (l.nilaiProyek || 0), 0), shortage: 0,
      lops: lops.map(l => ({ lopid: l.lopid, judulProyek: l.judulProyek, pelanggan: l.pelanggan, nilaiProyek: l.nilaiProyek, divisi: l.divisi, statusF: l.statusF, statusProyek: l.statusProyek, kategoriKontrak: l.kategoriKontrak, estimateBulan: l.estimateBulan, namaAm: l.namaAm || "", reportDate: l.reportDate || "" })),
    },
    activity: {
      nik: am.nik, fullname: am.nama, divisi: am.divisi,
      activityCount: monthActs.length, kpiTarget: am.kpiActivity,
      activities: monthActs.map(a => ({ ...a, createdAt: a.createdAt.toISOString() })),
    },
  });
});

export default router;

import { Router, type IRouter } from "express";
import { db, salesActivityTable, accountManagersTable, dataImportsTable } from "@workspace/db";
import { requireAuth } from "../../shared/auth";
import { matchesDivisi } from "../../shared/divisi";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

function isKpiLabel(label: string | null | undefined): boolean {
  if (!label) return false;
  return !label.toLowerCase().includes("tanpa");
}

// ── GET /api/activity/snapshots ────────────────────────────────────────────────
router.get("/activity/snapshots", requireAuth, async (req, res): Promise<void> => {
  const snaps = await db
    .select()
    .from(dataImportsTable)
    .where(eq(dataImportsTable.type, "activity"))
    .orderBy(desc(dataImportsTable.id));

  res.json(snaps.map(s => ({
    id: s.id,
    period: s.period,
    rowsImported: s.rowsImported,
    snapshotDate: s.snapshotDate,
    createdAt: s.createdAt?.toISOString?.() ?? null,
    sourceUrl: s.sourceUrl,
  })));
});

// ── GET /api/activity ──────────────────────────────────────────────────────────
router.get("/activity", requireAuth, async (req, res): Promise<void> => {
  const { year, month, divisi, import_id } = req.query;

  const [allActs, ams] = await Promise.all([
    db.select().from(salesActivityTable),
    db.select().from(accountManagersTable),
  ]);

  // Hanya AM terdaftar (role=AM, aktif=true) — bukan officer/manager
  const registeredAms = ams.filter(a => a.aktif && a.role === "AM");
  const registeredNikSet = new Set(registeredAms.map(a => a.nik));

  let acts = allActs;

  // Filter by import_id (snapshot)
  if (import_id && String(import_id) !== "" && String(import_id) !== "all") {
    const impId = parseInt(String(import_id), 10);
    if (!isNaN(impId)) acts = acts.filter(a => a.importId === impId);
  }

  if (divisi && String(divisi) !== "all") {
    acts = acts.filter(a => matchesDivisi(a.divisi, String(divisi)));
  }
  if (year && month && String(month) !== "all") {
    const prefix = `${year}-${String(month).padStart(2, "0")}`;
    acts = acts.filter(a => a.activityEndDate?.startsWith(prefix));
  } else if (year) {
    acts = acts.filter(a => a.activityEndDate?.startsWith(String(year)));
  }

  const masterAms = registeredAms.map(a => ({ nik: a.nik, nama: a.nama, divisi: a.divisi ?? "" }));

  const byAmMap: Record<string, {
    nik: string; fullname: string | null; divisi: string;
    kpiCount: number; totalCount: number; kpiTarget: number;
    activities: any[];
  }> = {};

  // Inisialisasi hanya dari AM terdaftar
  for (const am of registeredAms) {
    if (!am.nik) continue;
    byAmMap[am.nik] = {
      nik: am.nik,
      fullname: am.nama,
      divisi: am.divisi ?? "",
      kpiCount: 0,
      totalCount: 0,
      kpiTarget: am.kpiActivity ?? 20,
      activities: [],
    };
  }

  const distinctLabels = new Set<string>();

  for (const act of acts) {
    const nik = act.nik;
    // Skip AM yang tidak terdaftar di manajemen akun
    if (!nik || !registeredNikSet.has(nik)) continue;
    if (!byAmMap[nik]) continue;
    byAmMap[nik].totalCount++;
    if (isKpiLabel(act.label)) byAmMap[nik].kpiCount++;
    if (act.label) distinctLabels.add(act.label);
    byAmMap[nik].activities.push({
      id: act.id,
      activityEndDate: act.activityEndDate,
      activityType: act.activityType,
      label: act.label,
      caName: act.caName,
      picName: act.picName,
      activityNotes: act.activityNotes,
      isKpi: isKpiLabel(act.label),
    });
  }

  for (const entry of Object.values(byAmMap)) {
    entry.activities.sort((a, b) => {
      const da = a.activityEndDate ?? "";
      const db2 = b.activityEndDate ?? "";
      return db2 < da ? -1 : db2 > da ? 1 : 0;
    });
  }

  const byAm = Object.values(byAmMap).filter(a =>
    matchesDivisi(a.divisi, divisi ? String(divisi) : "all")
  );

  const totalKpiActivities = byAm.reduce((s, a) => s + a.kpiCount, 0);

  res.json({
    totalKpiActivities,
    masterAms,
    byAm,
    distinctLabels: [...distinctLabels].sort(),
  });
});

router.get("/activity/:nik", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.nik) ? req.params.nik[0] : req.params.nik;
  const { year, month } = req.query;

  let acts = await db.select().from(salesActivityTable);
  acts = acts.filter(a => a.nik === raw);
  if (year && month) {
    const prefix = `${year}-${String(month).padStart(2, "0")}`;
    acts = acts.filter(a => a.activityEndDate?.startsWith(prefix));
  }

  const allAms = await db.select().from(accountManagersTable);
  const am = allAms.find(a => a.nik === raw);
  const kpiTarget = am?.kpiActivity ?? 20;
  const fullname = acts[0]?.fullname || am?.nama || "";
  const divisi = acts[0]?.divisi || am?.divisi || "";

  res.json({
    nik: raw, fullname, divisi,
    kpiCount: acts.filter(a => isKpiLabel(a.label)).length,
    activityCount: acts.length,
    kpiTarget,
    activities: acts.map(a => ({ ...a, createdAt: a.createdAt.toISOString(), isKpi: isKpiLabel(a.label) })),
  });
});

export default router;

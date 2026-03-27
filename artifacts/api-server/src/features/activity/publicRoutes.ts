import { Router, type IRouter } from "express";
import { db, salesActivityTable, accountManagersTable, dataImportsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

function isKpiLabel(label: string | null | undefined): boolean {
  if (!label) return false;
  return !label.toLowerCase().includes("tanpa");
}

// ── GET /api/public/activity/snapshots ─────────────────────────────────────────
router.get("/public/activity/snapshots", async (_req, res): Promise<void> => {
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

// ── GET /api/public/activity ───────────────────────────────────────────────────
router.get("/public/activity", async (req, res): Promise<void> => {
  const { year, month, divisi, import_id } = req.query;

  const [allActs, ams] = await Promise.all([
    db.select().from(salesActivityTable),
    db.select().from(accountManagersTable),
  ]);

  const amMap = Object.fromEntries(ams.map(a => [a.nik, a]));

  let acts = allActs;

  if (import_id && String(import_id) !== "" && String(import_id) !== "all") {
    const impId = parseInt(String(import_id), 10);
    if (!isNaN(impId)) acts = acts.filter(a => a.importId === impId);
  }

  if (divisi && String(divisi) !== "all") {
    acts = acts.filter(a => a.divisi === String(divisi));
  }
  const months = req.query.months ? String(req.query.months).split(",").filter(Boolean) : null;
  if (year && months && months.length > 0) {
    const prefixes = months.map(m => `${year}-${m.padStart(2, "0")}`);
    acts = acts.filter(a => prefixes.some(p => a.activityEndDate?.startsWith(p)));
  } else if (year && month && String(month) !== "all") {
    const prefix = `${year}-${String(month).padStart(2, "0")}`;
    acts = acts.filter(a => a.activityEndDate?.startsWith(prefix));
  } else if (year) {
    acts = acts.filter(a => a.activityEndDate?.startsWith(String(year)));
  }

  const masterAms = ams.map(a => ({ nik: a.nik, nama: a.nama, divisi: a.divisi ?? "" }));

  const byAmMap: Record<string, {
    nik: string; fullname: string | null; divisi: string;
    kpiCount: number; totalCount: number; kpiTarget: number;
    activities: any[];
  }> = {};

  for (const am of ams) {
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
    if (!byAmMap[nik]) {
      const amData = amMap[nik];
      byAmMap[nik] = {
        nik,
        fullname: act.fullname,
        divisi: act.divisi ?? "",
        kpiCount: 0,
        totalCount: 0,
        kpiTarget: amData?.kpiActivity ?? 20,
        activities: [],
      };
    }
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

  const byAm = Object.values(byAmMap).filter(a => {
    if (divisi && String(divisi) !== "all") return a.divisi === String(divisi);
    return true;
  });

  const totalKpiActivities = byAm.reduce((s, a) => s + a.kpiCount, 0);

  res.json({
    totalKpiActivities,
    masterAms,
    byAm,
    distinctLabels: [...distinctLabels].sort(),
  });
});

export default router;

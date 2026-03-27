import { Router, type IRouter } from "express";
import { db, salesActivityTable, accountManagersTable } from "@workspace/db";
import { requireAuth } from "../../shared/auth";

const router: IRouter = Router();

function isKpiLabel(label: string | null | undefined): boolean {
  if (!label) return false;
  return !label.toLowerCase().includes("tanpa");
}

router.get("/activity", requireAuth, async (req, res): Promise<void> => {
  const { year, month, divisi } = req.query;

  const [allActs, ams] = await Promise.all([
    db.select().from(salesActivityTable),
    db.select().from(accountManagersTable),
  ]);

  const amMap = Object.fromEntries(ams.map(a => [a.nik, a]));

  let acts = allActs;
  if (divisi && String(divisi) !== "all") {
    acts = acts.filter(a => a.divisi === String(divisi));
  }
  if (year && month && String(month) !== "all") {
    const prefix = `${year}-${String(month).padStart(2, "0")}`;
    acts = acts.filter(a => a.activityEndDate?.startsWith(prefix));
  } else if (year) {
    acts = acts.filter(a => a.activityEndDate?.startsWith(String(year)));
  }

  const masterAms = ams.map(a => ({ nik: a.nik, nama: a.nama, divisi: a.divisi ?? "" }));

  const byAmMap: Record<string, {
    nik: string; fullname: string; divisi: string;
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

router.get("/activity/:nik", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.nik) ? req.params.nik[0] : req.params.nik;
  const { year, month } = req.query;

  let acts = await db.select().from(salesActivityTable);
  acts = acts.filter(a => a.nik === raw);
  if (year && month) {
    const prefix = `${year}-${String(month).padStart(2, "0")}`;
    acts = acts.filter(a => a.activityEndDate?.startsWith(prefix));
  }

  const [am] = await db.select().from(accountManagersTable);
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

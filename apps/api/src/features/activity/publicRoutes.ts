import { Router, type IRouter } from "express";
import { db, salesActivityTable, accountManagersTable, dataImportsTable, appSettingsTable } from "@workspace/db";
import { matchesDivisi } from "../../shared/divisi";
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

  const [allActs, ams, settingsArr, activityImports] = await Promise.all([
    db.select().from(salesActivityTable),
    db.select().from(accountManagersTable),
    db.select({ kpiActivityDefault: appSettingsTable.kpiActivityDefault }).from(appSettingsTable).limit(1),
    db.select({ id: dataImportsTable.id, snapshotDate: dataImportsTable.snapshotDate })
      .from(dataImportsTable)
      .where(eq(dataImportsTable.type, "activity")),
  ]);
  const kpiDefault = settingsArr[0]?.kpiActivityDefault ?? 30;

  // Hanya AM terdaftar (role=AM, aktif=true) — bukan officer/manager
  const registeredAms = ams.filter(a => a.aktif && a.role === "AM");
  const registeredNikSet = new Set(registeredAms.map(a => a.nik));

  let acts = allActs;

  // Cumulative snapshot filter: tampilkan semua aktivitas s/d tanggal snapshot yang dipilih
  if (import_id && String(import_id) !== "" && String(import_id) !== "all") {
    const impId = parseInt(String(import_id), 10);
    if (!isNaN(impId)) {
      const selectedImport = activityImports.find(i => i.id === impId);
      if (selectedImport?.snapshotDate) {
        acts = acts.filter(a => a.snapshotDate != null && a.snapshotDate <= selectedImport.snapshotDate!);
      } else {
        acts = acts.filter(a => a.importId === impId);
      }
    }
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
      kpiTarget: am.kpiActivity ?? kpiDefault,
      perAmKpiTarget: am.kpiActivity ?? null,
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
    kpiDefault,
    masterAms,
    byAm,
    distinctLabels: [...distinctLabels].sort(),
  });
});

export default router;

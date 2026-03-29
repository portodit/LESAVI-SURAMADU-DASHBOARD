import { db, performanceDataTable, dataImportsTable } from "@workspace/db";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface PerformanceRow {
  nik: string;
  nama_am: string;
  divisi: string;
  witel_am: string | null;
  level_am: string | null;
  tahun: string;
  bulan: string;
  target_revenue: string;
  real_revenue: string;
  target_reguler: string | null;
  real_reguler: string | null;
  target_sustain: string | null;
  real_sustain: string | null;
  target_scaling: string | null;
  real_scaling: string | null;
  target_ngtma: string | null;
  real_ngtma: string | null;
  ach_rate: string;
  ach_rate_ytd: string;
  rank_ach: string;
  status_warna: string;
  komponen_detail: string | null;
  snapshot_date: string | null;
}

function toFloat(v: string | null): number {
  if (!v || v === "") return 0;
  return parseFloat(v) || 0;
}

function toInt(v: string | null): number {
  if (!v || v === "") return 0;
  return parseInt(v) || 0;
}

const BATCH_SIZE = 50;

export async function seedPerformance(opts: { truncate?: boolean } = {}) {
  const dataPath = resolve(__dirname, "data/performance.json");
  const raw: PerformanceRow[] = JSON.parse(readFileSync(dataPath, "utf8"));

  if (opts.truncate) {
    console.log("  [performance] Truncating performance_data...");
    await db.delete(performanceDataTable);
  }

  // Derive snapshot date from data
  const snapshotDates = raw.map(r => r.snapshot_date).filter(Boolean) as string[];
  const latestSnapshot = snapshotDates.length > 0
    ? snapshotDates.sort().reverse()[0]
    : new Date().toISOString().slice(0, 10);
  const period = latestSnapshot.slice(0, 4);

  // Create a data_imports record so snapshot dropdown works
  const [importRecord] = await db
    .insert(dataImportsTable)
    .values({
      type: "performance",
      rowsImported: raw.length,
      period,
      snapshotDate: latestSnapshot,
      sourceUrl: `seed (snapshot ${latestSnapshot})`,
      autoTelegramSent: false,
    })
    .returning({ id: dataImportsTable.id });

  const importId = importRecord.id;
  console.log(`  [performance] Seeding ${raw.length} performance record(s) in batches of ${BATCH_SIZE}...`);

  const rows = raw.map((r) => ({
    nik: r.nik,
    namaAm: r.nama_am,
    divisi: r.divisi,
    witelAm: r.witel_am || null,
    levelAm: r.level_am || null,
    tahun: toInt(r.tahun),
    bulan: toInt(r.bulan),
    targetRevenue: toFloat(r.target_revenue),
    realRevenue: toFloat(r.real_revenue),
    targetReguler: toFloat(r.target_reguler),
    realReguler: toFloat(r.real_reguler),
    targetSustain: toFloat(r.target_sustain),
    realSustain: toFloat(r.real_sustain),
    targetScaling: toFloat(r.target_scaling),
    realScaling: toFloat(r.real_scaling),
    targetNgtma: toFloat(r.target_ngtma),
    realNgtma: toFloat(r.real_ngtma),
    achRate: toFloat(r.ach_rate),
    achRateYtd: toFloat(r.ach_rate_ytd),
    rankAch: toInt(r.rank_ach),
    statusWarna: r.status_warna,
    komponenDetail: r.komponen_detail || null,
    snapshotDate: r.snapshot_date || null,
    importId,
  }));

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await db.insert(performanceDataTable).values(batch);
    process.stdout.write(`\r    [performance] Inserted ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`);
  }
  console.log("\n  [performance] Done.");
}

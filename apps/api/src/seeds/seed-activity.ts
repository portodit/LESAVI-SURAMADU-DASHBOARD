import { db, salesActivityTable, dataImportsTable } from "@workspace/db";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ActivityRow {
  nik: string;
  fullname: string | null;
  divisi: string | null;
  segmen: string | null;
  regional: string | null;
  witel: string | null;
  nipnas: string | null;
  ca_name: string | null;
  activity_type: string | null;
  label: string | null;
  lopid: string | null;
  createdat_activity: string | null;
  activity_start_date: string | null;
  activity_end_date: string | null;
  pic_name: string | null;
  pic_jobtitle: string | null;
  pic_role: string | null;
  pic_phone: string | null;
  activity_notes: string | null;
  snapshot_date: string | null;
}

const BATCH_SIZE = 100;

export async function seedActivity(opts: { truncate?: boolean } = {}) {
  const dataPath = resolve(__dirname, "data/activity.json");
  const raw: ActivityRow[] = JSON.parse(readFileSync(dataPath, "utf8"));

  if (opts.truncate) {
    console.log("  [activity] Truncating sales_activity...");
    await db.delete(salesActivityTable);
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
      type: "activity",
      rowsImported: raw.length,
      period,
      snapshotDate: latestSnapshot,
      sourceUrl: `seed (snapshot ${latestSnapshot})`,
      autoTelegramSent: false,
    })
    .returning({ id: dataImportsTable.id });

  const importId = importRecord.id;
  console.log(`  [activity] Seeding ${raw.length} activity record(s) in batches of ${BATCH_SIZE}...`);

  const rows = raw.map((r) => ({
    nik: r.nik,
    fullname: r.fullname || null,
    divisi: r.divisi || null,
    segmen: r.segmen || null,
    regional: r.regional || null,
    witel: r.witel || null,
    nipnas: r.nipnas || null,
    caName: r.ca_name || null,
    activityType: r.activity_type || null,
    label: r.label || null,
    lopid: r.lopid || null,
    createdatActivity: r.createdat_activity || null,
    activityStartDate: r.activity_start_date || null,
    activityEndDate: r.activity_end_date || null,
    picName: r.pic_name || null,
    picJobtitle: r.pic_jobtitle || null,
    picRole: r.pic_role || null,
    picPhone: r.pic_phone || null,
    activityNotes: r.activity_notes || null,
    snapshotDate: r.snapshot_date || null,
    importId,
  }));

  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    try {
      await db.insert(salesActivityTable).values(batch).onConflictDoNothing();
      inserted += batch.length;
    } catch {
      for (const row of batch) {
        try {
          await db.insert(salesActivityTable).values(row).onConflictDoNothing();
          inserted++;
        } catch {
          skipped++;
        }
      }
    }
    process.stdout.write(`\r    [activity] Processed ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`);
  }
  console.log(`\n  [activity] Done. Inserted: ${inserted}, Skipped (duplicate): ${skipped}`);
}

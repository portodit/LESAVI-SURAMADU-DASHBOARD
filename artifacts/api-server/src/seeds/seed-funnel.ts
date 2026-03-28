import { db, salesFunnelTable } from "@workspace/db";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface FunnelRow {
  lopid: string;
  judul_proyek: string;
  pelanggan: string;
  nilai_proyek: string | null;
  divisi: string;
  segmen: string | null;
  witel: string | null;
  status_f: string | null;
  proses: string | null;
  status_proyek: string | null;
  kategori_kontrak: string | null;
  estimate_bulan: string | null;
  nama_am: string | null;
  nik_am: string | null;
  report_date: string | null;
  created_date: string | null;
  snapshot_date: string | null;
}

const BATCH_SIZE = 200;

export async function seedFunnel(opts: { truncate?: boolean } = {}) {
  const dataPath = resolve(__dirname, "data/funnel.json");
  const raw: FunnelRow[] = JSON.parse(readFileSync(dataPath, "utf8"));

  if (opts.truncate) {
    console.log("  [funnel] Truncating sales_funnel...");
    await db.delete(salesFunnelTable);
  }

  console.log(`  [funnel] Seeding ${raw.length} funnel record(s) in batches of ${BATCH_SIZE}...`);

  const rows = raw.map((r) => ({
    lopid: r.lopid,
    judulProyek: r.judul_proyek,
    pelanggan: r.pelanggan,
    nilaiProyek: r.nilai_proyek ? parseFloat(r.nilai_proyek) || 0 : 0,
    divisi: r.divisi,
    segmen: r.segmen || null,
    witel: r.witel || null,
    statusF: r.status_f || null,
    proses: r.proses || null,
    statusProyek: r.status_proyek || null,
    kategoriKontrak: r.kategori_kontrak || null,
    estimateBulan: r.estimate_bulan || null,
    namaAm: r.nama_am || null,
    nikAm: r.nik_am || null,
    reportDate: r.report_date || null,
    createdDate: r.created_date || null,
    snapshotDate: r.snapshot_date || null,
    importId: null,
  }));

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await db.insert(salesFunnelTable).values(batch);
    process.stdout.write(`\r    [funnel] Inserted ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`);
  }
  console.log("\n  [funnel] Done.");
}

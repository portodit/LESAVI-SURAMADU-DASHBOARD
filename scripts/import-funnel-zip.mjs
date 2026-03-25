/**
 * Direct import script: Sales Funnel ZIP → PostgreSQL
 * Usage: node scripts/import-funnel-zip.mjs <path-to-zip> [period e.g. 2026-03]
 */

import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const JSZip = require("/home/runner/workspace/artifacts/api-server/node_modules/jszip");
const XLSX = require("/home/runner/workspace/artifacts/api-server/node_modules/xlsx");
const pg = require("/home/runner/workspace/lib/db/node_modules/pg");

const { Pool } = pg;

const ZIP_PATH = process.argv[2] || "attached_assets/TREG3_SALES_FUNNEL_20260316_1774463115437.zip";
const FORCE_PERIOD = process.argv[3] || null;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseDate(val) {
  if (!val) return "";
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const num = parseFloat(String(val));
  if (!isNaN(num) && num > 30000 && num < 100000) {
    const base = new Date(1899, 11, 30);
    base.setDate(base.getDate() + num);
    return base.toISOString().slice(0, 10);
  }
  const d = new Date(String(val));
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return String(val);
}

function clean(val) {
  if (val == null) return "";
  return String(val).trim();
}

function cleanUpper(val) {
  return clean(val).toUpperCase();
}

function toIntSafe(val) {
  const s = String(val ?? "").replace(/\D/g, "");
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

function cleanFunnelRows(rows) {
  const cleaned = [];
  for (const r of rows) {
    const nikRaw = toIntSafe(r.nik_pembuat_lop);
    if (nikRaw === null) continue;

    const witel = cleanUpper(r.witel);
    if (!witel.includes("SURAMADU")) continue;

    const divisi = clean(r.divisi).toUpperCase();
    if (divisi !== "DPS" && divisi !== "DSS") continue;

    const lopid = clean(r.lopid);
    if (!lopid) continue;

    const reportDate = parseDate(r.report_date);
    const reportYear = reportDate ? parseInt(reportDate.slice(0, 4), 10) : 0;

    let namaAm = cleanUpper(r.nama_pembuat_lop);
    if (reportYear >= 2026 && namaAm === "RENI WULANSARI") {
      namaAm = "HAVEA PERTIWI";
    }

    let nikAm = String(nikRaw);
    if (reportYear >= 2026 && nikAm === "850099") {
      nikAm = "870022";
    }

    cleaned.push({
      lopid,
      judulProyek: clean(r.judul_proyek),
      pelanggan: cleanUpper(r.pelanggan) || "–",
      nilaiProyek: parseFloat(String(r.nilai_proyek ?? 0)) || 0,
      divisi,
      segmen: clean(r.segmen),
      witel,
      statusF: clean(r.status_f),
      proses: clean(r.proses),
      statusProyek: clean(r.status_proyek),
      kategoriKontrak: clean(r.kategori_kontrak) || "–",
      estimateBulan: parseDate(r.estimate_bulan_billcomp) || clean(r.estimate_bulan_billcomp),
      namaAm,
      nikAm,
      reportDate,
      createdDate: parseDate(r.created_date) || clean(r.created_date),
    });
  }
  return cleaned;
}

function detectPeriod(rows, zipName) {
  // Try to get from filename
  const match = zipName.match(/(\d{8})/);
  if (match) {
    const raw = match[1];
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}`;
  }
  // Fallback to most common report_date
  const dates = rows.map(r => parseDate(r.report_date)).filter(Boolean);
  if (dates.length > 0) {
    const most = dates.sort((a, b) => dates.filter(d => d === b).length - dates.filter(d => d === a).length)[0];
    return most.slice(0, 7);
  }
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Reading zip: ${ZIP_PATH}`);
  const zipBuf = fs.readFileSync(ZIP_PATH);
  const zip = await JSZip.loadAsync(zipBuf);

  const xlsxFiles = Object.keys(zip.files).filter(name => {
    const base = path.basename(name);
    return !base.startsWith("~$") && !base.startsWith(".") && /\.xlsx?$/i.test(name);
  });

  console.log(`Found ${xlsxFiles.length} Excel files:`, xlsxFiles);

  let allRows = [];
  for (const fname of xlsxFiles) {
    const fileData = await zip.files[fname].async("nodebuffer");
    console.log(`Parsing ${fname} (${Math.round(fileData.length / 1024)}KB)...`);
    try {
      const wb = XLSX.read(fileData, { type: "buffer", cellDates: true, raw: false });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });
      if (rawRows.length < 2) continue;

      // Detect title row
      const row0 = rawRows[0];
      const row0NonNull = row0.filter(v => v !== null && v !== "").length;
      let headers, dataRows;
      if (row0NonNull === 1 && rawRows.length > 2) {
        headers = rawRows[1];
        dataRows = rawRows.slice(2);
      } else {
        headers = rawRows[0];
        dataRows = rawRows.slice(1);
      }

      const parsed = dataRows
        .filter(row => row.some(v => v !== null && v !== ""))
        .map(row => {
          const obj = {};
          headers.forEach((h, i) => { if (h) obj[h] = row[i] ?? null; });
          return obj;
        });

      console.log(`  ${fname}: ${parsed.length} rows`);
      allRows = allRows.concat(parsed);
    } catch (e) {
      console.warn(`  Failed to parse ${fname}: ${e.message}`);
    }
  }

  console.log(`Total raw rows combined: ${allRows.length}`);
  const cleaned = cleanFunnelRows(allRows);
  console.log(`After cleaning: ${cleaned.length} rows`);

  if (cleaned.length === 0) {
    console.error("No valid rows after cleaning. Exiting.");
    process.exit(1);
  }

  const period = FORCE_PERIOD || detectPeriod(allRows, path.basename(ZIP_PATH));
  console.log(`Period: ${period}`);

  const snapshotDateMatch = path.basename(ZIP_PATH).match(/(\d{8})/);
  const snapshotDate = snapshotDateMatch
    ? `${snapshotDateMatch[1].slice(0, 4)}-${snapshotDateMatch[1].slice(4, 6)}-${snapshotDateMatch[1].slice(6, 8)}`
    : null;

  // Connect to DB
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Check for duplicate
  const { rows: existing } = await pool.query(
    "SELECT id, rows_imported, created_at FROM data_imports WHERE type = 'funnel' AND period = $1",
    [period]
  );

  if (existing.length > 0) {
    console.log(`⚠️  Existing funnel import for period ${period} found (id=${existing[0].id}, rows=${existing[0].rows_imported}). Deleting and re-importing...`);
    await pool.query("DELETE FROM sales_funnel WHERE import_id = $1", [existing[0].id]);
    await pool.query("DELETE FROM data_imports WHERE id = $1", [existing[0].id]);
  }

  // Insert import record
  const { rows: [imp] } = await pool.query(
    "INSERT INTO data_imports (type, rows_imported, period, source_url, auto_telegram_sent) VALUES ('funnel', $1, $2, $3, false) RETURNING id",
    [cleaned.length, period, `zip:${path.basename(ZIP_PATH)}`]
  );
  console.log(`Created import record id=${imp.id}`);

  // Batch insert
  console.log("Inserting rows...");
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < cleaned.length; i += BATCH) {
    const batch = cleaned.slice(i, i + BATCH);
    const values = batch.map((r, idx) => {
      const base = idx * 16;
      return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10},$${base+11},$${base+12},$${base+13},$${base+14},$${base+15},$${base+16})`;
    }).join(",");
    const params = batch.flatMap(r => [
      r.lopid, r.judulProyek, r.pelanggan, r.nilaiProyek, r.divisi, r.segmen,
      r.witel, r.statusF, r.proses, r.statusProyek, r.kategoriKontrak,
      r.estimateBulan || null, r.namaAm, r.nikAm, r.reportDate || null,
      r.createdDate || null,
    ]);
    await pool.query(
      `INSERT INTO sales_funnel (lopid, judul_proyek, pelanggan, nilai_proyek, divisi, segmen, witel, status_f, proses, status_proyek, kategori_kontrak, estimate_bulan, nama_am, nik_am, report_date, created_date) VALUES ${values}`,
      params
    );
    inserted += batch.length;
    process.stdout.write(`\r  ${inserted}/${cleaned.length} rows inserted...`);
  }
  console.log(`\n✅ Done! ${inserted} rows imported for period ${period} (importId=${imp.id})`);

  const amCount = new Set(cleaned.map(r => r.nikAm)).size;
  console.log(`AM count: ${amCount}`);

  await pool.end();
}

main().catch(e => {
  console.error("FATAL:", e.message);
  process.exit(1);
});

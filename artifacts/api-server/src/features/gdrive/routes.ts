import { Router, type IRouter } from "express";
import { db, appSettingsTable, dataImportsTable, accountManagersTable } from "@workspace/db";
import { requireAuth } from "../../shared/auth";
import { parseExcelBuffer, detectPeriod, extractSnapshotDateFromUrl, cleanFunnelRows, cleanActivityRows, parseIndonesianNumber, slugify } from "../import/excel";
import XLSX from "xlsx";
import { desc, eq, and, sql } from "drizzle-orm";

const router: IRouter = Router();

const DRIVE_FOLDER_KEYS: Record<string, keyof typeof appSettingsTable.$inferSelect> = {
  performance: "gDriveFolderPerformance",
  funnel: "gDriveFolderFunnel",
  activity: "gDriveFolderActivity",
  target: "gDriveFolderTarget",
};

function extractFolderId(url: string): string | null {
  const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

async function listDriveFiles(folderId: string, apiKey: string) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const fields = encodeURIComponent("files(id,name,mimeType,modifiedTime,size)");
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime+desc&key=${apiKey}&fields=${fields}&pageSize=50`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Drive API error ${res.status}: ${body}`);
  }
  const data: any = await res.json();
  return (data.files || []) as Array<{ id: string; name: string; mimeType: string; modifiedTime: string; size?: string }>;
}

const GOOGLE_SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function isSupportedFile(name: string, mimeType: string): boolean {
  return (
    name.endsWith(".xlsx") || name.endsWith(".xls") ||
    mimeType === XLSX_MIME ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType === GOOGLE_SHEET_MIME
  );
}

async function downloadDriveFile(fileId: string, mimeType: string, apiKey: string): Promise<Buffer> {
  if (mimeType === GOOGLE_SHEET_MIME) {
    // Google Sheets native — gunakan Sheets API (tidak ada batas ukuran file)
    return downloadGoogleSheetAsBuffer(fileId, apiKey);
  }
  // File biasa (Excel) — download langsung
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gagal download file dari Drive: ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

/**
 * Baca Google Sheets via Sheets API v4 (tidak ada limit ukuran)
 * dan konversi ke XLSX buffer supaya bisa diproses parseExcelBuffer().
 */
async function downloadGoogleSheetAsBuffer(spreadsheetId: string, apiKey: string): Promise<Buffer> {
  // 1) Ambil nama sheet pertama
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?key=${apiKey}&fields=sheets.properties`
  );
  if (!metaRes.ok) {
    const body = await metaRes.text().catch(() => "");
    throw new Error(`Gagal ambil metadata Sheets: ${metaRes.status}${body ? ` — ${body.slice(0, 200)}` : ""}`);
  }
  const meta: any = await metaRes.json();
  const sheetTitle: string = meta.sheets?.[0]?.properties?.title ?? "Sheet1";

  // 2) Ambil semua nilai (UNFORMATTED_VALUE supaya angka tetap angka, bukan string format)
  const valRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetTitle)}?key=${apiKey}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`
  );
  if (!valRes.ok) {
    const body = await valRes.text().catch(() => "");
    throw new Error(`Gagal baca nilai Sheets: ${valRes.status}${body ? ` — ${body.slice(0, 200)}` : ""}`);
  }
  const valData: any = await valRes.json();
  const rawRows: any[][] = valData.values ?? [];

  // 3) Konversi 2-D array ke XLSX buffer supaya pipeline parseExcelBuffer tetap sama
  const ws = XLSX.utils.aoa_to_sheet(rawRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetTitle);
  const xlsxBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(xlsxBuf);
}

// ── GET /api/gdrive/list?type=performance ────────────────────────────────────
router.get("/gdrive/list", requireAuth, async (req, res): Promise<void> => {
  const { type } = req.query;
  const folderKey = DRIVE_FOLDER_KEYS[String(type)];
  if (!folderKey) { res.status(400).json({ error: "type tidak valid" }); return; }

  const [settings] = await db.select().from(appSettingsTable);
  const apiKey = settings?.gSheetsApiKey;
  const folderUrl = settings?.[folderKey] as string | null | undefined;

  if (!apiKey) { res.status(400).json({ error: "Google API Key belum dikonfigurasi di tab Google Sheets" }); return; }
  if (!folderUrl) { res.status(400).json({ error: `URL folder Google Drive untuk ${type} belum dikonfigurasi` }); return; }

  const folderId = extractFolderId(folderUrl);
  if (!folderId) { res.status(400).json({ error: "URL folder Google Drive tidak valid" }); return; }

  try {
    const files = await listDriveFiles(folderId, apiKey);
    const excelFiles = files.filter(f => isSupportedFile(f.name, f.mimeType));
    res.json({ files: excelFiles, folderId, folderUrl });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/gdrive/sync?type=performance ───────────────────────────────────
router.post("/gdrive/sync", requireAuth, async (req, res): Promise<void> => {
  const { type } = req.query;
  const { fileId: explicitFileId, snapshotDate: snapshotDateBodyOverride } = req.body;
  const folderKey = DRIVE_FOLDER_KEYS[String(type)];
  if (!folderKey) { res.status(400).json({ error: "type tidak valid" }); return; }

  const [settings] = await db.select().from(appSettingsTable);
  const apiKey = settings?.gSheetsApiKey;
  const folderUrl = settings?.[folderKey] as string | null | undefined;

  if (!apiKey) { res.status(400).json({ error: "Google API Key belum dikonfigurasi" }); return; }
  if (!folderUrl) { res.status(400).json({ error: `URL folder Google Drive untuk ${type} belum dikonfigurasi` }); return; }

  const folderId = extractFolderId(folderUrl);
  if (!folderId) { res.status(400).json({ error: "URL folder Google Drive tidak valid" }); return; }

  try {
    const files = await listDriveFiles(folderId, apiKey);
    const excelFiles = files.filter(f => isSupportedFile(f.name, f.mimeType));
    if (excelFiles.length === 0) { res.status(404).json({ error: "Tidak ada file Excel/Google Sheets di folder ini" }); return; }

    const targetFile = explicitFileId
      ? excelFiles.find(f => f.id === explicitFileId) || excelFiles[0]
      : excelFiles[0];

    const buffer = await downloadDriveFile(targetFile.id, targetFile.mimeType, apiKey);
    const rows = parseExcelBuffer(buffer);
    if (rows.length === 0) { res.status(400).json({ error: "File Excel kosong atau tidak dapat dibaca" }); return; }

    const sourceUrl = `https://drive.google.com/file/d/${targetFile.id}`;
    const period = detectPeriod(rows, targetFile.name);
    const snapshotDate = snapshotDateBodyOverride || extractSnapshotDateFromUrl(targetFile.name) || new Date().toISOString().slice(0, 10);

    if (type === "performance") {
      const result = await importPerformanceRows(rows, sourceUrl, period, snapshotDate, targetFile.name);
      res.json({ ...result, fileName: targetFile.name, fileModified: targetFile.modifiedTime, snapshotDate });
    } else if (type === "funnel") {
      const result = await importFunnelRows(rows, sourceUrl, period, snapshotDate, targetFile.name);
      res.json({ ...result, fileName: targetFile.name, fileModified: targetFile.modifiedTime, snapshotDate });
    } else if (type === "activity") {
      const result = await importActivityRows(rows, sourceUrl, period, snapshotDate, targetFile.name);
      res.json({ ...result, fileName: targetFile.name, fileModified: targetFile.modifiedTime, snapshotDate });
    } else {
      res.status(400).json({ error: `Sync untuk tipe '${type}' belum didukung` });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Import helpers (mirror of import/routes.ts logic) ───────────────────────
import {
  performanceDataTable, salesFunnelTable, salesActivityTable, masterCustomerTable
} from "@workspace/db";

async function getAmSlugMap() {
  const ams = await db.select({ nik: accountManagersTable.nik, slug: accountManagersTable.slug, nama: accountManagersTable.nama }).from(accountManagersTable);
  const map: Record<string, string> = {};
  for (const am of ams) { if (am.nik) map[am.nik] = am.slug || slugify(am.nama); }
  return map;
}

async function importPerformanceRows(rows: any[], sourceUrl: string, period: string | null, snapshotDateFull: string, fileName: string) {
  const isRawFormat = rows.length > 0 && ("PERIODE" in rows[0] || "NAMA_AM" in rows[0]);
  const slugMap = await getAmSlugMap();

  let toInsert: any[] = [];
  if (isRawFormat) {
    type Entry = { nik: string; nama: string; targetRev: number; realRev: number; periode: string };
    const grouped: Record<string, Entry> = {};
    for (const row of rows) {
      const nik = String(row["NIK"] || row["NIP"] || "").trim();
      const nama = String(row["NAMA_AM"] || row["NAMA"] || "").trim();
      const periodeRaw = String(row["PERIODE"] || "").trim();
      const target = parseIndonesianNumber(row["TARGET_REVENUE"] ?? row["TARGET"] ?? 0);
      const real = parseIndonesianNumber(row["REAL_REVENUE"] ?? row["REAL"] ?? 0);
      if (!nik && !nama) continue;
      const key = `${nik}|${periodeRaw}`;
      if (!grouped[key]) grouped[key] = { nik, nama, targetRev: 0, realRev: 0, periode: periodeRaw };
      grouped[key].targetRev += target;
      grouped[key].realRev += real;
    }
    toInsert = Object.values(grouped).map(e => ({
      nik: e.nik || null,
      namaAm: e.nama,
      amSlug: slugMap[e.nik] || slugify(e.nama),
      periode: e.periode || period || new Date().toISOString().slice(0, 7),
      targetRevenue: e.targetRev,
      realRevenue: e.realRev,
    }));
  } else {
    toInsert = rows.map(row => ({
      nik: String(row["NIK"] || row["NIP"] || "").trim() || null,
      namaAm: String(row["NAMA"] || row["NAMA_AM"] || "").trim(),
      amSlug: slugMap[String(row["NIK"] || "").trim()] || slugify(String(row["NAMA"] || row["NAMA_AM"] || "")),
      periode: period || new Date().toISOString().slice(0, 7),
      targetRevenue: parseIndonesianNumber(row["TARGET"] ?? row["TARGET_REVENUE"] ?? 0),
      realRevenue: parseIndonesianNumber(row["REAL"] ?? row["REAL_REVENUE"] ?? 0),
    })).filter(r => r.namaAm);
  }

  const [importRecord] = await db.insert(dataImportsTable).values({
    type: "performance", sourceUrl, period: period || new Date().toISOString().slice(0, 7),
    rowsImported: toInsert.length, snapshotDate: snapshotDateFull,
  }).returning();

  if (toInsert.length > 0) {
    for (const row of toInsert) {
      await db.insert(performanceDataTable).values({ ...row, importId: importRecord.id })
        .onConflictDoNothing();
    }
  }
  return { imported: toInsert.length, importId: importRecord.id, period };
}

/** Ensure value is a plain string (or null) — guards against Date objects from cellDates:true */
function safeStr(val: any): string | null {
  if (val === null || val === undefined || val === "") return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val);
}

async function importFunnelRows(rows: any[], sourceUrl: string, period: string | null, snapshotDateFull: string, fileName: string) {
  const cleaned = cleanFunnelRows(rows, {
    preferPembuat: true,      // nik_pembuat_lop first; nik_handling[0] fallback (Excel kadang kosong di nik_pembuat_lop)
    skipIsReportFilter: true, // Power BI: tidak ada filter is_report
  });
  const allAms = await db.select({ nik: accountManagersTable.nik, nama: accountManagersTable.nama, divisi: accountManagersTable.divisi }).from(accountManagersTable);

  function findAm(nikRaw: string, namaRaw: string) {
    const nik = String(nikRaw || "").trim();
    const nama = String(namaRaw || "").trim().toUpperCase();
    let found = allAms.find(a => a.nik === nik);
    if (!found && nama) found = allAms.find(a => (a.nama || "").toUpperCase().includes(nama) || nama.includes((a.nama || "").toUpperCase()));
    return found;
  }

  const snapshotStr = snapshotDateFull || new Date().toISOString().slice(0, 10);
  const periodStr = period || new Date().toISOString().slice(0, 7);

  const toInsert = cleaned.map((row: any) => {
    const am = findAm(row.nik, row.namaAm);
    return {
      lopid: safeStr(row.lopid)!,
      judulProyek: safeStr(row.judulProyek) || "",
      pelanggan: safeStr(row.pelanggan) || "",
      nilaiProyek: typeof row.nilaiProyek === "number" ? row.nilaiProyek : 0,
      divisi: safeStr(row.divisi) || safeStr(am?.divisi) || "DPS",
      segmen: safeStr(row.segmen),
      witel: safeStr(row.witel),
      statusF: safeStr(row.statusF),
      proses: safeStr(row.proses),
      statusProyek: safeStr(row.statusProyek),
      kategoriKontrak: safeStr(row.kategoriKontrak),
      estimateBulan: safeStr(row.estimateBulan),
      namaAm: safeStr(am?.nama) || safeStr(row.namaAm) || "",
      nikAm: safeStr(am?.nik) || safeStr(row.nik),
      reportDate: safeStr(row.reportDate),
      snapshotDate: snapshotStr,
    };
  }).filter((r: any) => r.lopid);

  // Delete rows for THIS snapshot's lopids only — jangan hapus snapshot lain!
  // Ini untuk handle re-sync file yang sama; snapshot berbeda tetap aman.
  const existingLopids = toInsert.map(r => r.lopid);
  if (existingLopids.length > 0) {
    for (let i = 0; i < existingLopids.length; i += 200) {
      const batch = existingLopids.slice(i, i + 200);
      await db.delete(salesFunnelTable).where(and(
        eq(salesFunnelTable.snapshotDate, snapshotStr),
        sql`lopid = ANY(ARRAY[${sql.join(batch.map(id => sql`${id}`), sql`, `)}])`
      ));
    }
  }

  const [importRecord] = await db.insert(dataImportsTable).values({
    type: "funnel", sourceUrl, period: periodStr,
    rowsImported: toInsert.length, snapshotDate: snapshotStr,
  }).returning();

  const BATCH = 200;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH).map(row => ({ ...row, importId: importRecord.id }));
    await db.insert(salesFunnelTable).values(batch).onConflictDoNothing();
  }

  // Auto-populate master_customer
  const uniqueCustomers = [...new Set(toInsert.map(r => r.pelanggan).filter(p => p && p !== "–"))];
  for (let i = 0; i < uniqueCustomers.length; i += 100) {
    await db.insert(masterCustomerTable)
      .values(uniqueCustomers.slice(i, i + 100).map(nama => ({ nama, witel: "SURAMADU" })))
      .onConflictDoNothing();
  }

  return { imported: toInsert.length, importId: importRecord.id, period: periodStr };
}

async function importActivityRows(rows: any[], sourceUrl: string, period: string | null, snapshotDateFull: string, fileName: string) {
  const cleaned = cleanActivityRows(rows);
  const snapshotStr = snapshotDateFull || new Date().toISOString().slice(0, 10);
  const periodStr = period || new Date().toISOString().slice(0, 7);

  const [importRecord] = await db.insert(dataImportsTable).values({
    type: "activity", sourceUrl, period: periodStr,
    rowsImported: cleaned.length, snapshotDate: snapshotStr,
  }).returning();

  const BATCH = 200;
  for (let i = 0; i < cleaned.length; i += BATCH) {
    const batch = cleaned.slice(i, i + BATCH).map(row => ({
      ...row,
      snapshotDate: snapshotStr,
      importId: importRecord.id,
    }));
    await db.insert(salesActivityTable).values(batch).onConflictDoNothing();
  }
  return { imported: cleaned.length, importId: importRecord.id, period: periodStr };
}

export default router;

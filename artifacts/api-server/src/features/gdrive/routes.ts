import { Router, type IRouter } from "express";
import { db, appSettingsTable, dataImportsTable, accountManagersTable } from "@workspace/db";
import { requireAuth } from "../../shared/auth";
import { parseExcelBuffer, parseRaw2DArray, detectPeriod, extractSnapshotDateFromUrl, cleanFunnelRows, cleanActivityRows, parseIndonesianNumber, slugify } from "../import/excel";
import type { ParsedRow } from "../import/excel";
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

/**
 * Download file dari Drive dan langsung return ParsedRow[].
 * Untuk Google Sheets: gunakan Sheets API v4 → parse 2D array langsung (tanpa XLSX, hemat RAM).
 * Untuk file Excel (.xlsx): download buffer → parse dengan XLSX.
 */
async function downloadDriveFileAsRows(fileId: string, mimeType: string, apiKey: string): Promise<ParsedRow[]> {
  if (mimeType === GOOGLE_SHEET_MIME) {
    return downloadGoogleSheetRows(fileId, apiKey);
  }
  // File biasa (Excel) — download lalu parse
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gagal download file dari Drive: ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`);
  }
  const ab = await res.arrayBuffer();
  const buffer = Buffer.from(ab);
  return parseExcelBuffer(buffer);
}

/**
 * Baca Google Sheets via Sheets API v4 dan parse langsung ke ParsedRow[].
 * TIDAK menggunakan XLSX library sama sekali — hemat RAM ~10x dibanding konversi ke buffer dulu.
 */
async function downloadGoogleSheetRows(spreadsheetId: string, apiKey: string): Promise<ParsedRow[]> {
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

  // 3) Parse 2-D array langsung ke ParsedRow[] — tidak ada konversi XLSX, hemat RAM besar
  return parseRaw2DArray(rawRows);
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

    const rows = await downloadDriveFileAsRows(targetFile.id, targetFile.mimeType, apiKey);
    if (rows.length === 0) { res.status(400).json({ error: "File Excel/Sheets kosong atau tidak dapat dibaca" }); return; }

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
  // Deteksi format RAW (per-pelanggan per-bulan) vs pre-aggregated
  const isRawFormat = rows.length > 0 && ("PERIODE" in rows[0] || "NAMA_AM" in rows[0]);

  type CustomerEntry = {
    nip: string; pelanggan: string; proporsi: number;
    group: string; industri: string; lsegmen: string; ssegmen: string;
    witelCc: string; telda: string; regional: string; divisiCc: string; kawasan: string;
    Reguler: { target: number; real: number };
    Sustain: { target: number; real: number };
    Scaling: { target: number; real: number };
    NGTMA: { target: number; real: number };
    targetTotal: number; realTotal: number;
  };
  type AmEntry = {
    nik: string; namaAm: string; divisi: string; witel: string; levelAm: string;
    tahun: number; bulan: number;
    target: number; real: number;
    tReg: number; rReg: number; tSustain: number; rSustain: number;
    tScaling: number; rScaling: number; tNgtma: number; rNgtma: number;
    customers: CustomerEntry[];
  };

  let toInsert: any[] = [];

  if (isRawFormat) {
    // Format RAW: satu baris per pelanggan per bulan, agregasi per NIK + PERIODE
    const amMap = new Map<string, AmEntry>();

    for (const r of rows) {
      const nik = String(r.NIK || r.nik || "").trim();
      const namaAm = String(r.NAMA_AM || r.nama_am || "").trim();
      const divisiRaw = String(r.DIVISI_AM || r.divisi || "").trim();
      const periodeStr = String(r.PERIODE || "").trim();
      if (!nik || !namaAm || !periodeStr || periodeStr.length < 6) continue;
      if (divisiRaw.toUpperCase() === "DGS") continue;

      const key = `${nik}__${periodeStr}`;

      const tReg     = parseIndonesianNumber(r.TARGET_REVENUE ?? r.target_revenue);
      const rReg     = parseIndonesianNumber(r.REAL_REVENUE ?? r.real_revenue);
      const tSustain = parseIndonesianNumber(r.TARGET_SUSTAIN ?? r.target_sustain ?? 0);
      const rSustain = parseIndonesianNumber(r.REAL_SUSTAIN ?? r.real_sustain ?? 0);
      const tScaling = parseIndonesianNumber(r.TARGET_SCALING ?? r.target_scaling ?? 0);
      const rScaling = parseIndonesianNumber(r.REAL_SCALING ?? r.real_scaling ?? 0);
      const tNgtma   = parseIndonesianNumber(r.TARGET_NGTMA ?? r.target_ngtma ?? 0);
      const rNgtma   = parseIndonesianNumber(r.REAL_NGTMA ?? r.real_ngtma ?? 0);
      const targetTotal = tReg + tSustain + tScaling + tNgtma;
      const realTotal   = rReg + rSustain + rScaling + rNgtma;

      // Parse tahun/bulan dari PERIODE (e.g. "202603" → tahun=2026, bulan=3)
      const tahun = parseInt(periodeStr.slice(0, 4), 10);
      const bulan = parseInt(periodeStr.slice(4, 6), 10);

      const pelanggan = String(r.STANDARD_NAME || r.NAMA_PELANGGAN || r.PELANGGAN || r.pelanggan || r.nama_account || "").trim();
      const nip = String(r.NIP_NAS || r.nip_nas || r.NIP || "").trim();
      const proporsi = parseFloat(String(r.PROPORSI ?? r.proporsi ?? 0)) || 0;

      if (!amMap.has(key)) {
        amMap.set(key, {
          nik, namaAm, divisi: divisiRaw,
          witel: String(r.WITEL_AM || r.witel || "SURAMADU").trim(),
          levelAm: String(r.LEVEL_AM || r.level_am || "").trim(),
          tahun, bulan,
          target: 0, real: 0,
          tReg: 0, rReg: 0, tSustain: 0, rSustain: 0,
          tScaling: 0, rScaling: 0, tNgtma: 0, rNgtma: 0,
          customers: [],
        });
      }
      const entry = amMap.get(key)!;
      entry.target += targetTotal; entry.real += realTotal;
      entry.tReg += tReg; entry.rReg += rReg;
      entry.tSustain += tSustain; entry.rSustain += rSustain;
      entry.tScaling += tScaling; entry.rScaling += rScaling;
      entry.tNgtma += tNgtma; entry.rNgtma += rNgtma;
      if (pelanggan || nip) {
        entry.customers.push({
          nip, pelanggan, proporsi,
          group: String(r.GROUP || r.group || "").trim(),
          industri: String(r.INDUSTRI || r.industri || "").trim(),
          lsegmen: String(r.LSEGMEN || r.lsegmen || "").trim(),
          ssegmen: String(r.SSEGMEN || r.ssegmen || "").trim(),
          witelCc: String(r.WITEL_CC || r.witel_cc || "").trim(),
          telda: String(r.TELDA || r.telda || "").trim(),
          regional: String(r.REGIONAL || r.regional || "").trim(),
          divisiCc: String(r.DIVISI_CC || r.divisi_cc || "").trim(),
          kawasan: String(r.KAWASAN || r.kawasan || "").trim(),
          Reguler: { target: tReg, real: rReg },
          Sustain: { target: tSustain, real: rSustain },
          Scaling: { target: tScaling, real: rScaling },
          NGTMA: { target: tNgtma, real: rNgtma },
          targetTotal, realTotal,
        });
      }
    }

    toInsert = [...amMap.values()].map(entry => {
      const achRate = entry.target > 0 ? entry.real / entry.target : 0;
      return {
        nik: entry.nik,
        namaAm: entry.namaAm,
        divisi: entry.divisi,
        witelAm: entry.witel || null,
        levelAm: entry.levelAm || null,
        tahun: entry.tahun,
        bulan: entry.bulan,
        targetRevenue: entry.target,
        realRevenue: entry.real,
        targetReguler: entry.tReg,
        realReguler: entry.rReg,
        targetSustain: entry.tSustain,
        realSustain: entry.rSustain,
        targetScaling: entry.tScaling,
        realScaling: entry.rScaling,
        targetNgtma: entry.tNgtma,
        realNgtma: entry.rNgtma,
        achRate, achRateYtd: achRate, rankAch: 0,
        statusWarna: achRate >= 1 ? "hijau" : achRate >= 0.8 ? "oranye" : "merah",
        snapshotDate: snapshotDateFull,
        komponenDetail: entry.customers.length > 0 ? JSON.stringify(entry.customers) : null,
      };
    }).filter(r => r.nik && r.namaAm);
  } else {
    // Format pre-aggregated: satu baris per AM
    const [y, m] = (period || new Date().toISOString().slice(0, 7)).split("-").map(Number);
    toInsert = rows.filter((r: any) => {
      const div = String(r.DIVISI_AM || r.divisi || "").trim().toUpperCase();
      return div !== "DGS";
    }).map((r: any) => {
      const achRate = parseFloat(String(r["Ach Rate Dinamis MTD"] || r.ach_rate || 0)) || 0;
      return {
        nik: String(r.NIK || r.nik || ""),
        namaAm: String(r.NAMA_AM || r.nama_am || "").trim(),
        divisi: String(r.DIVISI_AM || r.divisi || "").trim(),
        witelAm: null, levelAm: null,
        tahun: y, bulan: m,
        targetRevenue: parseIndonesianNumber(r["Target Revenue Dinamis"] || r.target_revenue),
        realRevenue: parseIndonesianNumber(r["Real Revenue Dinamis"] || r.real_revenue),
        achRate, achRateYtd: achRate, rankAch: 0,
        statusWarna: String(r["AM Hijau"] === "1" ? "hijau" : r["AM Oranye"] === "1" ? "oranye" : "merah"),
        snapshotDate: snapshotDateFull,
      };
    }).filter((r: any) => r.nik && r.namaAm);
  }

  if (toInsert.length === 0) {
    return { imported: 0, importId: null, period, message: "Tidak ada baris valid setelah aggregasi" };
  }

  // Deteksi periode dari baris pertama hasil aggregasi (untuk RAW format)
  const firstRow = toInsert[0];
  const resolvedPeriod = period ||
    (isRawFormat && firstRow.tahun && firstRow.bulan
      ? `${firstRow.tahun}-${String(firstRow.bulan).padStart(2, "0")}`
      : new Date().toISOString().slice(0, 7));

  const [importRecord] = await db.insert(dataImportsTable).values({
    type: "performance", sourceUrl, period: resolvedPeriod,
    rowsImported: toInsert.length, snapshotDate: snapshotDateFull,
  }).returning();

  const BATCH = 200;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    await db.insert(performanceDataTable)
      .values(toInsert.slice(i, i + BATCH).map(row => ({ ...row, importId: importRecord.id })))
      .onConflictDoNothing();
  }

  // Auto-populate account_managers dari NIK baru
  const existing = await db.select({ nik: accountManagersTable.nik }).from(accountManagersTable);
  const existingNiks = new Set(existing.map((a: any) => a.nik));
  const newAMs = toInsert.filter(r => !existingNiks.has(r.nik) && r.nik && r.namaAm).map(r => ({
    nik: r.nik, nama: r.namaAm, slug: slugify(r.namaAm),
    divisi: r.divisi || "DPS", witel: r.witelAm || "SURAMADU",
  }));
  for (let i = 0; i < newAMs.length; i += 50) {
    await db.insert(accountManagersTable).values(newAMs.slice(i, i + 50)).onConflictDoNothing();
  }

  return { imported: toInsert.length, importId: importRecord.id, period: resolvedPeriod };
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

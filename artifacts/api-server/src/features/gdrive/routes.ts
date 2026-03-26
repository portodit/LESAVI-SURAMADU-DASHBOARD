import { Router, type IRouter } from "express";
import { db, appSettingsTable, dataImportsTable, accountManagersTable } from "@workspace/db";
import { requireAuth } from "../../shared/auth";
import { parseExcelBuffer, detectPeriod, cleanFunnelRows, cleanActivityRows, parseIndonesianNumber, slugify } from "../import/excel";
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

async function downloadDriveFile(fileId: string, apiKey: string): Promise<Buffer> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gagal download file dari Drive: ${res.status} ${res.statusText}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

function isExcelFile(name: string, mimeType: string): boolean {
  return (
    name.endsWith(".xlsx") || name.endsWith(".xls") ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel"
  );
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
    const excelFiles = files.filter(f => isExcelFile(f.name, f.mimeType));
    res.json({ files: excelFiles, folderId, folderUrl });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/gdrive/sync?type=performance ───────────────────────────────────
router.post("/gdrive/sync", requireAuth, async (req, res): Promise<void> => {
  const { type } = req.query;
  const { fileId: explicitFileId } = req.body;
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
    const excelFiles = files.filter(f => isExcelFile(f.name, f.mimeType));
    if (excelFiles.length === 0) { res.status(404).json({ error: "Tidak ada file Excel di folder ini" }); return; }

    const targetFile = explicitFileId
      ? excelFiles.find(f => f.id === explicitFileId) || excelFiles[0]
      : excelFiles[0];

    const buffer = await downloadDriveFile(targetFile.id, apiKey);
    const rows = parseExcelBuffer(buffer);
    if (rows.length === 0) { res.status(400).json({ error: "File Excel kosong atau tidak dapat dibaca" }); return; }

    const sourceUrl = `https://drive.google.com/file/d/${targetFile.id}`;
    const snapshotDate = detectPeriod(rows, targetFile.name);

    if (type === "performance") {
      const result = await importPerformanceRows(rows, sourceUrl, snapshotDate, targetFile.name);
      res.json({ ...result, fileName: targetFile.name, fileModified: targetFile.modifiedTime });
    } else if (type === "funnel") {
      const result = await importFunnelRows(rows, sourceUrl, snapshotDate, targetFile.name);
      res.json({ ...result, fileName: targetFile.name, fileModified: targetFile.modifiedTime });
    } else if (type === "activity") {
      const result = await importActivityRows(rows, sourceUrl, snapshotDate, targetFile.name);
      res.json({ ...result, fileName: targetFile.name, fileModified: targetFile.modifiedTime });
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

async function importPerformanceRows(rows: any[], sourceUrl: string, period: string | null, fileName: string) {
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
    type: "performance", sourceUrl, period, rowCount: toInsert.length,
    status: "success", notes: `Auto-sync dari Google Drive: ${fileName}`,
  }).returning();

  if (toInsert.length > 0) {
    for (const row of toInsert) {
      await db.insert(performanceDataTable).values({ ...row, importId: importRecord.id })
        .onConflictDoNothing();
    }
  }
  return { imported: toInsert.length, importId: importRecord.id, period };
}

async function importFunnelRows(rows: any[], sourceUrl: string, period: string | null, fileName: string) {
  const cleaned = cleanFunnelRows(rows);
  const slugMap = await getAmSlugMap();
  const allAms = await db.select({ nik: accountManagersTable.nik, nama: accountManagersTable.nama, slug: accountManagersTable.slug, divisi: accountManagersTable.divisi }).from(accountManagersTable);

  function findAm(nikRaw: string, namaRaw: string) {
    const nik = String(nikRaw || "").trim();
    const nama = String(namaRaw || "").trim().toUpperCase();
    let found = allAms.find(a => a.nik === nik);
    if (!found && nama) found = allAms.find(a => (a.nama || "").toUpperCase().includes(nama) || nama.includes((a.nama || "").toUpperCase()));
    return found;
  }

  const toInsert = cleaned.map((row: any) => {
    const am = findAm(row.nik, row.namaAm);
    return {
      lopid: row.lopid,
      judulProyek: row.judulProyek,
      pelanggan: row.pelanggan,
      nilaiProyek: row.nilaiProyek,
      divisi: row.divisi || am?.divisi || "DPS",
      segmen: row.segmen || null,
      witel: row.witel || null,
      statusF: row.statusF || null,
      proses: row.proses || null,
      statusProyek: row.statusProyek || null,
      kategoriKontrak: row.kategoriKontrak || null,
      estimateBulan: row.estimateBulan || null,
      namaAm: am?.nama || row.namaAm,
      nikAm: am?.nik || row.nik,
      reportDate: row.reportDate || null,
      snapshotDate: snapshotDate || new Date().toISOString().slice(0, 10),
    };
  }).filter((r: any) => r.lopid);

  const [importRecord] = await db.insert(dataImportsTable).values({
    type: "funnel", sourceUrl, period, rowCount: toInsert.length,
    status: "success", notes: `Auto-sync dari Google Drive: ${fileName}`,
  }).returning();

  for (const row of toInsert) {
    await db.insert(salesFunnelTable).values({ ...row, importId: importRecord.id })
      .onConflictDoUpdate({ target: [salesFunnelTable.lopid], set: { ...row, importId: importRecord.id } });
    if (row.pelanggan) {
      await db.insert(masterCustomerTable).values({ nama: row.pelanggan, divisi: row.divisi })
        .onConflictDoNothing();
    }
  }
  return { imported: toInsert.length, importId: importRecord.id, period };
}

async function importActivityRows(rows: any[], sourceUrl: string, period: string | null, fileName: string) {
  const cleaned = cleanActivityRows(rows);
  const slugMap = await getAmSlugMap();

  const toInsert = cleaned.map((row: any) => ({
    nik: row.nik || null,
    namaAm: row.namaAm,
    amSlug: slugMap[row.nik] || slugify(row.namaAm),
    activityType: row.activityType,
    activityDate: row.activityDate ? new Date(row.activityDate) : null,
    pelanggan: row.pelanggan || null,
    keterangan: row.keterangan || null,
    periode: period || new Date().toISOString().slice(0, 7),
  })).filter((r: any) => r.namaAm);

  const [importRecord] = await db.insert(dataImportsTable).values({
    type: "activity", sourceUrl, period, rowCount: toInsert.length,
    status: "success", notes: `Auto-sync dari Google Drive: ${fileName}`,
  }).returning();

  for (const row of toInsert) {
    await db.insert(salesActivityTable).values({ ...row, importId: importRecord.id })
      .onConflictDoNothing();
  }
  return { imported: toInsert.length, importId: importRecord.id, period };
}

export default router;

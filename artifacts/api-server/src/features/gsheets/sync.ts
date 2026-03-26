import {
  db, appSettingsTable, dataImportsTable,
  salesFunnelTable, salesActivityTable, performanceDataTable,
  masterAmTable, accountManagersTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { cleanFunnelRows, cleanActivityRows, parseIndonesianNumber, slugify } from "../import/excel";
import type { ParsedRow } from "../import/excel";
import { logger } from "../../shared/logger";

export interface SheetInfo {
  title: string;
  sheetId: number;
  detectedType: "funnel" | "activity" | "performance";
}

export interface SyncSheetResult {
  sheetName: string;
  date: string;
  period: string;
  type: "funnel" | "activity" | "performance";
  status: "imported" | "skipped" | "error";
  rowsImported?: number;
  message: string;
}

export interface SyncResult {
  syncedAt: string;
  sheetsFound: number;
  results: SyncSheetResult[];
  error?: string;
}

/** Patterns that determine sheet type based on name prefix */
const SHEET_PATTERNS: { prefix: string; type: "funnel" | "activity" | "performance" }[] = [
  { prefix: "TREG3_SALES_FUNNEL_", type: "funnel" },
  { prefix: "TREG3_ACTIVITY_", type: "activity" },
  { prefix: "PERFORMANSI_", type: "performance" },
];

/** Detect sheet type from its name. Returns null if no pattern matches */
function detectSheetType(name: string): "funnel" | "activity" | "performance" | null {
  for (const p of SHEET_PATTERNS) {
    if (name.toUpperCase().startsWith(p.prefix.toUpperCase())) return p.type;
  }
  return null;
}

/** Extract YYYY-MM-DD and YYYY-MM from sheet name ending with YYYYMMDD */
function parseDateFromSheetName(name: string): { date: string; period: string } | null {
  const match = name.match(/(\d{8})$/);
  if (!match) return null;
  const raw = match[1];
  const year = raw.slice(0, 4), month = raw.slice(4, 6), day = raw.slice(6, 8);
  const y = parseInt(year), mo = parseInt(month), d = parseInt(day);
  if (y < 2020 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { date: `${year}-${month}-${day}`, period: `${year}-${month}` };
}

/** List all sheets in a Google Spreadsheet that match any known pattern */
export async function listAllMatchingSheets(
  spreadsheetId: string,
  apiKey: string,
): Promise<SheetInfo[]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?key=${apiKey}&fields=sheets.properties(sheetId,title)`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const err = await resp.text().catch(() => "");
    throw new Error(`Google Sheets API error ${resp.status}: ${err.slice(0, 200)}`);
  }
  const data = await resp.json() as { sheets: { properties: { sheetId: number; title: string } }[] };
  const sheets = data.sheets || [];
  const result: SheetInfo[] = [];
  for (const s of sheets) {
    const title = s.properties.title;
    const detectedType = detectSheetType(title);
    if (detectedType) {
      result.push({ title, sheetId: s.properties.sheetId, detectedType });
    }
  }
  return result;
}

/** Legacy: list sheets matching a single pattern (used by "Cek Daftar Sheet" preview) */
export async function listFunnelSheets(
  spreadsheetId: string,
  apiKey: string,
  _pattern: string,
): Promise<{ title: string; sheetId: number }[]> {
  return listAllMatchingSheets(spreadsheetId, apiKey);
}

/** Fetch a sheet's data as ParsedRow[] via Sheets API v4 values endpoint */
export async function fetchSheetData(
  spreadsheetId: string,
  sheetName: string,
  apiKey: string,
): Promise<ParsedRow[]> {
  const encodedSheet = encodeURIComponent(sheetName);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedSheet}?key=${apiKey}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const err = await resp.text().catch(() => "");
    throw new Error(`Google Sheets API error ${resp.status}: ${err.slice(0, 200)}`);
  }
  const data = await resp.json() as { values?: string[][] };
  const values = data.values || [];
  if (values.length < 2) return [];

  const row0 = values[0];
  const row0NonNull = row0.filter(v => v !== null && v !== "").length;
  const headerIdx = (row0NonNull === 1 && values.length > 2) ? 1 : 0;
  const headers = values[headerIdx].map(h => String(h ?? "").trim());
  const dataRows = values.slice(headerIdx + 1);

  return dataRows
    .filter(row => row.some(v => v !== null && v !== ""))
    .map(row => {
      const obj: ParsedRow = {};
      headers.forEach((h, i) => {
        if (h) obj[h] = row[i] !== undefined ? row[i] : null;
      });
      return obj;
    });
}

/** Import a single FUNNEL sheet */
async function importFunnelSheet(
  spreadsheetId: string, sheet: SheetInfo, apiKey: string,
  dateInfo: { date: string; period: string },
): Promise<SyncSheetResult> {
  const { date, period } = dateInfo;
  try {
    const rows = await fetchSheetData(spreadsheetId, sheet.title, apiKey);
    if (rows.length === 0) {
      return { sheetName: sheet.title, date, period, type: "funnel", status: "error", message: "Sheet kosong atau tidak ada data" };
    }

    const cleaned = cleanFunnelRows(rows);
    const activeAms = await db.select({ nik: masterAmTable.nik }).from(masterAmTable).where(eq(masterAmTable.aktif, true));
    const activeNikSet = new Set(activeAms.map(a => a.nik));
    const activeOnly = cleaned.filter(r => r.nikAm && activeNikSet.has(r.nikAm));

    if (activeOnly.length === 0) {
      return { sheetName: sheet.title, date, period, type: "funnel", status: "error", message: `Tidak ada baris valid setelah cleaning dari ${rows.length} baris mentah` };
    }

    const [imp] = await db.insert(dataImportsTable).values({
      type: "funnel", rowsImported: activeOnly.length, period,
      sourceUrl: `gsheets:${spreadsheetId}/${sheet.title}`, autoTelegramSent: false,
    }).returning();

    const BATCH = 200;
    for (let i = 0; i < activeOnly.length; i += BATCH) {
      await db.insert(salesFunnelTable).values(
        activeOnly.slice(i, i + BATCH).map(row => ({ ...row, snapshotDate: date, importId: imp.id }))
      );
    }

    const allMasterAms = await db.select().from(masterAmTable);
    const masterNameByNik = new Map(allMasterAms.map(m => [m.nik, m.nama]));
    for (const row of activeOnly.filter(r => !r.namaAm && r.nikAm && masterNameByNik.has(r.nikAm))) {
      await db.update(salesFunnelTable)
        .set({ namaAm: masterNameByNik.get(row.nikAm) })
        .where(and(eq(salesFunnelTable.importId, imp.id), eq(salesFunnelTable.nikAm, row.nikAm)));
    }

    return { sheetName: sheet.title, date, period, type: "funnel", status: "imported", rowsImported: activeOnly.length, message: `${activeOnly.length} baris berhasil diimport dari ${rows.length} baris mentah` };
  } catch (err: any) {
    return { sheetName: sheet.title, date, period, type: "funnel", status: "error", message: err?.message || String(err) };
  }
}

/** Import a single ACTIVITY sheet */
async function importActivitySheet(
  spreadsheetId: string, sheet: SheetInfo, apiKey: string,
  dateInfo: { date: string; period: string },
): Promise<SyncSheetResult> {
  const { date, period } = dateInfo;
  try {
    const rows = await fetchSheetData(spreadsheetId, sheet.title, apiKey);
    if (rows.length === 0) {
      return { sheetName: sheet.title, date, period, type: "activity", status: "error", message: "Sheet kosong atau tidak ada data" };
    }

    const cleaned = cleanActivityRows(rows);
    if (cleaned.length === 0) {
      return { sheetName: sheet.title, date, period, type: "activity", status: "error", message: `Tidak ada baris valid setelah cleaning dari ${rows.length} baris mentah` };
    }

    const [imp] = await db.insert(dataImportsTable).values({
      type: "activity", rowsImported: cleaned.length, period,
      sourceUrl: `gsheets:${spreadsheetId}/${sheet.title}`, autoTelegramSent: false,
    }).returning();

    const BATCH = 200;
    for (let i = 0; i < cleaned.length; i += BATCH) {
      await db.insert(salesActivityTable).values(
        cleaned.slice(i, i + BATCH).map(row => ({ ...row, snapshotDate: date, importId: imp.id }))
      );
    }

    return { sheetName: sheet.title, date, period, type: "activity", status: "imported", rowsImported: cleaned.length, message: `${cleaned.length} baris berhasil diimport dari ${rows.length} baris mentah` };
  } catch (err: any) {
    return { sheetName: sheet.title, date, period, type: "activity", status: "error", message: err?.message || String(err) };
  }
}

/** Import a single PERFORMANCE (PERFORMANSI) sheet — RAW format aggregation */
async function importPerformanceSheet(
  spreadsheetId: string, sheet: SheetInfo, apiKey: string,
  dateInfo: { date: string; period: string },
): Promise<SyncSheetResult> {
  const { date, period } = dateInfo;
  try {
    const rows = await fetchSheetData(spreadsheetId, sheet.title, apiKey);
    if (rows.length === 0) {
      return { sheetName: sheet.title, date, period, type: "performance", status: "error", message: "Sheet kosong atau tidak ada data" };
    }

    const [y, m] = period.split("-").map(Number);
    const amMap = new Map<string, any>();

    for (const r of rows) {
      const nik = String(r.NIK || r.nik || "").trim();
      const namaAm = String(r.NAMA_AM || r.nama_am || "").trim();
      const divisiRaw = String(r.DIVISI_AM || r.divisi || "").trim();
      if (!nik || !namaAm) continue;
      if (divisiRaw.toUpperCase() === "DGS") continue;

      const key = nik;
      const tReg = parseIndonesianNumber(r.TARGET_REVENUE ?? r.target_revenue);
      const rReg = parseIndonesianNumber(r.REAL_REVENUE ?? r.real_revenue);
      const tSustain = parseIndonesianNumber(r.TARGET_SUSTAIN ?? r.target_sustain ?? 0);
      const rSustain = parseIndonesianNumber(r.REAL_SUSTAIN ?? r.real_sustain ?? 0);
      const tScaling = parseIndonesianNumber(r.TARGET_SCALING ?? r.target_scaling ?? 0);
      const rScaling = parseIndonesianNumber(r.REAL_SCALING ?? r.real_scaling ?? 0);
      const tNgtma = parseIndonesianNumber(r.TARGET_NGTMA ?? r.target_ngtma ?? 0);
      const rNgtma = parseIndonesianNumber(r.REAL_NGTMA ?? r.real_ngtma ?? 0);

      const pelanggan = String(r.STANDARD_NAME || r.NAMA_PELANGGAN || r.PELANGGAN || "").trim();
      const nip = String(r.NIP_NAS || r.NIP || "").trim();
      const proporsi = parseFloat(String(r.PROPORSI ?? 0)) || 0;
      const targetTotal = tReg + tSustain + tScaling + tNgtma;
      const realTotal = rReg + rSustain + rScaling + rNgtma;

      if (!amMap.has(key)) {
        amMap.set(key, {
          nik, namaAm, divisi: divisiRaw,
          witel: String(r.WITEL_AM || r.witel || "SURAMADU").trim(),
          levelAm: String(r.LEVEL_AM || r.level_am || "").trim(),
          tahun: y, bulan: m,
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
        entry.customers.push({ nip, pelanggan, proporsi,
          group: String(r.GROUP || "").trim(), industri: String(r.INDUSTRI || "").trim(),
          targetTotal, realTotal,
        });
      }
    }

    const toInsert = [...amMap.values()].map(entry => {
      const achRate = entry.target > 0 ? entry.real / entry.target : 0;
      return {
        nik: entry.nik, namaAm: entry.namaAm, divisi: entry.divisi,
        witelAm: entry.witel || null, levelAm: entry.levelAm || null,
        tahun: entry.tahun, bulan: entry.bulan,
        targetRevenue: entry.target, realRevenue: entry.real,
        targetReguler: entry.tReg, realReguler: entry.rReg,
        targetSustain: entry.tSustain, realSustain: entry.rSustain,
        targetScaling: entry.tScaling, realScaling: entry.rScaling,
        targetNgtma: entry.tNgtma, realNgtma: entry.rNgtma,
        achRate, achRateYtd: achRate, rankAch: 0,
        statusWarna: achRate >= 1 ? "hijau" : achRate >= 0.8 ? "oranye" : "merah",
        snapshotDate: date,
        komponenDetail: entry.customers.length > 0 ? JSON.stringify(entry.customers) : null,
      };
    }).filter(r => r.nik && r.namaAm);

    if (toInsert.length === 0) {
      return { sheetName: sheet.title, date, period, type: "performance", status: "error", message: `Tidak ada baris valid setelah aggregasi dari ${rows.length} baris mentah` };
    }

    const [imp] = await db.insert(dataImportsTable).values({
      type: "performance", rowsImported: toInsert.length, period,
      sourceUrl: `gsheets:${spreadsheetId}/${sheet.title}`, autoTelegramSent: false,
    }).returning();

    const BATCH = 200;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      await db.insert(performanceDataTable).values(
        toInsert.slice(i, i + BATCH).map(row => ({ ...row, importId: imp.id }))
      );
    }

    const existingAMs = await db.select().from(accountManagersTable);
    const existingNiks = new Set(existingAMs.map((a: any) => a.nik));
    const newAMs = toInsert.filter(r => !existingNiks.has(r.nik) && r.nik).map(r => ({
      nik: r.nik, nama: r.namaAm, slug: slugify(r.namaAm),
      divisi: r.divisi, witel: r.witelAm || "SURAMADU",
    }));
    for (let i = 0; i < newAMs.length; i += 50) {
      await db.insert(accountManagersTable).values(newAMs.slice(i, i + 50)).onConflictDoNothing();
    }

    return { sheetName: sheet.title, date, period, type: "performance", status: "imported", rowsImported: toInsert.length, message: `${toInsert.length} AM berhasil diimport dari ${rows.length} baris mentah` };
  } catch (err: any) {
    return { sheetName: sheet.title, date, period, type: "performance", status: "error", message: err?.message || String(err) };
  }
}

/** Main sync function: detect all matching sheets, skip existing, import new ones */
export async function runGSheetsSync(): Promise<SyncResult> {
  const syncedAt = new Date().toISOString();

  try {
    const [settings] = await db.select().from(appSettingsTable);
    if (!settings?.gSheetsSpreadsheetId || !settings?.gSheetsApiKey) {
      return { syncedAt, sheetsFound: 0, results: [], error: "Spreadsheet ID atau API Key belum dikonfigurasi" };
    }

    const spreadsheetId = settings.gSheetsSpreadsheetId;
    const apiKey = settings.gSheetsApiKey;

    const sheets = await listAllMatchingSheets(spreadsheetId, apiKey);
    if (sheets.length === 0) {
      return { syncedAt, sheetsFound: 0, results: [], error: "Tidak ada sheet ditemukan dengan pola yang dikenali (TREG3_SALES_FUNNEL_, TREG3_ACTIVITY_, PERFORMANSI_)" };
    }

    // Load existing imports for all 3 types for dedup check
    const existingImports = await db.select({ type: dataImportsTable.type, period: dataImportsTable.period, sourceUrl: dataImportsTable.sourceUrl })
      .from(dataImportsTable);

    const existingByType: Record<string, Set<string>> = { funnel: new Set(), activity: new Set(), performance: new Set() };
    for (const imp of existingImports) {
      if (imp.type && imp.period) existingByType[imp.type]?.add(imp.period);
    }

    const results: SyncSheetResult[] = [];

    for (const sheet of sheets) {
      const dateInfo = parseDateFromSheetName(sheet.title);
      if (!dateInfo) {
        results.push({ sheetName: sheet.title, date: "", period: "", type: sheet.detectedType, status: "error", message: "Format tanggal tidak dikenali di nama sheet" });
        continue;
      }

      const { date, period } = dateInfo;
      const type = sheet.detectedType;

      // Skip if same sheet name already imported
      const alreadyFromThisSheet = existingImports.some(i =>
        i.type === type && i.period === period && i.sourceUrl?.includes(sheet.title)
      );
      if (alreadyFromThisSheet) {
        results.push({ sheetName: sheet.title, date, period, type, status: "skipped", message: "Snapshot dengan nama sheet ini sudah ada, dilewati" });
        continue;
      }

      logger.info({ sheet: sheet.title, type, date }, "GSheets sync: importing sheet");

      let result: SyncSheetResult;
      if (type === "funnel") {
        result = await importFunnelSheet(spreadsheetId, sheet, apiKey, dateInfo);
      } else if (type === "activity") {
        result = await importActivitySheet(spreadsheetId, sheet, apiKey, dateInfo);
      } else {
        result = await importPerformanceSheet(spreadsheetId, sheet, apiKey, dateInfo);
      }

      if (result.status === "imported") existingByType[type]?.add(period);
      results.push(result);
    }

    await db.update(appSettingsTable)
      .set({ gSheetsLastSyncAt: new Date(), gSheetsLastSyncResult: JSON.stringify({ syncedAt, sheetsFound: sheets.length, results }) })
      .where(eq(appSettingsTable.id, settings.id));

    return { syncedAt, sheetsFound: sheets.length, results };
  } catch (err: any) {
    const error = err?.message || String(err);
    logger.error({ err }, "GSheets sync failed");
    try {
      const [settings] = await db.select().from(appSettingsTable);
      if (settings) {
        await db.update(appSettingsTable)
          .set({ gSheetsLastSyncAt: new Date(), gSheetsLastSyncResult: JSON.stringify({ syncedAt, sheetsFound: 0, results: [], error }) })
          .where(eq(appSettingsTable.id, settings.id));
      }
    } catch {}
    return { syncedAt, sheetsFound: 0, results: [], error };
  }
}

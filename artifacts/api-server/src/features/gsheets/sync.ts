import { db, appSettingsTable, dataImportsTable, salesFunnelTable, masterAmTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { cleanFunnelRows } from "../import/excel";
import type { ParsedRow } from "../import/excel";
import { logger } from "../../shared/logger";

export interface SheetInfo {
  title: string;
  sheetId: number;
}

export interface SyncSheetResult {
  sheetName: string;
  date: string;
  period: string;
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

/** Extract YYYY-MM-DD and YYYY-MM from sheet name like TREG3_SALES_FUNNEL_20260326 */
function parseDateFromSheetName(name: string): { date: string; period: string } | null {
  const match = name.match(/(\d{8})$/);
  if (!match) return null;
  const raw = match[1];
  const year = raw.slice(0, 4);
  const month = raw.slice(4, 6);
  const day = raw.slice(6, 8);
  const y = parseInt(year), mo = parseInt(month), d = parseInt(day);
  if (y < 2020 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { date: `${year}-${month}-${day}`, period: `${year}-${month}` };
}

/** List all sheets in a Google Spreadsheet that match the funnel pattern */
export async function listFunnelSheets(
  spreadsheetId: string,
  apiKey: string,
  pattern: string,
): Promise<SheetInfo[]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?key=${apiKey}&fields=sheets.properties(sheetId,title)`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const err = await resp.text().catch(() => "");
    throw new Error(`Google Sheets API error ${resp.status}: ${err.slice(0, 200)}`);
  }
  const data = await resp.json() as { sheets: { properties: { sheetId: number; title: string } }[] };
  const sheets = data.sheets || [];
  return sheets
    .map(s => ({ title: s.properties.title, sheetId: s.properties.sheetId }))
    .filter(s => s.title.includes(pattern));
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

  // Detect if row 0 is a title (only 1 non-empty cell) — skip it
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

/** Import a single funnel sheet into the DB as a new snapshot */
async function importFunnelSheet(
  spreadsheetId: string,
  sheet: SheetInfo,
  apiKey: string,
  dateInfo: { date: string; period: string },
): Promise<SyncSheetResult> {
  const { date, period } = dateInfo;
  try {
    const rows = await fetchSheetData(spreadsheetId, sheet.title, apiKey);
    if (rows.length === 0) {
      return { sheetName: sheet.title, date, period, status: "error", message: "Sheet kosong atau tidak ada data" };
    }

    const cleaned = cleanFunnelRows(rows);

    // Filter to active AMs only
    const activeAms = await db.select({ nik: masterAmTable.nik }).from(masterAmTable).where(eq(masterAmTable.aktif, true));
    const activeNikSet = new Set(activeAms.map(a => a.nik));
    const activeOnly = cleaned.filter(r => r.nikAm && activeNikSet.has(r.nikAm));

    if (activeOnly.length === 0) {
      return {
        sheetName: sheet.title, date, period, status: "error",
        message: `Tidak ada baris valid setelah cleaning dari ${rows.length} baris mentah`,
      };
    }

    // Create import record
    const [imp] = await db.insert(dataImportsTable).values({
      type: "funnel",
      rowsImported: activeOnly.length,
      period,
      sourceUrl: `gsheets:${spreadsheetId}/${sheet.title}`,
      autoTelegramSent: false,
    }).returning();

    // Insert funnel rows in batches
    const BATCH = 200;
    for (let i = 0; i < activeOnly.length; i += BATCH) {
      const batch = activeOnly.slice(i, i + BATCH).map(row => ({
        ...row,
        snapshotDate: date,
        importId: imp.id,
      }));
      await db.insert(salesFunnelTable).values(batch);
    }

    // Back-fill names from master_am
    const allMasterAms = await db.select().from(masterAmTable);
    const masterNameByNik = new Map(allMasterAms.map(m => [m.nik, m.nama]));
    const nullNameRows = activeOnly.filter(r => !r.namaAm && r.nikAm && masterNameByNik.has(r.nikAm));
    for (const row of nullNameRows) {
      await db.update(salesFunnelTable)
        .set({ namaAm: masterNameByNik.get(row.nikAm) })
        .where(and(eq(salesFunnelTable.importId, imp.id), eq(salesFunnelTable.nikAm, row.nikAm)));
    }

    return {
      sheetName: sheet.title, date, period,
      status: "imported",
      rowsImported: activeOnly.length,
      message: `${activeOnly.length} baris berhasil diimport dari ${rows.length} baris mentah`,
    };
  } catch (err: any) {
    return { sheetName: sheet.title, date, period, status: "error", message: err?.message || String(err) };
  }
}

/** Main sync function: check all matching sheets, skip existing snapshots, import new ones */
export async function runGSheetsSync(): Promise<SyncResult> {
  const syncedAt = new Date().toISOString();

  try {
    const [settings] = await db.select().from(appSettingsTable);
    if (!settings?.gSheetsSpreadsheetId || !settings?.gSheetsApiKey) {
      return { syncedAt, sheetsFound: 0, results: [], error: "Spreadsheet ID atau API Key belum dikonfigurasi" };
    }

    const spreadsheetId = settings.gSheetsSpreadsheetId;
    const apiKey = settings.gSheetsApiKey;
    const pattern = settings.gSheetsFunnelPattern || "TREG3_SALES_FUNNEL_";

    // List matching sheets
    const sheets = await listFunnelSheets(spreadsheetId, apiKey, pattern);
    if (sheets.length === 0) {
      return { syncedAt, sheetsFound: 0, results: [], error: `Tidak ada sheet ditemukan dengan pola "${pattern}"` };
    }

    // Get existing funnel snapshot periods
    const existingImports = await db.select({ period: dataImportsTable.period, sourceUrl: dataImportsTable.sourceUrl })
      .from(dataImportsTable)
      .where(eq(dataImportsTable.type, "funnel"));
    const existingPeriods = new Set(existingImports.map(i => i.period));

    // Build the results
    const results: SyncSheetResult[] = [];

    for (const sheet of sheets) {
      const dateInfo = parseDateFromSheetName(sheet.title);
      if (!dateInfo) {
        results.push({ sheetName: sheet.title, date: "", period: "", status: "error", message: "Format tanggal tidak dikenali di nama sheet" });
        continue;
      }

      // Check if snapshot for this period already exists (from any source)
      if (existingPeriods.has(dateInfo.period)) {
        // Check if it's specifically from this sheet name
        const fromThisSheet = existingImports.some(i =>
          i.period === dateInfo.period &&
          i.sourceUrl?.includes(sheet.title)
        );
        if (fromThisSheet) {
          results.push({ sheetName: sheet.title, date: dateInfo.date, period: dateInfo.period, status: "skipped", message: "Snapshot dengan nama sheet ini sudah ada, dilewati" });
          continue;
        }
        // Different source for same period — still import (it will be a new snapshot alongside the existing one)
      }

      logger.info({ sheet: sheet.title, date: dateInfo.date }, "GSheets sync: importing sheet");
      const result = await importFunnelSheet(spreadsheetId, sheet, apiKey, dateInfo);
      if (result.status === "imported") existingPeriods.add(dateInfo.period);
      results.push(result);
    }

    // Save sync result to settings
    await db.update(appSettingsTable)
      .set({ gSheetsLastSyncAt: new Date(), gSheetsLastSyncResult: JSON.stringify({ syncedAt, sheetsFound: sheets.length, results }) })
      .where(eq(appSettingsTable.id, settings.id));

    return { syncedAt, sheetsFound: sheets.length, results };
  } catch (err: any) {
    const error = err?.message || String(err);
    logger.error({ err }, "GSheets sync failed");

    // Try to save error to settings
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

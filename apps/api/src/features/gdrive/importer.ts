/**
 * Shared import logic dipakai oleh routes.ts (manual/Drive-click)
 * dan scheduler.ts (otomatis).
 * Tidak ada dependency ke Express di sini.
 */
import { db, appSettingsTable, dataImportsTable, accountManagersTable, performanceDataTable, salesFunnelTable, salesActivityTable, masterCustomerTable } from "@workspace/db";
import { and, sql, eq } from "drizzle-orm";
import {
  parseExcelBuffer, parseRaw2DArray, getWorkbookSheetNames,
  detectPeriod, extractSnapshotDateFromUrl,
  cleanFunnelRows, cleanActivityRows, parseIndonesianNumber, slugify,
} from "../import/excel";
import type { ParsedRow } from "../import/excel";

const GOOGLE_SHEET_MIME = "application/vnd.google-apps.spreadsheet";

/**
 * Pilih sheet terbaik untuk import performance — prioritas:
 * 1. Nama persis "RAW_AM_DATA" (case-insensitive)
 * 2. Nama mengandung "RAW" dan ("AM" atau "DATA")
 * 3. Nama mengandung "RAW"
 * 4. Nama mengandung "DATA"
 * 5. Sheet pertama (fallback)
 */
function findBestPerformanceSheet(sheetNames: string[]): string {
  if (sheetNames.length === 0) return "Sheet1";
  const up = (s: string) => s.toUpperCase().trim();
  const exact = sheetNames.find(s => up(s) === "RAW_AM_DATA" || up(s).replace(/[^A-Z0-9]/g, "") === "RAWAMDATA");
  if (exact) return exact;
  const rawAm = sheetNames.find(s => up(s).includes("RAW") && (up(s).includes("AM") || up(s).includes("DATA")));
  if (rawAm) return rawAm;
  const raw = sheetNames.find(s => up(s).includes("RAW"));
  if (raw) return raw;
  const data = sheetNames.find(s => up(s).includes("DATA") || up(s).includes("PERFORMANSI") || up(s).includes("PERFORMA"));
  if (data) return data;
  return sheetNames[0];
}

export async function downloadDriveFileAsRows(
  fileId: string,
  mimeType: string,
  apiKey: string,
  type?: string,
  preferredSheet?: string,
): Promise<ParsedRow[]> {
  if (mimeType === GOOGLE_SHEET_MIME) {
    return downloadGoogleSheetRows(fileId, apiKey, type, preferredSheet);
  }
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gagal download file dari Drive: ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());

  // Auto-deteksi sheet terbaik untuk performance jika file multi-sheet
  let resolvedSheet = preferredSheet;
  if (!resolvedSheet) {
    const sheetNames = getWorkbookSheetNames(buf);
    if (sheetNames.length > 1 && type === "performance") {
      resolvedSheet = findBestPerformanceSheet(sheetNames);
    }
  }
  return parseExcelBuffer(buf, resolvedSheet);
}

async function downloadGoogleSheetRows(
  spreadsheetId: string,
  apiKey: string,
  type?: string,
  preferredSheet?: string,
): Promise<ParsedRow[]> {
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?key=${apiKey}&fields=sheets.properties`
  );
  if (!metaRes.ok) {
    const body = await metaRes.text().catch(() => "");
    throw new Error(`Gagal ambil metadata Sheets: ${metaRes.status}${body ? ` — ${body.slice(0, 200)}` : ""}`);
  }
  const meta: any = await metaRes.json();
  const allTitles: string[] = (meta.sheets ?? []).map((s: any) => s?.properties?.title ?? "").filter(Boolean);

  // Pilih sheet: preferredSheet → auto-detect untuk performance → sheet pertama
  let sheetTitle: string;
  if (preferredSheet && allTitles.includes(preferredSheet)) {
    sheetTitle = preferredSheet;
  } else if (type === "performance" && allTitles.length > 1) {
    sheetTitle = findBestPerformanceSheet(allTitles);
  } else {
    sheetTitle = allTitles[0] ?? "Sheet1";
  }

  const valRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetTitle)}?key=${apiKey}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`
  );
  if (!valRes.ok) {
    const body = await valRes.text().catch(() => "");
    throw new Error(`Gagal baca nilai Sheets: ${valRes.status}${body ? ` — ${body.slice(0, 200)}` : ""}`);
  }
  const valData: any = await valRes.json();
  return parseRaw2DArray(valData.values ?? []);
}

/** Safestr guard */
function safeStr(val: any): string | null {
  if (val === null || val === undefined || val === "") return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val);
}

async function getAmSlugMap() {
  const ams = await db.select({ nik: accountManagersTable.nik, slug: accountManagersTable.slug, nama: accountManagersTable.nama }).from(accountManagersTable);
  const map: Record<string, string> = {};
  for (const am of ams) { if (am.nik) map[am.nik] = am.slug || slugify(am.nama); }
  return map;
}

export async function importPerformance(rows: ParsedRow[], sourceUrl: string, period: string | null, snapshotDate: string, _fileName: string) {
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
    const amMap = new Map<string, AmEntry>();
    for (const r of rows) {
      const nik = String(r.NIK || r.nik || "").trim();
      const namaAm = String(r.NAMA_AM || r.nama_am || "").trim();
      const divisiRaw = String(r.DIVISI_CC || r.divisi_cc || r.DIVISI_AM || r.divisi || "").trim();
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
      const tahun = parseInt(periodeStr.slice(0, 4), 10);
      const bulan = parseInt(periodeStr.slice(4, 6), 10);
      const pelanggan = String(r.STANDARD_NAME || r.NAMA_PELANGGAN || r.PELANGGAN || r.pelanggan || r.nama_account || "").trim();
      const nip = String(r.NIP_NAS || r.nip_nas || r.NIP || "").trim();
      const proporsi = (parseFloat(String(r.PROPORSI ?? r.proporsi ?? 0)) || 0) * 100;

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
        snapshotDate,
        komponenDetail: entry.customers.length > 0 ? JSON.stringify(entry.customers) : null,
      };
    }).filter(r => r.nik && r.namaAm);
  } else {
    const [y, m] = (period || new Date().toISOString().slice(0, 7)).split("-").map(Number);
    toInsert = rows.filter((r: any) => {
      const div = String(r.DIVISI_AM || r.divisi || "").trim().toUpperCase();
      return div !== "DGS";
    }).map((r: any) => {
      const achRate = parseFloat(String(r["Ach Rate Dinamis MTD"] || r.ach_rate || 0)) || 0;
      return {
        nik: String(r.NIK || r.nik || ""), namaAm: String(r.NAMA_AM || r.nama_am || "").trim(),
        divisi: String(r.DIVISI_AM || r.divisi || "").trim(), witelAm: null, levelAm: null,
        tahun: y, bulan: m,
        targetRevenue: parseIndonesianNumber(r["Target Revenue Dinamis"] || r.target_revenue),
        realRevenue: parseIndonesianNumber(r["Real Revenue Dinamis"] || r.real_revenue),
        achRate, achRateYtd: achRate, rankAch: 0,
        statusWarna: String(r["AM Hijau"] === "1" ? "hijau" : r["AM Oranye"] === "1" ? "oranye" : "merah"),
        snapshotDate,
      };
    }).filter((r: any) => r.nik && r.namaAm);
  }

  if (toInsert.length === 0) return { imported: 0, importId: null, period };

  const firstRow = toInsert[0];
  const resolvedPeriod = period ||
    (isRawFormat && firstRow.tahun && firstRow.bulan
      ? `${firstRow.tahun}-${String(firstRow.bulan).padStart(2, "0")}`
      : new Date().toISOString().slice(0, 7));

  const [importRecord] = await db.insert(dataImportsTable).values({
    type: "performance", sourceUrl, period: resolvedPeriod,
    rowsImported: toInsert.length, snapshotDate,
  }).returning();

  for (let i = 0; i < toInsert.length; i += 200) {
    await db.insert(performanceDataTable)
      .values(toInsert.slice(i, i + 200).map(row => ({ ...row, importId: importRecord.id })))
      .onConflictDoNothing();
  }

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

export async function importFunnel(rows: ParsedRow[], sourceUrl: string, period: string | null, snapshotDate: string, _fileName: string) {
  const cleaned = cleanFunnelRows(rows, { preferPembuat: true, skipIsReportFilter: true });
  const allAms = await db.select({ nik: accountManagersTable.nik, nama: accountManagersTable.nama, divisi: accountManagersTable.divisi }).from(accountManagersTable);

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
      monthSubs: typeof row.monthSubs === "number" && row.monthSubs !== 0 ? row.monthSubs : (row.monthSubs != null && row.monthSubs !== 0 ? (parseInt(String(row.monthSubs), 10) || null) : null),
      namaAm: safeStr(am?.nama) || safeStr(row.namaAm) || "",
      nikAm: safeStr(am?.nik) || safeStr(row.nikAm) || safeStr(row.nik),
      reportDate: safeStr(row.reportDate),
      createdDate: safeStr(row.createdDate),
      snapshotDate,
    };
  }).filter((r: any) => r.lopid);

  const existingLopids = toInsert.map(r => r.lopid);
  if (existingLopids.length > 0) {
    for (let i = 0; i < existingLopids.length; i += 200) {
      const batch = existingLopids.slice(i, i + 200);
      await db.delete(salesFunnelTable).where(and(
        eq(salesFunnelTable.snapshotDate, snapshotDate),
        sql`lopid = ANY(ARRAY[${sql.join(batch.map(id => sql`${id}`), sql`, `)}])`
      ));
    }
  }

  const [importRecord] = await db.insert(dataImportsTable).values({
    type: "funnel", sourceUrl, period: period || new Date().toISOString().slice(0, 7),
    rowsImported: toInsert.length, snapshotDate,
  }).returning();

  for (let i = 0; i < toInsert.length; i += 200) {
    await db.insert(salesFunnelTable).values(toInsert.slice(i, i + 200).map(row => ({ ...row, importId: importRecord.id }))).onConflictDoNothing();
  }

  const uniqueCustomers = [...new Set(toInsert.map(r => r.pelanggan).filter(p => p && p !== "–"))];
  for (let i = 0; i < uniqueCustomers.length; i += 100) {
    await db.insert(masterCustomerTable)
      .values(uniqueCustomers.slice(i, i + 100).map(nama => ({ nama, witel: "SURAMADU" })))
      .onConflictDoNothing();
  }

  return { imported: toInsert.length, importId: importRecord.id, period: period || new Date().toISOString().slice(0, 7) };
}

export async function importActivity(rows: ParsedRow[], sourceUrl: string, period: string | null, snapshotDate: string, _fileName: string) {
  const { salesActivityTable } = await import("@workspace/db");
  const cleaned = cleanActivityRows(rows);

  const [importRecord] = await db.insert(dataImportsTable).values({
    type: "activity", sourceUrl, period: period || new Date().toISOString().slice(0, 7),
    rowsImported: cleaned.length, snapshotDate,
  }).returning();

  for (let i = 0; i < cleaned.length; i += 200) {
    await db.insert(salesActivityTable).values(cleaned.slice(i, i + 200).map(row => ({
      ...row, snapshotDate, importId: importRecord.id,
    }))).onConflictDoNothing();
  }
  return { imported: cleaned.length, importId: importRecord.id, period: period || new Date().toISOString().slice(0, 7) };
}

/** Top-level: download + import for a given type+fileId — used by scheduler */
export async function runDriveImport(
  type: "performance" | "funnel" | "activity" | "target",
  fileId: string,
  mimeType: string,
  fileName: string,
  apiKey: string,
  snapshotDate: string,
  preferredSheet?: string,
) {
  const rows = await downloadDriveFileAsRows(fileId, mimeType, apiKey, type, preferredSheet);
  if (rows.length === 0) throw new Error("File kosong atau tidak dapat dibaca");

  const sourceUrl = `https://drive.google.com/file/d/${fileId}`;
  const period = detectPeriod(rows, fileName);

  if (type === "performance") return importPerformance(rows, sourceUrl, period, snapshotDate, fileName);
  if (type === "funnel" || type === "target") return importFunnel(rows, sourceUrl, period, snapshotDate, fileName);
  if (type === "activity") return importActivity(rows, sourceUrl, period, snapshotDate, fileName);
  throw new Error(`Tipe tidak dikenali: ${type}`);
}

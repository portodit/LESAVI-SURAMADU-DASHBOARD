import * as XLSX from "xlsx";

export interface ParsedRow {
  [key: string]: string | number | null;
}

export async function parseExcelFromUrl(url: string, sheetName?: string): Promise<ParsedRow[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Gagal mengunduh file Excel: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return parseExcelBuffer(buffer, sheetName);
}

export function parseExcelFromBase64(base64: string, sheetName?: string): ParsedRow[] {
  const buffer = Buffer.from(base64, "base64");
  return parseExcelBuffer(buffer, sheetName);
}

/** Baca hanya nama sheet dari buffer Excel tanpa parse data (lebih cepat) */
export function getWorkbookSheetNames(buffer: Buffer): string[] {
  const workbook = XLSX.read(buffer, { type: "buffer", bookSheets: true });
  return workbook.SheetNames;
}

export function parseExcelBuffer(buffer: Buffer, sheetName?: string): ParsedRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: false });
  const resolvedSheet = sheetName && workbook.SheetNames.includes(sheetName)
    ? sheetName
    : workbook.SheetNames[0];
  const worksheet = workbook.Sheets[resolvedSheet];

  // Smart parsing: detect title row (row 0 has only 1 non-null cell, rest null)
  const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null, raw: false }) as any[][];
  if (rawRows.length < 2) return [];

  const row0 = rawRows[0] as any[];
  const row0NonNull = row0.filter(v => v !== null && v !== "").length;

  // If row 0 looks like a title (only first cell filled), skip it and use row 1 as header
  if (row0NonNull === 1 && rawRows.length > 2) {
    const headers = rawRows[1] as string[];
    const dataRows = rawRows.slice(2);
    return dataRows
      .filter(row => row.some(v => v !== null && v !== ""))
      .map(row => {
        const obj: ParsedRow = {};
        headers.forEach((h, i) => {
          if (h) obj[h] = row[i] ?? null;
        });
        return obj;
      });
  }

  // Normal parsing (first row is header)
  return XLSX.utils.sheet_to_json(worksheet, { defval: null, raw: false }) as ParsedRow[];
}

/**
 * Convert a 2-D array (e.g. from Google Sheets API) directly to ParsedRow[].
 * Same smart-title-row detection as parseExcelBuffer — but no XLSX library involved,
 * so memory usage is ~10x lower for large Google Sheets imports.
 */
export function parseRaw2DArray(rawRows: any[][]): ParsedRow[] {
  if (rawRows.length < 2) return [];
  const row0 = rawRows[0] as any[];
  const row0NonNull = row0.filter(v => v !== null && v !== "" && v !== undefined).length;

  let headers: string[];
  let dataRows: any[][];

  if (row0NonNull === 1 && rawRows.length > 2) {
    // First row is a title row — use row 1 as header
    headers = rawRows[1] as string[];
    dataRows = rawRows.slice(2);
  } else {
    // First row is the header
    headers = rawRows[0] as string[];
    dataRows = rawRows.slice(1);
  }

  return dataRows
    .filter(row => row.some(v => v !== null && v !== "" && v !== undefined))
    .map(row => {
      const obj: ParsedRow = {};
      headers.forEach((h, i) => {
        if (h != null && h !== "") obj[String(h)] = row[i] ?? null;
      });
      return obj;
    });
}

/** Parse comma-formatted Indonesian number string → number */
export function parseIndonesianNumber(val: any): number {
  if (val === null || val === undefined || val === "") return 0;
  const s = String(val).replace(/,/g, "").replace(/\./g, "");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

export function detectPeriodFromUrl(url: string): string | null {
  // Extract YYYYMMDD from filename e.g. TREG3_ACTIVITY_20260316.xlsx or TREG3_ACTIVITY_20260316 (no ext)
  const match = url.match(/[_-](\d{8})(?:[._?&\s]|$)/);
  if (match) {
    const raw = match[1];
    const year = raw.slice(0, 4);
    const month = raw.slice(4, 6);
    return `${year}-${month}`;
  }
  return null;
}

export function extractSnapshotDateFromUrl(url: string): string | null {
  // Returns YYYY-MM-DD from YYYYMMDD in filename (handles with or without extension)
  const match = url.match(/[_-](\d{8})(?:[._?&\s]|$)/);
  if (match) {
    const raw = match[1];
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  return null;
}

export function detectPeriod(rows: ParsedRow[], url?: string): string {
  if (url) {
    const fromUrl = detectPeriodFromUrl(url);
    if (fromUrl) return fromUrl;
  }
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

// ─── Funnel Data Cleaning (mirip Power Query di Power BI) ─────────────────────

/** Convert Excel serial date number or date string to "YYYY-MM-DD" */
function parseDate(val: any): string {
  if (!val) return "";
  // If it's already a Date object
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const s = String(val).trim();
  // Excel serial date number
  const num = parseFloat(s);
  if (!isNaN(num) && num > 30000 && num < 100000) {
    const jsDate = XLSX.SSF.parse_date_code(num);
    if (jsDate) {
      const d = new Date(jsDate.y, jsDate.m - 1, jsDate.d);
      return d.toISOString().slice(0, 10);
    }
  }
  // dd/MM/yyyy format (from GSheets: "07/03/2026")
  const ddmmyyyy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    const d = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  // YYYY-MM-DD or other ISO-like formats
  const isoDate = new Date(s);
  if (!isNaN(isoDate.getTime())) return isoDate.toISOString().slice(0, 10);
  return s;
}

function clean(val: any): string {
  if (val == null) return "";
  return String(val).trim();
}

function cleanUpper(val: any): string {
  return clean(val).toUpperCase();
}

function toIntSafe(val: any): number | null {
  const n = parseInt(String(val ?? "").replace(/\D/g, ""), 10);
  return isNaN(n) ? null : n;
}

function getReportYear(row: any): number {
  const dateStr = parseDate(row.report_date);
  if (!dateStr) return 0;
  return parseInt(dateStr.slice(0, 4), 10);
}

export interface CleanedFunnelRow {
  lopid: string;
  judulProyek: string;
  pelanggan: string;
  nilaiProyek: number;
  divisi: string;
  segmen: string;
  witel: string;
  statusF: string;
  proses: string;
  statusProyek: string;
  kategoriKontrak: string;
  estimateBulan: string;
  monthSubs: number | null;
  namaAm: string;
  nikAm: string;
  reportDate: string;
  createdDate: string;
}

export function cleanFunnelRows(rows: ParsedRow[], opts?: { skipDivisiFilter?: boolean; strictIsReport?: boolean; skipIsReportFilter?: boolean; skipWitelFilter?: boolean; preferPembuat?: boolean; pembuatOnly?: boolean }): CleanedFunnelRow[] {
  const passed: CleanedFunnelRow[] = [];

  for (const r of rows) {
    // ── STEP 1: Filter witel = SURAMADU
    // skipWitelFilter: include all LOPs for the AM regardless of customer witel
    // (AMs may manage projects in other witel areas — e.g. NI MADE handles PLN NPS in Maluku)
    const witel = cleanUpper(r.witel);
    if (!opts?.skipWitelFilter && !witel.includes("SURAMADU")) continue;

    // ── STEP 2: Filter divisi = DPS / DSS / DGS
    // NOTE: In GSheets nationwide funnel, divisi = business segment (RSMES etc), NOT AM divisi.
    // Skip this filter when importing from GSheets — rely on activeNikSet instead.
    // DGS diikutkan karena ada AM yang handle multi-divisi (DPS+DSS, DGS+DSS, dll).
    const divisi = clean(r.divisi).toUpperCase();
    const VALID_DIVISI = new Set(["DPS", "DSS", "DGS"]);
    if (!opts?.skipDivisiFilter && !VALID_DIVISI.has(divisi)) continue;

    // ── STEP 3: NIK AM extraction
    // pembuatOnly: use ONLY nik_pembuat_lop — discard non-numeric (Power BI: Int64 + RemoveRowsWithErrors)
    // preferPembuat: nik_pembuat_lop first, nik_handling[0] as fallback
    // default: nik_handling[0] first, nik_pembuat_lop as fallback (Excel/Power BI detail export)
    let nikRaw: number | null;
    if (opts?.pembuatOnly) {
      nikRaw = toIntSafe(r.nik_pembuat_lop); // ONLY pembuat — non-numeric = skip row
    } else {
      const nikHandlingFirst = String(r.nik_handling ?? "").split(",")[0].trim();
      nikRaw = opts?.preferPembuat
        ? (toIntSafe(r.nik_pembuat_lop) ?? toIntSafe(nikHandlingFirst))
        : (toIntSafe(nikHandlingFirst) ?? toIntSafe(r.nik_pembuat_lop));
    }
    if (nikRaw === null) continue; // skip rows with non-numeric NIK

    // Reni (850099) → Havea (870022): Power BI applies this only for report_date.Year >= 2026
    // When pembuatOnly=true we honour the conditional; otherwise map unconditionally for safety
    const reportDateForNik = parseDate(r.report_date);
    const reportYearForNik = reportDateForNik ? parseInt(reportDateForNik.slice(0, 4), 10) : 0;
    let nikAm = String(nikRaw);
    if (nikAm === "850099" && (!opts?.pembuatOnly || reportYearForNik >= 2026)) nikAm = "870022";

    // ── STEP 4: Reject garbage NIKs (too short or clearly invalid)
    if (nikAm.length < 4 || Number(nikAm) > 9999999) continue;

    // ── STEP 5: Filter is_report = 'Y'
    // skipIsReportFilter: skip filter entirely (Power BI behaviour — show all LOPs regardless of is_report)
    // strictIsReport: reject rows where is_report is null/empty (treat as not-Y)
    if (!opts?.skipIsReportFilter) {
      const isReportRaw = r.is_report ?? r.IS_REPORT ?? r.isReport ?? null;
      if (opts?.strictIsReport) {
        const isReportStr = isReportRaw !== null && isReportRaw !== undefined && isReportRaw !== ""
          ? String(isReportRaw).trim().toUpperCase() : "";
        if (isReportStr !== "Y" && isReportStr !== "1" && isReportStr !== "YES" && isReportStr !== "TRUE") continue;
      } else if (isReportRaw !== null && isReportRaw !== undefined && isReportRaw !== "") {
        const isReportStr = String(isReportRaw).trim().toUpperCase();
        if (isReportStr !== "Y" && isReportStr !== "1" && isReportStr !== "YES" && isReportStr !== "TRUE") continue;
      }
    }

    // ── STEP 6: Fix AM name — RENI WULANSARI → HAVEA PERTIWI (unconditional)
    let namaAm = cleanUpper(r.nama_pembuat_lop);
    // Reni→Havea for nama: same conditional as NIK (pembuatOnly: year>=2026 only; else unconditional)
    if (namaAm === "RENI WULANSARI" && (!opts?.pembuatOnly || reportYearForNik >= 2026)) namaAm = "HAVEA PERTIWI";

    const lopid = clean(r.lopid);
    if (!lopid) continue; // skip rows without lopid

    const reportDate = parseDate(r.report_date);

    passed.push({
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
      monthSubs: r.month_subs != null
        ? (parseInt(String(r.month_subs), 10) || null)
        : r["Month Subs"] != null
          ? (parseInt(String(r["Month Subs"]), 10) || null)
          : r.rencana_durasi_kontrak != null
            ? (parseInt(String(r.rencana_durasi_kontrak), 10) || null)
            : r["Rencana Durasi Kontrak"] != null
              ? (parseInt(String(r["Rencana Durasi Kontrak"]), 10) || null)
              : r["rencana durasi kontrak"] != null
                ? (parseInt(String(r["rencana durasi kontrak"]), 10) || null)
                : null,
      namaAm,
      nikAm,
      reportDate,
      createdDate: parseDate(r.created_date) || clean(r.created_date),
    });
  }

  // ── STEP 7: Deduplicate by lopid — keep only the row with the LATEST report_date
  // MYTENS export files may contain the same LOP across multiple monthly snapshots
  const deduped = new Map<string, CleanedFunnelRow>();
  for (const row of passed) {
    const existing = deduped.get(row.lopid);
    if (!existing || row.reportDate > existing.reportDate) {
      deduped.set(row.lopid, row);
    }
  }

  return Array.from(deduped.values());
}

// ─── Activity Data Cleaning ────────────────────────────────────────────────────

/**
 * Parse a datetime value from Excel/GSheets, preserving the full datetime string
 * (tidak dipotong jadi date-only).
 *
 * Power BI menyimpan activity_end_date, activity_start_date, dan createdat sebagai
 * `datetime` (bukan `date`). Kita harus simpan lengkap termasuk jam/menit/detik
 * agar:
 *   1. Filter bulan di API tetap benar (`startsWith("YYYY-MM")` bekerja pada datetime string)
 *   2. Unique constraint `(nik, createdat_activity)` bisa membedakan dua aktivitas
 *      yang terjadi pada hari yang sama
 */
function parseRawDateTimeStr(val: any): string {
  if (!val) return "";
  // Date object dari XLSX cellDates:true — convert ke "YYYY-MM-DD HH:mm:ss" dalam waktu lokal server
  if (val instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${val.getFullYear()}-${pad(val.getMonth() + 1)}-${pad(val.getDate())} ${pad(val.getHours())}:${pad(val.getMinutes())}:${pad(val.getSeconds())}`;
  }
  const s = String(val).trim();
  if (!s) return "";
  // Jika sudah dalam format datetime ISO/SQL, kembalikan apa adanya (ganti T dengan spasi)
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)) return s.replace("T", " ").slice(0, 19);
  // Format US: "M/D/YYYY H:MM:SS AM/PM" (dari XLSX raw:false)
  const usMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2}):?(\d{2})?\s*(AM|PM)?/i);
  if (usMatch) {
    const [, mm, dd, yyyy, hRaw, min, sec = "00", ampm] = usMatch;
    let h = parseInt(hRaw, 10);
    if (ampm?.toUpperCase() === "PM" && h < 12) h += 12;
    if (ampm?.toUpperCase() === "AM" && h === 12) h = 0;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${yyyy}-${pad(parseInt(mm))}-${pad(parseInt(dd))} ${pad(h)}:${min}:${sec.padStart(2, "0")}`;
  }
  // Fallback ke parseDate (tanpa jam) kalau tidak bisa parse datetime
  return parseDate(val);
}

export interface CleanedActivityRow {
  nik: string;
  fullname: string;
  divisi: string;
  segmen: string;
  regional: string;
  witel: string;
  nipnas: string;
  caName: string;
  activityType: string;
  label: string;
  lopid: string;
  createdatActivity: string;
  activityStartDate: string;
  activityEndDate: string;
  picName: string;
  picJobtitle: string;
  picRole: string;
  picPhone: string;
  activityNotes: string;
}

/**
 * Prosedur cleaning data Sales Activity — mengikuti langkah Power Query Power BI:
 *
 * 1. Filter witel = SURAMADU (contains, case-insensitive)
 * 2. Filter divisi = "DPS" atau "DSS"
 * 3. Validasi NIK numerik (Int64 — baris dengan NIK non-numerik di-skip)
 * 4. Simpan datetime penuh (termasuk jam) untuk createdat, start_date, end_date
 *
 * TIDAK ada filter fullname — Power BI tidak men-drop baris dengan fullname kosong.
 * TIDAK ada dedup — dedup dilakukan di DB layer via unique constraint (nik, createdat_activity).
 */
export function cleanActivityRows(rows: ParsedRow[]): CleanedActivityRow[] {
  return rows
    .map(r => {
      // ── STEP 1: Filter witel = SURAMADU AND divisi = DPS/DSS/DGS
      // DGS diikutkan karena ada AM yang handle multi-divisi (DGS+DSS, DPS+DSS, dll).
      const witel = cleanUpper(r.witel);
      const divisi = clean(r.divisi).toUpperCase();

      if (!witel.includes("SURAMADU")) return null;
      if (divisi !== "DPS" && divisi !== "DSS" && divisi !== "DGS") return null;

      // ── STEP 2: Validasi NIK numerik
      // Power BI menggunakan Int64.Type untuk kolom nik — baris dengan NIK tidak-numerik
      // menghasilkan error dan di-drop oleh RemoveRowsWithErrors (jika ada) atau diabaikan.
      const nikRaw = toIntSafe(r.nik);
      if (nikRaw === null) return null;

      // ── STEP 3: fullname boleh kosong (tidak di-filter Power BI)
      const fullname = clean(r.fullname);

      return {
        nik: String(nikRaw),
        fullname,
        divisi,
        segmen: clean(r.segmen),
        regional: clean(r.regional),
        witel,
        nipnas: clean(r.nipnas),
        caName: cleanUpper(r.ca_name) || "",
        activityType: clean(r.activity_type),
        label: clean(r.label),
        lopid: clean(r.lopid),
        // ── Simpan datetime penuh (jam:menit:detik), bukan date-only
        createdatActivity: parseRawDateTimeStr(r.createdat),
        activityStartDate: parseRawDateTimeStr(r.activity_start_date),
        activityEndDate: parseRawDateTimeStr(r.activity_end_date),
        picName: clean(r.pic_name),
        picJobtitle: clean(r.pic_jobtitle),
        picRole: clean(r.pic_role),
        picPhone: clean(r.pic_phone),
        activityNotes: clean(r.activity_notes),
      } as CleanedActivityRow;
    })
    .filter((r): r is CleanedActivityRow => r !== null);
}

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

/** Parse comma-formatted Indonesian number string → number */
export function parseIndonesianNumber(val: any): number {
  if (val === null || val === undefined || val === "") return 0;
  const s = String(val).replace(/,/g, "").replace(/\./g, "");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

export function detectPeriodFromUrl(url: string): string | null {
  // Extract YYYYMMDD from filename e.g. TREG3_ACTIVITY_20260316.xlsx
  const match = url.match(/[_-](\d{8})[._?&]/);
  if (match) {
    const raw = match[1];
    const year = raw.slice(0, 4);
    const month = raw.slice(4, 6);
    return `${year}-${month}`;
  }
  return null;
}

export function extractSnapshotDateFromUrl(url: string): string | null {
  // Returns YYYY-MM-DD from YYYYMMDD in filename
  const match = url.match(/[_-](\d{8})[._?&]/);
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
  namaAm: string;
  nikAm: string;
  reportDate: string;
  createdDate: string;
}

export function cleanFunnelRows(rows: ParsedRow[], opts?: { skipDivisiFilter?: boolean }): CleanedFunnelRow[] {
  const passed: CleanedFunnelRow[] = [];

  for (const r of rows) {
    // ── STEP 1: Filter witel = SURAMADU
    const witel = cleanUpper(r.witel);
    if (!witel.includes("SURAMADU")) continue;

    // ── STEP 2: Filter divisi = DPS or DSS
    // NOTE: In GSheets nationwide funnel, divisi = business segment (RSMES etc), NOT AM divisi.
    // Skip this filter when importing from GSheets — rely on activeNikSet instead.
    const divisi = clean(r.divisi).toUpperCase();
    if (!opts?.skipDivisiFilter && divisi !== "DPS" && divisi !== "DSS") continue;

    // ── STEP 3: Fix NIK AM — 850099 (RENI WULANSARI) → 870022 (HAVEA PERTIWI) unconditionally
    // Use nik_handling (AM responsible) with fallback to nik_pembuat_lop (LOP creator)
    const nikRaw = toIntSafe(r.nik_handling) ?? toIntSafe(r.nik_pembuat_lop);
    if (nikRaw === null) continue; // skip rows with non-numeric NIK

    let nikAm = String(nikRaw);
    if (nikAm === "850099") nikAm = "870022";

    // ── STEP 4: Reject garbage NIKs (too short or clearly invalid)
    if (nikAm.length < 4 || Number(nikAm) > 9999999) continue;

    // ── STEP 5: Filter is_report = 'Y' (hidden Power BI filter — only valid/approved LOPs)
    // Column may be named is_report, IS_REPORT, or similar
    const isReportRaw = r.is_report ?? r.IS_REPORT ?? r.isReport ?? null;
    if (isReportRaw !== null && isReportRaw !== undefined && isReportRaw !== "") {
      const isReportStr = String(isReportRaw).trim().toUpperCase();
      if (isReportStr !== "Y" && isReportStr !== "1" && isReportStr !== "YES" && isReportStr !== "TRUE") continue;
    }

    // ── STEP 6: Fix AM name — RENI WULANSARI → HAVEA PERTIWI (unconditional)
    let namaAm = cleanUpper(r.nama_pembuat_lop);
    if (namaAm === "RENI WULANSARI") namaAm = "HAVEA PERTIWI";

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

export function cleanActivityRows(rows: ParsedRow[]): CleanedActivityRow[] {
  return rows
    .map(r => {
      // ── STEP: Filter witel = SURAMADU AND divisi = DPS/DSS
      const witel = cleanUpper(r.witel);
      const divisi = clean(r.divisi).toUpperCase();

      if (!witel.includes("SURAMADU")) return null;
      if (divisi !== "DPS" && divisi !== "DSS") return null;

      // ── STEP: Validate NIK (must be numeric)
      const nikRaw = toIntSafe(r.nik);
      if (nikRaw === null) return null;

      const fullname = clean(r.fullname);
      if (!fullname) return null;

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
        createdatActivity: parseDate(r.createdat) || clean(r.createdat),
        activityStartDate: parseDate(r.activity_start_date) || clean(r.activity_start_date),
        activityEndDate: parseDate(r.activity_end_date) || clean(r.activity_end_date),
        picName: clean(r.pic_name),
        picJobtitle: clean(r.pic_jobtitle),
        picRole: clean(r.pic_role),
        picPhone: clean(r.pic_phone),
        activityNotes: clean(r.activity_notes),
      } as CleanedActivityRow;
    })
    .filter((r): r is CleanedActivityRow => r !== null);
}

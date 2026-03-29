import { db, appSettingsTable, driveReadLogsTable } from "@workspace/db";
import { logger } from "../../shared/logger";
import { eq } from "drizzle-orm";

let schedulerTimer: ReturnType<typeof setTimeout> | null = null;

const DRIVE_TYPES = ["performance", "funnel", "activity", "target"] as const;
type DriveType = typeof DRIVE_TYPES[number];

const FOLDER_KEY_MAP: Record<DriveType, keyof typeof appSettingsTable.$inferSelect> = {
  performance: "gDriveFolderPerformance",
  funnel:      "gDriveFolderFunnel",
  activity:    "gDriveFolderActivity",
  target:      "gDriveFolderTarget",
};

/** Convert a WIB hour (UTC+7) to the next Date object in UTC */
function nextRunTime(hourWib: number, intervalDays: number): Date {
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
  const now = new Date();
  const nowWib = new Date(now.getTime() + WIB_OFFSET_MS);

  const candidate = new Date(nowWib);
  candidate.setUTCHours(hourWib, 0, 0, 0);

  if (candidate <= nowWib) {
    candidate.setUTCDate(candidate.getUTCDate() + intervalDays);
  }

  return new Date(candidate.getTime() - WIB_OFFSET_MS);
}

function extractFolderId(urlOrId: string): string | null {
  if (!urlOrId) return null;
  const match = urlOrId.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  // If it's already a raw ID (no slash)
  if (/^[a-zA-Z0-9_-]{10,}$/.test(urlOrId.trim())) return urlOrId.trim();
  return null;
}

function extractDateFromFilename(name: string): string | null {
  const match = name.match(/[_-](\d{8})[._?\s&]|(\d{8})\./);
  const raw = match?.[1] || match?.[2];
  if (!raw) return null;
  const y = parseInt(raw.slice(0, 4)), m = parseInt(raw.slice(4, 6)), d = parseInt(raw.slice(6, 8));
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

async function listFiles(folderId: string, apiKey: string) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const fields = encodeURIComponent("files(id,name,mimeType,modifiedTime,size)");
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime+desc&key=${apiKey}&fields=${fields}&pageSize=50`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google Drive API error ${res.status}: ${body.slice(0, 300)}`);
  }
  const data: any = await res.json();
  return (data.files || []) as Array<{ id: string; name: string; mimeType: string; modifiedTime: string }>;
}

function isSupportedFile(name: string, mimeType: string): boolean {
  return (
    name.endsWith(".xlsx") || name.endsWith(".xls") ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "application/vnd.google-apps.spreadsheet"
  );
}

/** Get the latest snapshotDate for a given data type from the DB */
async function getLatestSnapshotDate(type: DriveType): Promise<string | null> {
  const { performanceDataTable, salesFunnelTable, salesActivityTable } = await import("@workspace/db");
  const { desc, max } = await import("drizzle-orm");
  try {
    if (type === "performance") {
      const [row] = await db.select({ maxDate: max(performanceDataTable.snapshotDate) }).from(performanceDataTable);
      return row?.maxDate ?? null;
    } else if (type === "funnel" || type === "target") {
      const [row] = await db.select({ maxDate: max(salesFunnelTable.snapshotDate) }).from(salesFunnelTable);
      return row?.maxDate ?? null;
    } else if (type === "activity") {
      const { salesActivityTable } = await import("@workspace/db");
      const [row] = await db.select({ maxDate: max(salesActivityTable.snapshotDate) }).from(salesActivityTable);
      return row?.maxDate ?? null;
    }
  } catch { /* ignore */ }
  return null;
}

/** Perform the Drive folder check for a single type and write a log entry */
export async function checkDriveFolderAndLog(
  type: DriveType,
  settings: typeof appSettingsTable.$inferSelect,
  triggeredBy: "manual" | "auto"
): Promise<typeof driveReadLogsTable.$inferInsert & { id?: number }> {
  const apiKey = settings.gSheetsApiKey;
  const folderUrlOrId = settings[FOLDER_KEY_MAP[type]] as string | null | undefined;

  const base = {
    type,
    triggeredBy,
    filesFound: 0,
    condition: "" as string,
    message: "" as string,
  };

  if (!apiKey) {
    const log = { ...base, folderId: folderUrlOrId || null, condition: "api_key_missing", message: "API Key belum dikonfigurasi" };
    const [saved] = await db.insert(driveReadLogsTable).values(log).returning();
    return saved;
  }

  if (!folderUrlOrId) {
    const log = { ...base, folderId: null, condition: "folder_missing", message: "URL folder Google Drive belum dikonfigurasi" };
    const [saved] = await db.insert(driveReadLogsTable).values(log).returning();
    return saved;
  }

  const folderId = extractFolderId(folderUrlOrId);
  if (!folderId) {
    const log = { ...base, folderId: folderUrlOrId, condition: "folder_invalid", message: "URL folder tidak valid (tidak bisa ambil ID folder)" };
    const [saved] = await db.insert(driveReadLogsTable).values(log).returning();
    return saved;
  }

  let files: Array<{ id: string; name: string; mimeType: string; modifiedTime: string }>;
  try {
    files = await listFiles(folderId, apiKey);
  } catch (e: any) {
    const log = { ...base, folderId, condition: "api_error", message: `Error dari Google Drive API: ${e.message}` };
    const [saved] = await db.insert(driveReadLogsTable).values(log).returning();
    return saved;
  }

  const excelFiles = files.filter(f => isSupportedFile(f.name, f.mimeType));
  if (excelFiles.length === 0) {
    const log = {
      ...base, folderId, filesFound: 0, condition: "no_files",
      message: "Folder tidak memiliki file Excel/Google Sheets yang valid",
      detail: { totalFilesInFolder: files.length } as any,
    };
    const [saved] = await db.insert(driveReadLogsTable).values(log).returning();
    return saved;
  }

  const latest = excelFiles[0];
  const extractedDate = extractDateFromFilename(latest.name);

  if (!extractedDate) {
    const log = {
      ...base, folderId, filesFound: excelFiles.length,
      latestFileName: latest.name, condition: "format_invalid",
      message: `Nama file tidak mengandung tanggal YYYYMMDD yang valid: "${latest.name}"`,
      detail: { filesFound: excelFiles.map(f => f.name) } as any,
    };
    const [saved] = await db.insert(driveReadLogsTable).values(log).returning();
    return saved;
  }

  const existingDate = await getLatestSnapshotDate(type);

  if (existingDate && existingDate === extractedDate) {
    const log = {
      ...base, folderId, filesFound: excelFiles.length,
      latestFileName: latest.name, latestFileDateExtracted: extractedDate,
      existingSnapshotDate: existingDate, condition: "date_same",
      message: `Tanggal file (${extractedDate}) sama dengan snapshot terakhir — dilewati`,
      detail: { filesFound: excelFiles.map(f => f.name) } as any,
    };
    const [saved] = await db.insert(driveReadLogsTable).values(log).returning();
    return saved;
  }

  // Proceed to import
  try {
    const { default: gdriveRouter } = await import("./routes");
    // Import the actual importer functions
    const { runDriveImport } = await import("./importer");
    const result = await runDriveImport(type, latest.id, latest.mimeType, latest.name, apiKey, extractedDate);
    const log = {
      ...base, folderId, filesFound: excelFiles.length,
      latestFileName: latest.name, latestFileDateExtracted: extractedDate,
      existingSnapshotDate: existingDate ?? null, condition: "imported",
      message: `Berhasil diimport: ${result.imported} baris dari "${latest.name}"`,
      rowsImported: result.imported,
      detail: { filesFound: excelFiles.map(f => f.name), period: result.period } as any,
    };
    const [saved] = await db.insert(driveReadLogsTable).values(log).returning();
    // Update gDriveLastCheckAt
    await db.update(appSettingsTable).set({ gDriveLastCheckAt: new Date() }).where(eq(appSettingsTable.id, settings.id));
    return saved;
  } catch (e: any) {
    const log = {
      ...base, folderId, filesFound: excelFiles.length,
      latestFileName: latest.name, latestFileDateExtracted: extractedDate,
      existingSnapshotDate: existingDate ?? null, condition: "import_error",
      message: `Import gagal: ${e.message}`,
      detail: { error: e.message } as any,
    };
    const [saved] = await db.insert(driveReadLogsTable).values(log).returning();
    return saved;
  }
}

async function tick() {
  logger.info("GDrive scheduled check triggered");
  try {
    const [settings] = await db.select().from(appSettingsTable);
    if (!settings) return;
    for (const type of DRIVE_TYPES) {
      try {
        const result = await checkDriveFolderAndLog(type, settings, "auto");
        logger.info({ type, condition: result.condition, message: result.message }, "GDrive folder checked");
      } catch (e: any) {
        logger.error({ type, err: e }, "GDrive check error for type");
      }
    }
    // Update last check timestamp
    await db.update(appSettingsTable).set({ gDriveLastCheckAt: new Date() }).where(eq(appSettingsTable.id, settings.id));
  } catch (err) {
    logger.error({ err }, "GDrive scheduled check failed");
  }
  scheduleNext();
}

async function scheduleNext() {
  if (schedulerTimer) { clearTimeout(schedulerTimer); schedulerTimer = null; }
  try {
    const [settings] = await db.select().from(appSettingsTable);
    if (!settings?.gDriveSyncEnabled) return;

    const hourWib = settings.gDriveSyncHourWib ?? 7;
    const intervalDays = settings.gDriveSyncIntervalDays ?? 1;
    const runAt = nextRunTime(hourWib, intervalDays);
    const delayMs = runAt.getTime() - Date.now();

    logger.info({ runAt: runAt.toISOString(), delayMs }, "GDrive auto-check scheduled");
    schedulerTimer = setTimeout(tick, delayMs);
  } catch (err) {
    logger.error({ err }, "Failed to schedule GDrive check");
  }
}

export function startGDriveScheduler() {
  scheduleNext();
}

export function rescheduleGDrive() {
  scheduleNext();
}

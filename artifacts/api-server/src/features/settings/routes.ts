import { Router, type IRouter } from "express";
import { db, appSettingsTable } from "@workspace/db";
import { requireAuth } from "../../shared/auth";
import { rescheduleGSheets } from "../gsheets/scheduler";

const router: IRouter = Router();

router.get("/settings", requireAuth, async (req, res): Promise<void> => {
  let [settings] = await db.select().from(appSettingsTable);
  if (!settings) {
    [settings] = await db.insert(appSettingsTable).values({
      autoSendOnImport: true,
      kpiActivityDefault: 30,
    }).returning();
  }
  res.json({
    telegramBotToken: settings.telegramBotToken ? "***" + settings.telegramBotToken.slice(-6) : null,
    sharepointPerformanceUrl: settings.sharepointPerformanceUrl,
    sharepointFunnelUrl: settings.sharepointFunnelUrl,
    sharepointActivityUrl: settings.sharepointActivityUrl,
    autoSendOnImport: settings.autoSendOnImport,
    kpiActivityDefault: settings.kpiActivityDefault,
    gSheetsSpreadsheetId: settings.gSheetsSpreadsheetId,
    gSheetsApiKey: settings.gSheetsApiKey ? "***" + settings.gSheetsApiKey.slice(-6) : null,
    gSheetsFunnelPattern: settings.gSheetsFunnelPattern ?? "TREG3_SALES_FUNNEL_",
    gSheetsSyncEnabled: settings.gSheetsSyncEnabled,
    gSheetsSyncHourWib: settings.gSheetsSyncHourWib,
    gSheetsSyncIntervalDays: settings.gSheetsSyncIntervalDays,
    gSheetsLastSyncAt: settings.gSheetsLastSyncAt?.toISOString() ?? null,
    gDriveFolderPerformance: settings.gDriveFolderPerformance,
    gDriveFolderFunnel: settings.gDriveFolderFunnel,
    gDriveFolderActivity: settings.gDriveFolderActivity,
    gDriveFolderTarget: settings.gDriveFolderTarget,
  });
});

router.patch("/settings", requireAuth, async (req, res): Promise<void> => {
  const {
    telegramBotToken, sharepointPerformanceUrl, sharepointFunnelUrl, sharepointActivityUrl,
    autoSendOnImport, kpiActivityDefault,
    gSheetsSpreadsheetId, gSheetsApiKey, gSheetsFunnelPattern,
    gSheetsSyncEnabled, gSheetsSyncHourWib, gSheetsSyncIntervalDays,
    gDriveFolderPerformance, gDriveFolderFunnel, gDriveFolderActivity, gDriveFolderTarget,
  } = req.body;

  const [existing] = await db.select().from(appSettingsTable);
  const updates: Partial<typeof appSettingsTable.$inferInsert> = {};

  if (telegramBotToken !== undefined && !telegramBotToken.startsWith("***")) updates.telegramBotToken = telegramBotToken;
  if (sharepointPerformanceUrl !== undefined) updates.sharepointPerformanceUrl = sharepointPerformanceUrl;
  if (sharepointFunnelUrl !== undefined) updates.sharepointFunnelUrl = sharepointFunnelUrl;
  if (sharepointActivityUrl !== undefined) updates.sharepointActivityUrl = sharepointActivityUrl;
  if (autoSendOnImport !== undefined) updates.autoSendOnImport = autoSendOnImport;
  if (kpiActivityDefault !== undefined) updates.kpiActivityDefault = kpiActivityDefault;
  // Google Sheets fields
  if (gSheetsSpreadsheetId !== undefined) updates.gSheetsSpreadsheetId = gSheetsSpreadsheetId || null;
  if (gSheetsApiKey !== undefined && !String(gSheetsApiKey).startsWith("***")) updates.gSheetsApiKey = gSheetsApiKey || null;
  if (gSheetsFunnelPattern !== undefined) updates.gSheetsFunnelPattern = gSheetsFunnelPattern || "TREG3_SALES_FUNNEL_";
  if (gSheetsSyncEnabled !== undefined) updates.gSheetsSyncEnabled = Boolean(gSheetsSyncEnabled);
  if (gSheetsSyncHourWib !== undefined) updates.gSheetsSyncHourWib = Number(gSheetsSyncHourWib) || 6;
  if (gSheetsSyncIntervalDays !== undefined) updates.gSheetsSyncIntervalDays = Number(gSheetsSyncIntervalDays) || 1;
  if (gDriveFolderPerformance !== undefined) updates.gDriveFolderPerformance = gDriveFolderPerformance || null;
  if (gDriveFolderFunnel !== undefined) updates.gDriveFolderFunnel = gDriveFolderFunnel || null;
  if (gDriveFolderActivity !== undefined) updates.gDriveFolderActivity = gDriveFolderActivity || null;
  if (gDriveFolderTarget !== undefined) updates.gDriveFolderTarget = gDriveFolderTarget || null;
  updates.updatedAt = new Date();

  let settings;
  if (existing) {
    [settings] = await db.update(appSettingsTable).set(updates).returning();
  } else {
    [settings] = await db.insert(appSettingsTable).values({
      autoSendOnImport: autoSendOnImport ?? true,
      kpiActivityDefault: kpiActivityDefault ?? 30,
      ...updates,
    }).returning();
  }

  // Reschedule GSheets sync with new settings
  rescheduleGSheets();

  res.json({
    telegramBotToken: settings.telegramBotToken ? "***" + settings.telegramBotToken.slice(-6) : null,
    sharepointPerformanceUrl: settings.sharepointPerformanceUrl,
    sharepointFunnelUrl: settings.sharepointFunnelUrl,
    sharepointActivityUrl: settings.sharepointActivityUrl,
    autoSendOnImport: settings.autoSendOnImport,
    kpiActivityDefault: settings.kpiActivityDefault,
    gSheetsSpreadsheetId: settings.gSheetsSpreadsheetId,
    gSheetsApiKey: settings.gSheetsApiKey ? "***" + settings.gSheetsApiKey.slice(-6) : null,
    gSheetsFunnelPattern: settings.gSheetsFunnelPattern ?? "TREG3_SALES_FUNNEL_",
    gSheetsSyncEnabled: settings.gSheetsSyncEnabled,
    gSheetsSyncHourWib: settings.gSheetsSyncHourWib,
    gSheetsSyncIntervalDays: settings.gSheetsSyncIntervalDays,
    gSheetsLastSyncAt: settings.gSheetsLastSyncAt?.toISOString() ?? null,
    gDriveFolderPerformance: settings.gDriveFolderPerformance,
    gDriveFolderFunnel: settings.gDriveFolderFunnel,
    gDriveFolderActivity: settings.gDriveFolderActivity,
    gDriveFolderTarget: settings.gDriveFolderTarget,
  });
});

export default router;

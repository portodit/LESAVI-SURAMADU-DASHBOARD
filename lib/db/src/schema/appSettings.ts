import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const appSettingsTable = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  telegramBotToken: text("telegram_bot_token"),
  sharepointPerformanceUrl: text("sharepoint_performance_url"),
  sharepointFunnelUrl: text("sharepoint_funnel_url"),
  sharepointActivityUrl: text("sharepoint_activity_url"),
  autoSendOnImport: boolean("auto_send_on_import").notNull().default(true),
  kpiActivityDefault: integer("kpi_activity_default").notNull().default(30),
  // Google Sheets auto-sync
  gSheetsSpreadsheetId: text("g_sheets_spreadsheet_id"),
  gSheetsApiKey: text("g_sheets_api_key"),
  gSheetsFunnelPattern: text("g_sheets_funnel_pattern").default("TREG3_SALES_FUNNEL_"),
  gSheetsSyncEnabled: boolean("g_sheets_sync_enabled").notNull().default(false),
  gSheetsSyncHourWib: integer("g_sheets_sync_hour_wib").notNull().default(6),
  gSheetsSyncIntervalDays: integer("g_sheets_sync_interval_days").notNull().default(1),
  gSheetsLastSyncAt: timestamp("g_sheets_last_sync_at", { withTimezone: true }),
  gSheetsLastSyncResult: text("g_sheets_last_sync_result"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAppSettingsSchema = createInsertSchema(appSettingsTable).omit({ id: true });
export type InsertAppSettings = z.infer<typeof insertAppSettingsSchema>;
export type AppSettings = typeof appSettingsTable.$inferSelect;

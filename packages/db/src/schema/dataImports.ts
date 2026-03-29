import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dataImportsTable = pgTable("data_imports", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  rowsImported: integer("rows_imported").notNull().default(0),
  period: text("period").notNull(),
  snapshotDate: text("snapshot_date"),
  sourceUrl: text("source_url"),
  autoTelegramSent: boolean("auto_telegram_sent").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDataImportSchema = createInsertSchema(dataImportsTable).omit({ id: true, createdAt: true });
export type InsertDataImport = z.infer<typeof insertDataImportSchema>;
export type DataImport = typeof dataImportsTable.$inferSelect;

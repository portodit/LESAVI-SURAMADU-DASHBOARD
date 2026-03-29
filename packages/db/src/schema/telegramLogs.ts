import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const telegramLogsTable = pgTable("telegram_logs", {
  id: serial("id").primaryKey(),
  nik: text("nik").notNull(),
  namaAm: text("nama_am").notNull(),
  telegramChatId: text("telegram_chat_id"),
  status: text("status").notNull(),
  period: text("period").notNull(),
  messageType: text("message_type").notNull(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTelegramLogSchema = createInsertSchema(telegramLogsTable).omit({ id: true, createdAt: true });
export type InsertTelegramLog = z.infer<typeof insertTelegramLogSchema>;
export type TelegramLog = typeof telegramLogsTable.$inferSelect;

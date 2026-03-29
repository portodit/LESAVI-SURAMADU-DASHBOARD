import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const telegramBotUsersTable = pgTable("telegram_bot_users", {
  chatId: text("chat_id").primaryKey(),
  firstName: text("first_name").notNull().default(""),
  lastName: text("last_name").notNull().default(""),
  username: text("username").notNull().default(""),
  lastMessage: text("last_message").notNull().default(""),
  lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
});

export type TelegramBotUser = typeof telegramBotUsersTable.$inferSelect;

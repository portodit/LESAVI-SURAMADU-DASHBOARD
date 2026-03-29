import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pendingAmDiscoveriesTable = pgTable("pending_am_discoveries", {
  id: serial("id").primaryKey(),
  nik: text("nik").notNull(),
  nama: text("nama").notNull(),
  divisi: text("divisi"),
  witel: text("witel"),
  source: text("source").notNull(),
  importId: integer("import_id"),
  status: text("status").notNull().default("pending"),
  reviewedBy: integer("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPendingAmDiscoverySchema = createInsertSchema(pendingAmDiscoveriesTable).omit({ id: true, createdAt: true });
export type InsertPendingAmDiscovery = z.infer<typeof insertPendingAmDiscoverySchema>;
export type PendingAmDiscovery = typeof pendingAmDiscoveriesTable.$inferSelect;

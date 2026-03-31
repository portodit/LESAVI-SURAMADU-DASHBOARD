import { pgTable, text, serial, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const salesFunnelTable = pgTable("sales_funnel", {
  id: serial("id").primaryKey(),
  lopid: text("lopid").notNull(),
  judulProyek: text("judul_proyek").notNull(),
  pelanggan: text("pelanggan").notNull(),
  nilaiProyek: real("nilai_proyek").notNull().default(0),
  divisi: text("divisi").notNull(),
  segmen: text("segmen"),
  witel: text("witel"),
  statusF: text("status_f"),
  proses: text("proses"),
  statusProyek: text("status_proyek"),
  kategoriKontrak: text("kategori_kontrak"),
  estimateBulan: text("estimate_bulan"),
  monthSubs: integer("month_subs"),
  namaAm: text("nama_am"),
  nikAm: text("nik_am"),
  reportDate: text("report_date"),
  createdDate: text("created_date"),
  snapshotDate: text("snapshot_date"),
  importId: integer("import_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const salesFunnelTargetTable = pgTable("sales_funnel_target", {
  id: serial("id").primaryKey(),
  divisi: text("divisi"),
  tahun: integer("tahun").notNull(),
  bulan: integer("bulan"),
  targetFullHo: real("target_full_ho").notNull().default(0),
  targetHo: real("target_ho").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSalesFunnelSchema = createInsertSchema(salesFunnelTable).omit({ id: true, createdAt: true });
export type InsertSalesFunnel = z.infer<typeof insertSalesFunnelSchema>;
export type SalesFunnel = typeof salesFunnelTable.$inferSelect;

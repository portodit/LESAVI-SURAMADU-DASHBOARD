import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const masterAmTable = pgTable("master_am", {
  id: serial("id").primaryKey(),
  nik: text("nik").notNull().unique(),
  nama: text("nama").notNull(),
  divisi: text("divisi"),
  witel: text("witel").default("SURAMADU"),
  jabatan: text("jabatan"),
  aktif: boolean("aktif").notNull().default(true),
  crossWitel: boolean("cross_witel").notNull().default(false),
  source: text("source").default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const masterCustomerTable = pgTable("master_customer", {
  id: serial("id").primaryKey(),
  nama: text("nama").notNull().unique(),
  segmen: text("segmen"),
  witel: text("witel").default("SURAMADU"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMasterAmSchema = createInsertSchema(masterAmTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMasterAm = z.infer<typeof insertMasterAmSchema>;
export type MasterAm = typeof masterAmTable.$inferSelect;

export const insertMasterCustomerSchema = createInsertSchema(masterCustomerTable).omit({ id: true, createdAt: true });
export type InsertMasterCustomer = z.infer<typeof insertMasterCustomerSchema>;
export type MasterCustomer = typeof masterCustomerTable.$inferSelect;

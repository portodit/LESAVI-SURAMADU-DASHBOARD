import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Log setiap percobaan baca folder Google Drive — baik otomatis (scheduler) maupun manual.
 * Mencatat semua kondisi: tidak ada file, format nama tidak sesuai, tanggal sama (skip),
 * berhasil import, maupun error.
 */
export const driveReadLogsTable = pgTable("drive_read_logs", {
  id: serial("id").primaryKey(),
  /** Tipe data: performance | funnel | activity | target */
  type: text("type").notNull(),
  /** ID folder Google Drive yang dicek */
  folderId: text("folder_id"),
  /** Cara pemicu: "manual" (user klik) atau "auto" (scheduler) */
  triggeredBy: text("triggered_by").notNull().default("manual"),
  /** Waktu percobaan baca folder */
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  /** Jumlah total file yang ditemukan di folder (setelah filter format) */
  filesFound: integer("files_found").notNull().default(0),
  /** Nama file terbaru yang ditemukan */
  latestFileName: text("latest_file_name"),
  /** Tanggal yang ter-ekstrak dari nama file terbaru (format YYYY-MM-DD) */
  latestFileDateExtracted: text("latest_file_date_extracted"),
  /** Tanggal snapshot terbaru yang sudah ada di database (format YYYY-MM-DD) */
  existingSnapshotDate: text("existing_snapshot_date"),
  /**
   * Kondisi hasil pengecekan:
   * - api_key_missing   : API Key belum dikonfigurasi
   * - folder_missing    : URL folder belum dikonfigurasi
   * - folder_invalid    : URL folder tidak bisa di-parse (format salah)
   * - api_error         : Error dari Google Drive API
   * - no_files          : Folder kosong atau tidak ada file yang cocok format
   * - format_invalid    : File ditemukan tapi nama tidak mengandung tanggal YYYYMMDD
   * - date_same         : Tanggal file sama dengan snapshot yang sudah ada → skip
   * - imported          : Import berhasil
   * - import_error      : Import gagal (file berhasil dibaca tapi insert DB error)
   */
  condition: text("condition").notNull(),
  /** Pesan ringkas tentang hasil */
  message: text("message").notNull(),
  /** Jumlah baris yang berhasil diimport (jika condition = imported) */
  rowsImported: integer("rows_imported"),
  /** Detail tambahan dalam format JSON (daftar file, error detail, dsb) */
  detail: jsonb("detail"),
});

export const insertDriveReadLogSchema = createInsertSchema(driveReadLogsTable).omit({ id: true });
export type InsertDriveReadLog = z.infer<typeof insertDriveReadLogSchema>;
export type DriveReadLog = typeof driveReadLogsTable.$inferSelect;

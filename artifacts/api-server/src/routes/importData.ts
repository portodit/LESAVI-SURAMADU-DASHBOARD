import { Router, type IRouter } from "express";
import { db, dataImportsTable, performanceDataTable, salesFunnelTable, salesActivityTable, accountManagersTable, appSettingsTable } from "@workspace/db";
import { desc, eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import {
  parseExcelFromUrl, parseExcelFromBase64,
  detectPeriod, extractSnapshotDateFromUrl, slugify,
  cleanFunnelRows, cleanActivityRows, parseIndonesianNumber
} from "../lib/excel";
import { sendReminderToAllAMs } from "../lib/telegram";

const router: IRouter = Router();

// ── Helper: resolve rows from URL or base64 file ─────────────────────────────
async function resolveRows(body: any): Promise<{ rows: any[]; sourceUrl: string | null; snapshotDate: string | null }> {
  const { url, fileData, snapshotDate } = body;

  if (fileData) {
    // Manual file upload (base64)
    const rows = parseExcelFromBase64(fileData);
    return { rows, sourceUrl: null, snapshotDate: snapshotDate || null };
  }
  if (url) {
    const rows = await parseExcelFromUrl(url);
    const detectedDate = snapshotDate || extractSnapshotDateFromUrl(url);
    return { rows, sourceUrl: url, snapshotDate: detectedDate };
  }
  throw new Error("URL SharePoint atau file Excel diperlukan");
}

// ── Import History ────────────────────────────────────────────────────────────
router.get("/import/history", requireAuth, async (req, res): Promise<void> => {
  const records = await db.select().from(dataImportsTable).orderBy(desc(dataImportsTable.createdAt)).limit(50);
  res.json(records.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

// ── Import Performance ────────────────────────────────────────────────────────
router.post("/import/performance", requireAuth, async (req, res): Promise<void> => {
  let rows: any[];
  let sourceUrl: string | null;
  let snapshotDate: string | null;

  try {
    ({ rows, sourceUrl, snapshotDate } = await resolveRows(req.body));
  } catch (e: any) {
    res.status(400).json({ error: e.message });
    return;
  }

  const rawCount = rows.length;

  // ── Detect if this is the RAW aggregate format (PERIODE, NIK, NAMA_AM, TARGET_REVENUE, REAL_REVENUE per pelanggan)
  const isRawFormat = rows.length > 0 && ("PERIODE" in rows[0] || "NAMA_AM" in rows[0]);

  let toInsert: any[];

  if (isRawFormat) {
    // ── RAW format: per-customer per-month rows, aggregate by NIK + PERIODE
    // New columns: PROPORSI, NIP_NAS, STANDARD_NAME, TARGET_SUSTAIN, TARGET_SCALING,
    //              TARGET_NGTMA, REAL_SUSTAIN, REAL_SCALING, REAL_NGTMA
    type CustomerEntry = {
      nip: string; pelanggan: string; proporsi: number;
      Reguler: { target: number; real: number };
      Sustain: { target: number; real: number };
      Scaling: { target: number; real: number };
      NGTMA: { target: number; real: number };
      targetTotal: number; realTotal: number;
    };
    type AmEntry = {
      nik: string; namaAm: string; divisi: string; witel: string;
      periodeStr: string; target: number; real: number;
      customers: CustomerEntry[];
    };
    const amMap = new Map<string, AmEntry>();

    for (const r of rows) {
      const nik = String(r.NIK || r.nik || "").trim();
      const namaAm = String(r.NAMA_AM || r.nama_am || "").trim();
      const divisiRaw = String(r.DIVISI_AM || r.divisi || "").trim();
      const periodeStr = String(r.PERIODE || "").trim(); // "202601"
      if (!nik || !namaAm || !periodeStr || periodeStr.length < 6) continue;

      const key = `${nik}__${periodeStr}`;

      // Revenue per tipe
      const tReg = parseIndonesianNumber(r.TARGET_REVENUE ?? r.target_revenue);
      const rReg = parseIndonesianNumber(r.REAL_REVENUE ?? r.real_revenue);
      const tSustain = parseIndonesianNumber(r.TARGET_SUSTAIN ?? r.target_sustain ?? 0);
      const rSustain = parseIndonesianNumber(r.REAL_SUSTAIN ?? r.real_sustain ?? 0);
      const tScaling = parseIndonesianNumber(r.TARGET_SCALING ?? r.target_scaling ?? 0);
      const rScaling = parseIndonesianNumber(r.REAL_SCALING ?? r.real_scaling ?? 0);
      const tNgtma = parseIndonesianNumber(r.TARGET_NGTMA ?? r.target_ngtma ?? 0);
      const rNgtma = parseIndonesianNumber(r.REAL_NGTMA ?? r.real_ngtma ?? 0);
      const targetTotal = tReg + tSustain + tScaling + tNgtma;
      const realTotal = rReg + rSustain + rScaling + rNgtma;

      // Customer info
      const pelanggan = String(r.STANDARD_NAME || r.NAMA_PELANGGAN || r.PELANGGAN || r.pelanggan || r.nama_account || "").trim();
      const nip = String(r.NIP_NAS || r.nip_nas || r.NIP || "").trim();
      const proporsi = parseFloat(String(r.PROPORSI ?? r.proporsi ?? 0)) || 0;

      if (!amMap.has(key)) {
        amMap.set(key, {
          nik, namaAm,
          divisi: divisiRaw,
          witel: String(r.WITEL_AM || r.witel || "SURAMADU").trim(),
          periodeStr, target: 0, real: 0,
          tReg: 0, rReg: 0, tSustain: 0, rSustain: 0,
          tScaling: 0, rScaling: 0, tNgtma: 0, rNgtma: 0,
          customers: [],
        });
      }
      const entry = amMap.get(key)!;
      entry.target += targetTotal;
      entry.real += realTotal;
      entry.tReg += tReg; entry.rReg += rReg;
      entry.tSustain += tSustain; entry.rSustain += rSustain;
      entry.tScaling += tScaling; entry.rScaling += rScaling;
      entry.tNgtma += tNgtma; entry.rNgtma += rNgtma;
      if (pelanggan) {
        entry.customers.push({
          nip, pelanggan, proporsi,
          Reguler: { target: tReg, real: rReg },
          Sustain: { target: tSustain, real: rSustain },
          Scaling: { target: tScaling, real: rScaling },
          NGTMA: { target: tNgtma, real: rNgtma },
          targetTotal, realTotal,
        });
      }
    }

    toInsert = [...amMap.values()].map(entry => {
      const year = parseInt(entry.periodeStr.slice(0, 4), 10);
      const month = parseInt(entry.periodeStr.slice(4, 6), 10);
      const achRate = entry.target > 0 ? entry.real / entry.target : 0;
      return {
        nik: entry.nik,
        namaAm: entry.namaAm,
        divisi: entry.divisi,
        tahun: year,
        bulan: month,
        targetRevenue: entry.target,
        realRevenue: entry.real,
        targetReguler: entry.tReg,
        realReguler: entry.rReg,
        targetSustain: entry.tSustain,
        realSustain: entry.rSustain,
        targetScaling: entry.tScaling,
        realScaling: entry.rScaling,
        targetNgtma: entry.tNgtma,
        realNgtma: entry.rNgtma,
        achRate,
        achRateYtd: achRate,
        rankAch: 0,
        statusWarna: achRate >= 1 ? "hijau" : achRate >= 0.8 ? "oranye" : "merah",
        snapshotDate: snapshotDate || null,
        komponenDetail: entry.customers.length > 0 ? JSON.stringify(entry.customers) : null,
      };
    }).filter(r => r.nik && r.namaAm);
  } else {
    // ── Original format (one row per AM, pre-aggregated)
    const importPeriodOrig = req.body.period || detectPeriod(rows, sourceUrl || undefined);
    const [y, m] = importPeriodOrig.split("-").map(Number);

    toInsert = rows.map((r: any) => ({
      nik: String(r.NIK || r.nik || ""),
      namaAm: String(r.NAMA_AM || r.nama_am || r.STANDARD_NAME || "").trim(),
      divisi: String(r.DIVISI_AM || r.divisi || "").trim(),
      tahun: y,
      bulan: m,
      targetRevenue: parseIndonesianNumber(r["Target Revenue Dinamis"] || r.target_revenue),
      realRevenue: parseIndonesianNumber(r["Real Revenue Dinamis"] || r.real_revenue),
      achRate: parseFloat(String(r["Ach Rate Dinamis MTD"] || r.ach_rate || 0)) || 0,
      achRateYtd: parseFloat(String(r["Ach Revenue YTD"] || r.ach_ytd || 0)) || 0,
      rankAch: parseInt(String(r["Rank by Ach Revenue"] || r.rank || 0)) || 0,
      statusWarna: String(r["AM Hijau"] === "1" ? "hijau" : r["AM Oranye"] === "1" ? "oranye" : "merah"),
      snapshotDate: snapshotDate || null,
    })).filter((r: any) => r.nik && r.namaAm);
  }

  if (toInsert.length === 0) {
    res.status(422).json({ error: "Tidak ada baris data performa yang valid ditemukan dalam file.", rawCount });
    return;
  }

  // Derive period from first aggregated row (for RAW format)
  const firstRow = toInsert[0];
  const importPeriod = req.body.period ||
    (isRawFormat ? `${firstRow.tahun}-${String(firstRow.bulan).padStart(2, "0")}` : detectPeriod(rows, sourceUrl || undefined));

  // ── Cek duplikat: sudah ada import type+period yang sama?
  const [existingPerf] = await db.select().from(dataImportsTable)
    .where(and(eq(dataImportsTable.type, "performance"), eq(dataImportsTable.period, importPeriod)));

  if (existingPerf && !req.body.forceOverwrite) {
    res.status(409).json({
      conflict: true,
      error: `Sudah ada data Performa periode ${importPeriod} yang diimport sebelumnya.`,
      existingId: existingPerf.id,
      existingRows: existingPerf.rowsImported,
      period: importPeriod,
      importedAt: existingPerf.createdAt.toISOString(),
    });
    return;
  }

  // Jika overwrite: hapus data lama
  if (existingPerf && req.body.forceOverwrite) {
    await db.delete(performanceDataTable).where(eq(performanceDataTable.importId, existingPerf.id));
    await db.delete(dataImportsTable).where(eq(dataImportsTable.id, existingPerf.id));
  }

  const [imp] = await db.insert(dataImportsTable).values({
    type: "performance",
    rowsImported: toInsert.length,
    period: importPeriod,
    sourceUrl,
    autoTelegramSent: false,
  }).returning();

  const existingAMs = await db.select().from(accountManagersTable);
  for (const row of toInsert) {
    await db.insert(performanceDataTable).values({ ...row, importId: imp.id });
    if (!existingAMs.find((a: any) => a.nik === row.nik) && row.nik) {
      const slug = slugify(row.namaAm);
      await db.insert(accountManagersTable).values({
        nik: row.nik, nama: row.namaAm, slug, divisi: row.divisi, witel: row.witel || "SURAMADU",
      }).onConflictDoNothing();
    }
  }

  const amCount = new Set(toInsert.map(r => r.nik)).size;

  const [settings] = await db.select().from(appSettingsTable);
  if (settings?.autoSendOnImport && settings.telegramBotToken) {
    sendReminderToAllAMs(importPeriod, { includePerformance: true, includeFunnel: false, includeActivity: false }).catch(() => {});
  }

  res.json({
    success: true, rowsImported: toInsert.length, amCount,
    rawCount, period: importPeriod, snapshotDate,
    message: `${amCount} AM berhasil diimport — ${toInsert.length} rekord AM-periode dibuat dari ${rawCount} baris mentah (data pelanggan tersimpan di komponen detail)`,
    importId: imp.id,
  });
});

// ── Import Funnel ─────────────────────────────────────────────────────────────
router.post("/import/funnel", requireAuth, async (req, res): Promise<void> => {
  let rows: any[];
  let sourceUrl: string | null;
  let snapshotDate: string | null;

  try {
    ({ rows, sourceUrl, snapshotDate } = await resolveRows(req.body));
  } catch (e: any) {
    res.status(400).json({ error: e.message });
    return;
  }

  // ── Apply cleaning pipeline (sesuai Power Query di Power BI)
  const cleaned = cleanFunnelRows(rows);

  if (cleaned.length === 0) {
    res.status(422).json({
      error: "Tidak ada data valid setelah proses cleaning. Pastikan file mengandung kolom witel=SURAMADU dan divisi=DPS/DSS.",
      rawCount: rows.length,
    });
    return;
  }

  const importPeriod = req.body.period || detectPeriod(rows, sourceUrl || undefined);

  // ── Cek duplikat
  const [existingFunnel] = await db.select().from(dataImportsTable)
    .where(and(eq(dataImportsTable.type, "funnel"), eq(dataImportsTable.period, importPeriod)));

  if (existingFunnel && !req.body.forceOverwrite) {
    res.status(409).json({
      conflict: true,
      error: `Sudah ada data Sales Funnel periode ${importPeriod} yang diimport sebelumnya.`,
      existingId: existingFunnel.id,
      existingRows: existingFunnel.rowsImported,
      period: importPeriod,
      importedAt: existingFunnel.createdAt.toISOString(),
    });
    return;
  }

  if (existingFunnel && req.body.forceOverwrite) {
    await db.delete(salesFunnelTable).where(eq(salesFunnelTable.importId, existingFunnel.id));
    await db.delete(dataImportsTable).where(eq(dataImportsTable.id, existingFunnel.id));
  }

  const [imp] = await db.insert(dataImportsTable).values({
    type: "funnel",
    rowsImported: cleaned.length,
    period: importPeriod,
    sourceUrl,
    autoTelegramSent: false,
  }).returning();

  for (const row of cleaned) {
    await db.insert(salesFunnelTable).values({ ...row, snapshotDate: snapshotDate || null, importId: imp.id });
  }

  const amCount = new Set(cleaned.map(r => r.nikAm)).size;

  const [settings] = await db.select().from(appSettingsTable);
  if (settings?.autoSendOnImport && settings.telegramBotToken) {
    sendReminderToAllAMs(importPeriod, { includePerformance: false, includeFunnel: true, includeActivity: false }).catch(() => {});
  }

  res.json({
    success: true, rowsImported: cleaned.length, amCount,
    period: importPeriod, snapshotDate,
    rawCount: rows.length,
    message: `${cleaned.length} dari ${rows.length} baris funnel berhasil diimport (setelah cleaning)`,
    importId: imp.id,
  });
});

// ── Import Activity ───────────────────────────────────────────────────────────
router.post("/import/activity", requireAuth, async (req, res): Promise<void> => {
  let rows: any[];
  let sourceUrl: string | null;
  let snapshotDate: string | null;

  try {
    ({ rows, sourceUrl, snapshotDate } = await resolveRows(req.body));
  } catch (e: any) {
    res.status(400).json({ error: e.message });
    return;
  }

  // ── Apply cleaning pipeline
  const cleaned = cleanActivityRows(rows);

  if (cleaned.length === 0) {
    res.status(422).json({
      error: "Tidak ada data valid setelah proses cleaning. Pastikan file mengandung kolom witel=SURAMADU dan divisi=DPS/DSS.",
      rawCount: rows.length,
    });
    return;
  }

  const importPeriod = req.body.period || detectPeriod(rows, sourceUrl || undefined);

  // ── Cek duplikat
  const [existingAct] = await db.select().from(dataImportsTable)
    .where(and(eq(dataImportsTable.type, "activity"), eq(dataImportsTable.period, importPeriod)));

  if (existingAct && !req.body.forceOverwrite) {
    res.status(409).json({
      conflict: true,
      error: `Sudah ada data Sales Activity periode ${importPeriod} yang diimport sebelumnya.`,
      existingId: existingAct.id,
      existingRows: existingAct.rowsImported,
      period: importPeriod,
      importedAt: existingAct.createdAt.toISOString(),
    });
    return;
  }

  if (existingAct && req.body.forceOverwrite) {
    await db.delete(salesActivityTable).where(eq(salesActivityTable.importId, existingAct.id));
    await db.delete(dataImportsTable).where(eq(dataImportsTable.id, existingAct.id));
  }

  const [imp] = await db.insert(dataImportsTable).values({
    type: "activity",
    rowsImported: cleaned.length,
    period: importPeriod,
    sourceUrl,
    autoTelegramSent: false,
  }).returning();

  for (const row of cleaned) {
    await db.insert(salesActivityTable).values({ ...row, snapshotDate: snapshotDate || null, importId: imp.id });
  }

  const amCount = new Set(cleaned.map(r => r.nik)).size;

  const [settings] = await db.select().from(appSettingsTable);
  if (settings?.autoSendOnImport && settings.telegramBotToken) {
    sendReminderToAllAMs(importPeriod, { includePerformance: false, includeFunnel: false, includeActivity: true }).catch(() => {});
  }

  res.json({
    success: true, rowsImported: cleaned.length, amCount,
    period: importPeriod, snapshotDate,
    rawCount: rows.length,
    message: `${cleaned.length} dari ${rows.length} baris activity berhasil diimport (setelah cleaning)`,
    importId: imp.id,
  });
});

// ── Get Import Metadata ───────────────────────────────────────────────────────
router.get("/import/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }
  const [imp] = await db.select().from(dataImportsTable).where(eq(dataImportsTable.id, id));
  if (!imp) { res.status(404).json({ error: "Import tidak ditemukan" }); return; }
  res.json({ ...imp, createdAt: imp.createdAt.toISOString() });
});

// ── Get Import Data Rows ───────────────────────────────────────────────────────
router.get("/import/:id/data", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }
  const [imp] = await db.select().from(dataImportsTable).where(eq(dataImportsTable.id, id));
  if (!imp) { res.status(404).json({ error: "Import tidak ditemukan" }); return; }

  res.setHeader("Cache-Control", "no-store");
  if (imp.type === "performance") {
    const rows = await db.select().from(performanceDataTable).where(eq(performanceDataTable.importId, id));
    res.json({ type: imp.type, rows: rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })) });
  } else if (imp.type === "funnel") {
    const rows = await db.select().from(salesFunnelTable).where(eq(salesFunnelTable.importId, id));
    res.json({ type: imp.type, rows: rows.map(r => ({ ...r, createdAt: r.createdAt?.toISOString() })) });
  } else if (imp.type === "activity") {
    const rows = await db.select().from(salesActivityTable).where(eq(salesActivityTable.importId, id));
    res.json({ type: imp.type, rows: rows.map(r => ({ ...r, createdAt: r.createdAt?.toISOString() })) });
  } else {
    res.json({ type: imp.type, rows: [] });
  }
});

// ── Delete Import (hapus snapshot + semua data terkait) ───────────────────────
router.delete("/import/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  // Get import record first to know the type
  const [imp] = await db.select().from(dataImportsTable).where(eq(dataImportsTable.id, id));
  if (!imp) { res.status(404).json({ error: "Import tidak ditemukan" }); return; }

  // Delete related data rows
  if (imp.type === "performance") {
    await db.delete(performanceDataTable).where(eq(performanceDataTable.importId, id));
  } else if (imp.type === "funnel") {
    await db.delete(salesFunnelTable).where(eq(salesFunnelTable.importId, id));
  } else if (imp.type === "activity") {
    await db.delete(salesActivityTable).where(eq(salesActivityTable.importId, id));
  }

  // Delete import record
  await db.delete(dataImportsTable).where(eq(dataImportsTable.id, id));

  res.json({ success: true, message: `Import #${id} (${imp.type}) dan ${imp.rowsImported} baris datanya berhasil dihapus` });
});

export default router;

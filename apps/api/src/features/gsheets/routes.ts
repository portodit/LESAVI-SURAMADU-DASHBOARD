import { Router, type IRouter } from "express";
import { db, appSettingsTable } from "@workspace/db";
import { requireAuth } from "../../shared/auth";
import { runGSheetsSync, listAllSheets, syncSelectedSheets, extractSpreadsheetId } from "./sync";

const router: IRouter = Router();

// ── Manual sync trigger (all auto-detected sheets) ─────────────────────────────
router.post("/gsheets/sync", requireAuth, async (req, res): Promise<void> => {
  const result = await runGSheetsSync();
  res.json(result);
});

// ── Import selected sheets with explicit type ──────────────────────────────────
router.post("/gsheets/sync-selected", requireAuth, async (req, res): Promise<void> => {
  const { selections } = req.body as {
    selections: Array<{ title: string; sheetId: number; type: "funnel" | "activity" | "performance" }>;
  };
  if (!Array.isArray(selections) || selections.length === 0) {
    res.status(400).json({ error: "Pilih minimal satu sheet untuk diimport" });
    return;
  }
  const result = await syncSelectedSheets(selections);
  res.json(result);
});

// ── Preview all available sheets (with auto-detection hints) ───────────────────
router.get("/gsheets/sheets", requireAuth, async (req, res): Promise<void> => {
  const [settings] = await db.select().from(appSettingsTable);
  if (!settings?.gSheetsSpreadsheetId || !settings?.gSheetsApiKey) {
    res.status(400).json({ error: "Spreadsheet ID atau API Key belum dikonfigurasi" });
    return;
  }
  try {
    const sheets = await listAllSheets(extractSpreadsheetId(settings.gSheetsSpreadsheetId), settings.gSheetsApiKey);
    res.json({ sheets });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

// ── Last sync result ──────────────────────────────────────────────────────────
router.get("/gsheets/sync-status", requireAuth, async (req, res): Promise<void> => {
  const [settings] = await db.select().from(appSettingsTable);
  if (!settings) { res.json({ configured: false }); return; }
  res.json({
    configured: !!(settings.gSheetsSpreadsheetId && settings.gSheetsApiKey),
    syncEnabled: settings.gSheetsSyncEnabled,
    syncHourWib: settings.gSheetsSyncHourWib,
    syncIntervalDays: settings.gSheetsSyncIntervalDays,
    lastSyncAt: settings.gSheetsLastSyncAt?.toISOString() ?? null,
    lastSyncResult: settings.gSheetsLastSyncResult ? JSON.parse(settings.gSheetsLastSyncResult) : null,
  });
});

export default router;

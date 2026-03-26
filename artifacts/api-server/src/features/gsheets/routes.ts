import { Router, type IRouter } from "express";
import { db, appSettingsTable } from "@workspace/db";
import { requireAuth } from "../../shared/auth";
import { runGSheetsSync, listFunnelSheets } from "./sync";

const router: IRouter = Router();

// ── Manual sync trigger ────────────────────────────────────────────────────────
router.post("/gsheets/sync", requireAuth, async (req, res): Promise<void> => {
  const result = await runGSheetsSync();
  res.json(result);
});

// ── Preview available sheets (without importing) ────────────────────────────────
router.get("/gsheets/sheets", requireAuth, async (req, res): Promise<void> => {
  const [settings] = await db.select().from(appSettingsTable);
  if (!settings?.gSheetsSpreadsheetId || !settings?.gSheetsApiKey) {
    res.status(400).json({ error: "Spreadsheet ID atau API Key belum dikonfigurasi" });
    return;
  }
  try {
    const pattern = settings.gSheetsFunnelPattern || "TREG3_SALES_FUNNEL_";
    const sheets = await listFunnelSheets(settings.gSheetsSpreadsheetId, settings.gSheetsApiKey, pattern);
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

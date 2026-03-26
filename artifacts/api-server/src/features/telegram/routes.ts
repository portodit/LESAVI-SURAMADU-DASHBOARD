import { Router, type IRouter } from "express";
import { db, telegramLogsTable, accountManagersTable, appSettingsTable, telegramBotUsersTable, dataImportsTable } from "@workspace/db";
import { eq, desc, inArray } from "drizzle-orm";
import { requireAuth } from "../../shared/auth";
import { sendReminderToAllAMs, sendToTelegram } from "../telegram/service";
import { getBotUsers, pollOnce } from "./poller";
import crypto from "crypto";

const router: IRouter = Router();

router.post("/telegram/send", requireAuth, async (req, res): Promise<void> => {
  const { targetNiks, period, includePerformance, includeFunnel, includeActivity, customMessage,
          perfSnapshotId, funnelCurrSnapshotId, funnelPrevSnapshotId, activitySnapshotId } = req.body;

  let effectivePeriod = period as string | undefined;

  // Derive period from funnel or activity snapshot if not explicitly provided
  if (!effectivePeriod && (includeFunnel || includeActivity)) {
    const snapId = funnelCurrSnapshotId || activitySnapshotId;
    if (snapId) {
      const [snap] = await db.select({ period: dataImportsTable.period }).from(dataImportsTable).where(eq(dataImportsTable.id, Number(snapId)));
      effectivePeriod = snap?.period ?? "";
    }
  }

  if (!effectivePeriod) { res.status(400).json({ error: "Period diperlukan — pilih snapshot atau atur periode laporan" }); return; }

  const result = await sendReminderToAllAMs(
    effectivePeriod,
    { includePerformance: !!includePerformance, includeFunnel: !!includeFunnel, includeActivity: !!includeActivity },
    targetNiks || undefined
  );
  res.json(result);
});

router.get("/telegram/logs", requireAuth, async (req, res): Promise<void> => {
  const logs = await db.select().from(telegramLogsTable).orderBy(desc(telegramLogsTable.createdAt)).limit(100);
  res.json(logs.map(l => ({ ...l, createdAt: l.createdAt.toISOString() })));
});

router.post("/telegram/register-code", requireAuth, async (req, res): Promise<void> => {
  const { amId } = req.body;
  if (!amId) { res.status(400).json({ error: "amId diperlukan" }); return; }

  const [existing] = await db.select().from(accountManagersTable).where(eq(accountManagersTable.id, amId));
  if (!existing) { res.status(404).json({ error: "AM tidak ditemukan" }); return; }

  const code = `LESAVI-${existing.nik}`;
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.update(accountManagersTable).set({
    telegramCode: code,
    telegramCodeExpiry: expiry,
  }).where(eq(accountManagersTable.id, amId));

  res.json({ code, expiresAt: expiry.toISOString() });
});

// GET /api/telegram/updates — Return combined list of:
// 1. AMs already linked in DB (telegramChatId != null) — always visible after restart
// 2. Any new unlinked users who sent messages since the server last started (in-memory)
router.get("/telegram/updates", requireAuth, async (req, res): Promise<void> => {
  try {
    const botUsers = getBotUsers(); // in-memory: users seen since last restart
    const dbBotUsers = await db.select().from(telegramBotUsersTable); // persisted across restarts
    const ams = await db.select().from(accountManagersTable);

    // Build map of chatId → AM info for AMs already linked
    const linkedAms = ams.filter(a => a.telegramChatId);
    const amByChatId = new Map(
      linkedAms.map(a => [a.telegramChatId!, { nik: a.nik, nama: a.nama, id: a.id }])
    );

    // Start with DB-persisted users (survive server restarts)
    const subscriberMap = new Map<string, any>();
    for (const u of dbBotUsers) {
      subscriberMap.set(u.chatId, {
        chatId: u.chatId,
        firstName: u.firstName,
        lastName: u.lastName,
        username: u.username,
        lastMessage: u.lastMessage,
        lastSeen: u.lastSeen?.toISOString() ?? null,
        linked: amByChatId.has(u.chatId),
        linkedNik: amByChatId.get(u.chatId)?.nik ?? null,
        linkedNama: amByChatId.get(u.chatId)?.nama ?? null,
        linkedAmId: amByChatId.get(u.chatId)?.id ?? null,
      });
    }
    // Merge in-memory (more recent data wins)
    for (const u of botUsers) {
      subscriberMap.set(u.chatId, {
        chatId: u.chatId,
        firstName: u.firstName,
        lastName: u.lastName,
        username: u.username,
        lastMessage: u.lastMessage,
        lastSeen: u.lastSeen,
        linked: amByChatId.has(u.chatId),
        linkedNik: amByChatId.get(u.chatId)?.nik ?? null,
        linkedNama: amByChatId.get(u.chatId)?.nama ?? null,
        linkedAmId: amByChatId.get(u.chatId)?.id ?? null,
      });
    }

    // Also include AMs already linked in DB, even if they haven't sent a message since restart
    for (const am of linkedAms) {
      if (!subscriberMap.has(am.telegramChatId!)) {
        subscriberMap.set(am.telegramChatId!, {
          chatId: am.telegramChatId!,
          firstName: am.nama, // use AM name as fallback
          lastName: "",
          username: "",
          lastMessage: "(sudah terhubung sebelumnya)",
          lastSeen: null,
          linked: true,
          linkedNik: am.nik,
          linkedNama: am.nama,
          linkedAmId: am.id,
        });
      }
    }

    const subscribers = [...subscriberMap.values()];
    res.json({ subscribers, totalUpdates: subscribers.length });
  } catch {
    res.status(500).json({ error: "Gagal membaca data pengguna bot" });
  }
});

// POST /api/telegram/sync-now — Trigger an immediate poll of Telegram getUpdates
router.post("/telegram/sync-now", requireAuth, async (_req, res): Promise<void> => {
  try {
    await pollOnce();
    res.json({ ok: true, message: "Sinkronisasi berhasil" });
  } catch {
    res.status(500).json({ error: "Gagal sinkronisasi dengan Telegram" });
  }
});

// POST /api/telegram/link-am — Manually link a chatId to an AM
router.post("/telegram/link-am", requireAuth, async (req, res): Promise<void> => {
  const { amId, chatId } = req.body;
  if (!amId || !chatId) { res.status(400).json({ error: "amId dan chatId wajib diisi" }); return; }

  const [am] = await db.update(accountManagersTable)
    .set({ telegramChatId: String(chatId), telegramCode: null, telegramCodeExpiry: null })
    .where(eq(accountManagersTable.id, Number(amId)))
    .returning();

  if (!am) { res.status(404).json({ error: "AM tidak ditemukan" }); return; }

  const [settings] = await db.select().from(appSettingsTable);
  if (settings?.telegramBotToken) {
    try {
      await sendToTelegram(settings.telegramBotToken, String(chatId),
        `✅ *Berhasil terhubung!*\n\nHalo, *${am.nama}*! 👋\nAkun kamu sudah dihubungkan ke Bot RLEGS Suramadu oleh admin.`
      );
    } catch { /* ignore */ }
  }

  res.json({ ...am, telegramConnected: true, createdAt: am.createdAt.toISOString() });
});

// POST /api/telegram/bulk-generate-codes — Generate codes for all unconnected AMs
router.post("/telegram/bulk-generate-codes", requireAuth, async (req, res): Promise<void> => {
  const ams = await db.select().from(accountManagersTable).orderBy(accountManagersTable.nama);
  const unconnected = ams.filter(a => !a.telegramChatId);

  const results = [];
  for (const am of unconnected) {
    const code = `LESAVI-${am.nik}`;
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 jam
    await db.update(accountManagersTable)
      .set({ telegramCode: code, telegramCodeExpiry: expiry })
      .where(eq(accountManagersTable.id, am.id));
    results.push({ nama: am.nama, nik: am.nik, divisi: am.divisi, code, expiresAt: expiry.toISOString() });
  }

  res.json({ results, total: results.length });
});

// DELETE /api/telegram/unlink-am/:id — Remove telegram link from AM
router.delete("/telegram/unlink-am/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const [am] = await db.update(accountManagersTable)
    .set({ telegramChatId: null })
    .where(eq(accountManagersTable.id, id))
    .returning();
  if (!am) { res.status(404).json({ error: "AM tidak ditemukan" }); return; }
  res.json({ ok: true });
});

// DELETE /api/telegram/unlink-all — Bulk unlink selected or all AMs
router.delete("/telegram/unlink-all", requireAuth, async (req, res): Promise<void> => {
  const { amIds } = req.body;
  if (Array.isArray(amIds) && amIds.length > 0) {
    await db.update(accountManagersTable)
      .set({ telegramChatId: null })
      .where(inArray(accountManagersTable.id, amIds.map(Number)));
  } else {
    await db.update(accountManagersTable).set({ telegramChatId: null });
  }
  res.json({ ok: true });
});

// POST /api/telegram/gen-link/:amId — Generate magic deeplink for an AM
router.post("/telegram/gen-link/:amId", requireAuth, async (req, res): Promise<void> => {
  const amId = parseInt(req.params.amId as string, 10);
  if (!amId) { res.status(400).json({ error: "amId tidak valid" }); return; }

  const [existing] = await db.select().from(accountManagersTable).where(eq(accountManagersTable.id, amId));
  if (!existing) { res.status(404).json({ error: "AM tidak ditemukan" }); return; }

  const code = `LESAVI-${existing.nik}`;
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 jam

  await db.update(accountManagersTable)
    .set({ telegramCode: code, telegramCodeExpiry: expiry })
    .where(eq(accountManagersTable.id, amId));

  const [settings] = await db.select().from(appSettingsTable);
  let botUsername: string | null = null;
  if (settings?.telegramBotToken) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${settings.telegramBotToken}/getMe`);
      const d = await r.json() as { ok: boolean; result?: { username: string } };
      botUsername = d.result?.username ?? null;
    } catch { /* ignore */ }
  }

  const link = botUsername ? `https://t.me/${botUsername}?start=${code}` : null;
  res.json({ code, link, expiresAt: expiry.toISOString(), botUsername });
});

// POST /api/telegram/gen-links-bulk — Generate magic links for all non-DGS AMs at once
router.post("/telegram/gen-links-bulk", requireAuth, async (req, res): Promise<void> => {
  const [settings] = await db.select().from(appSettingsTable);
  let botUsername: string | null = null;
  if (settings?.telegramBotToken) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${settings.telegramBotToken}/getMe`);
      const d = await r.json() as { ok: boolean; result?: { username: string } };
      botUsername = d.result?.username ?? null;
    } catch { /* ignore */ }
  }

  const allAms = await db.select().from(accountManagersTable);
  const nonDgsAms = allAms.filter(a => a.divisi !== "DGS");

  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const results = await Promise.all(nonDgsAms.map(async am => {
    const code = `LESAVI-${am.nik}`;
    await db.update(accountManagersTable)
      .set({ telegramCode: code, telegramCodeExpiry: expiry })
      .where(eq(accountManagersTable.id, am.id));
    const link = botUsername ? `https://t.me/${botUsername}?start=${code}` : null;
    return { amId: am.id, nama: am.nama, nik: am.nik, divisi: am.divisi, link, code, connected: !!am.telegramChatId };
  }));

  res.json({ botUsername, expiresAt: expiry.toISOString(), results });
});

// GET /api/telegram/bot-status — Check if bot token is valid
router.get("/telegram/bot-status", requireAuth, async (req, res): Promise<void> => {
  const [settings] = await db.select().from(appSettingsTable);
  if (!settings?.telegramBotToken) {
    res.json({ connected: false, botName: null, botUsername: null });
    return;
  }

  try {
    const resp = await fetch(`https://api.telegram.org/bot${settings.telegramBotToken}/getMe`);
    const data = await resp.json() as { ok: boolean; result?: { first_name: string; username: string }; description?: string };
    if (data.ok && data.result) {
      res.json({ connected: true, botName: data.result.first_name, botUsername: data.result.username });
    } else {
      res.json({ connected: false, botName: null, botUsername: null, error: data.description });
    }
  } catch {
    res.json({ connected: false, botName: null, botUsername: null });
  }
});

export default router;

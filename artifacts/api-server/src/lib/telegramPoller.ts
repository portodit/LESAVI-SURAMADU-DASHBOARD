import { db, accountManagersTable, appSettingsTable, telegramBotUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendToTelegram } from "./telegram";
import { logger } from "./logger";

let lastUpdateId = 0;
let pollerTimer: ReturnType<typeof setTimeout> | null = null;

// In-memory store of all users who have ever interacted with the bot.
// Persists for the lifetime of the server process.
export interface BotUser {
  chatId: string;
  firstName: string;
  lastName: string;
  username: string;
  lastMessage: string;
  lastSeen: string; // ISO date string
}
const botUsersMap = new Map<string, BotUser>();

export function getBotUsers(): BotUser[] {
  return [...botUsersMap.values()].sort(
    (a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
  );
}

async function upsertBotUser(user: BotUser) {
  botUsersMap.set(user.chatId, user);
  try {
    await db.insert(telegramBotUsersTable).values({
      chatId: user.chatId,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      lastMessage: user.lastMessage,
      lastSeen: new Date(user.lastSeen),
    }).onConflictDoUpdate({
      target: telegramBotUsersTable.chatId,
      set: {
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        lastMessage: user.lastMessage,
        lastSeen: new Date(user.lastSeen),
      },
    });
  } catch (err) {
    logger.debug({ err }, "Failed to persist bot user to DB (non-fatal)");
  }
}

export async function pollOnce() {
  try {
    const [settings] = await db.select().from(appSettingsTable);
    if (!settings?.telegramBotToken) return;

    const token = settings.telegramBotToken;
    const offset = lastUpdateId > 0 ? lastUpdateId + 1 : 0;
    const url = `https://api.telegram.org/bot${token}/getUpdates?limit=50&offset=${offset}&timeout=0`;

    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return;

    const data = await resp.json() as { ok: boolean; result: any[] };
    if (!data.ok || !data.result.length) return;

    for (const update of data.result) {
      if (update.update_id > lastUpdateId) lastUpdateId = update.update_id;

      const msg = update.message;
      if (!msg) continue;

      const chatId = String(msg.chat.id);
      const firstName = msg.from?.first_name || msg.chat?.first_name || "";
      const lastName = msg.from?.last_name || msg.chat?.last_name || "";
      const username = msg.from?.username || "";
      const text = (msg.text || "").trim();

      // Always record this user in the in-memory store AND persist to DB
      await upsertBotUser({
        chatId,
        firstName,
        lastName,
        username,
        lastMessage: text.slice(0, 80),
        lastSeen: new Date().toISOString(),
      });

      if (text.startsWith("/start")) {
        const deepLinkCode = text.slice(6).trim();
        if (/^\d{6}$/.test(deepLinkCode)) {
          // Magic link: /start CODE — treat same as sending code directly
          const now = new Date();
          const [am] = await db.select().from(accountManagersTable)
            .where(eq(accountManagersTable.telegramCode, deepLinkCode));
          if (!am) {
            await sendToTelegram(token, chatId, `❌ Link tidak valid atau sudah kadaluarsa.\n\nMinta admin untuk generate link baru.`).catch(() => {});
          } else if (!am.telegramCodeExpiry || am.telegramCodeExpiry <= now) {
            await sendToTelegram(token, chatId, `⏰ Link sudah kadaluarsa.\n\nMinta admin untuk generate link baru.`).catch(() => {});
          } else {
            await db.update(accountManagersTable)
              .set({ telegramChatId: chatId, telegramCode: null, telegramCodeExpiry: null })
              .where(eq(accountManagersTable.id, am.id));
            await upsertBotUser({ ...botUsersMap.get(chatId)!, lastMessage: "✅ Linked via link" });
            await sendToTelegram(token, chatId,
              `✅ *Berhasil terhubung!*\n\nHalo, *${am.nama}*! 👋\nDivisi: ${am.divisi}\n\nAkun Telegram kamu sudah terhubung ke Bot RLEGS Suramadu.\nKamu akan menerima notifikasi performa secara otomatis dari admin.`
            ).catch(() => {});
            logger.info({ amId: am.id, nama: am.nama, chatId }, "AM auto-linked via magic link");
          }
          continue;
        }
        // Regular /start without code
        await sendToTelegram(token, chatId,
          `👋 Halo, *${firstName}*! Ini adalah Bot RLEGS AM Reminder Suramadu.\n\n` +
          `🆔 *Chat ID kamu:* \`${chatId}\`\n` +
          `_(Bagikan ID ini ke admin jika ingin dihubungkan secara manual)_\n\n` +
          `Jika kamu memiliki kode verifikasi, kirimkan kode 6 digit tersebut sekarang untuk menghubungkan akun kamu.\n\n` +
          `Jika belum punya kode, hubungi admin RLEGS.`
        ).catch(() => {});
        continue;
      }

      if (text === "/myid") {
        await sendToTelegram(token, chatId,
          `🆔 *Chat ID kamu:* \`${chatId}\`\n\nBagikan ID ini ke admin RLEGS untuk menghubungkan akun kamu ke sistem.`
        ).catch(() => {});
        continue;
      }

      if (/^\d{6}$/.test(text)) {
        const now = new Date();
        const [am] = await db.select().from(accountManagersTable)
          .where(eq(accountManagersTable.telegramCode, text));

        if (!am) {
          await sendToTelegram(token, chatId,
            `❌ Kode tidak ditemukan atau sudah tidak valid.\n\nMinta admin untuk generate kode baru.`
          ).catch(() => {});
        } else if (!am.telegramCodeExpiry || am.telegramCodeExpiry <= now) {
          await sendToTelegram(token, chatId,
            `⏰ Kode sudah kadaluarsa.\n\nMinta admin untuk generate kode baru.`
          ).catch(() => {});
        } else {
          await db.update(accountManagersTable)
            .set({ telegramChatId: chatId, telegramCode: null, telegramCodeExpiry: null })
            .where(eq(accountManagersTable.id, am.id));

          await upsertBotUser({ ...botUsersMap.get(chatId)!, lastMessage: "✅ Linked" });

          await sendToTelegram(token, chatId,
            `✅ *Berhasil terhubung!*\n\nHalo, *${am.nama}*! 👋\nDivisi: ${am.divisi}\n\nAkun Telegram kamu sudah terhubung ke Bot RLEGS Suramadu.\nKamu akan menerima notifikasi performa secara otomatis dari admin.`
          ).catch(() => {});

          logger.info({ amId: am.id, nama: am.nama, chatId }, "AM auto-linked via verification code");
        }
      }
    }
  } catch (err) {
    logger.debug({ err }, "Telegram poller error (non-fatal)");
  }
}

async function deleteWebhookIfAny(token: string) {
  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=false`);
    const data = await resp.json() as { ok: boolean };
    if (data.ok) logger.info("Telegram webhook deleted — using getUpdates polling");
  } catch {
    // non-fatal
  }
}

export function startTelegramPoller(intervalMs = 15000) {
  const run = async () => {
    await pollOnce();
    pollerTimer = setTimeout(run, intervalMs);
  };

  // Delete any active webhook first to avoid "conflict" errors,
  // then wait a moment before starting the polling loop
  db.select().from(appSettingsTable).then(([settings]) => {
    if (settings?.telegramBotToken) {
      deleteWebhookIfAny(settings.telegramBotToken).then(() => {
        logger.info({ intervalMs }, "Telegram background poller started");
        pollerTimer = setTimeout(run, 3000);
      });
    } else {
      logger.info({ intervalMs }, "Telegram background poller started (no token yet)");
      pollerTimer = setTimeout(run, 5000);
    }
  }).catch(() => {
    pollerTimer = setTimeout(run, 5000);
  });
}

export function stopTelegramPoller() {
  if (pollerTimer) { clearTimeout(pollerTimer); pollerTimer = null; }
}

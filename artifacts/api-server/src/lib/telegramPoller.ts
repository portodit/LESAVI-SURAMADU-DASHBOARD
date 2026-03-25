import { db, accountManagersTable, appSettingsTable, telegramBotUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendToTelegram, answerCallbackQuery, greetingByTime, buildTelegramMessages, getAvailablePerfPeriods } from "./telegram";
import { chatWithGemini, generateBasaBasi } from "./geminiChat";
import { logger } from "./logger";

let lastUpdateId = 0;
let pollerTimer: ReturnType<typeof setTimeout> | null = null;

export interface BotUser {
  chatId: string;
  firstName: string;
  lastName: string;
  username: string;
  lastMessage: string;
  lastSeen: string;
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
      chatId: user.chatId, firstName: user.firstName, lastName: user.lastName,
      username: user.username, lastMessage: user.lastMessage, lastSeen: new Date(user.lastSeen),
    }).onConflictDoUpdate({
      target: telegramBotUsersTable.chatId,
      set: { firstName: user.firstName, lastName: user.lastName, username: user.username,
             lastMessage: user.lastMessage, lastSeen: new Date(user.lastSeen) },
    });
  } catch (err) {
    logger.debug({ err }, "Failed to persist bot user (non-fatal)");
  }
}

const MAIN_KEYBOARD = {
  inline_keyboard: [
    [
      { text: "📋 Funneling",   callback_data: "/funneling"   },
      { text: "📅 Activity",    callback_data: "/activity"    },
    ],
    [
      { text: "📊 Performansi", callback_data: "/performansi" },
    ],
  ],
};

const MONTH_NAMES = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

// ── Message builders ────────────────────────────────────────────────────────

// Shared core body (features + warning + closing)
function buildCoreBody(): string {
  return (
    `Bot ini siap bantu kamu pantau 3 hal penting:\n\n` +
    `📋 *Sales Funneling*\n` +
    `Update & pergerakan LOP yang kamu handle, termasuk yang perlu segera ditindaklanjuti.\n\n` +
    `📅 *Sales Activity*\n` +
    `Pantauan KPI activity kamu — hanya aktivitas *Dengan Pelanggan* yang dihitung KPI ya kak.\n\n` +
    `📊 *Performansi Revenue*\n` +
    `Rekap capaian Revenue, Sustain, Scaling, dan NGTMA setiap periode.\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⚠️ *PENTING — Mohon Perhatikan!*\n\n` +
    `*Jangan di-mute apalagi hapus bot ini ya kak.* Bot hadir buat bantu kamu on track, pantau progress, dan ngejar target setiap periode. Tanpa notifikasi ini, kamu bisa ketinggalan info penting! 🎯\n\n` +
    `💪 Yuk segera menangkan LOP yang ada dan terus gali prospek proyek baru — rezeki nggak akan datang sendiri, semangat kak!\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Pilih menu di bawah untuk akses data:`
  );
}

// First-time linked welcome
async function buildWelcomeLinked(namaLengkap: string): Promise<string> {
  const greeting = greetingByTime();
  const basaBasi = await generateBasaBasi(namaLengkap);
  return (
    `✅ *Akun berhasil terhubung!* 🎉\n\n` +
    `Hai kak *${namaLengkap}*! 👋 ${greeting}\n\n` +
    `Selamat datang di *BOT LESA VI* — Witel Suramadu TREG 3! 🏢\n\n` +
    `${basaBasi}\n\n` +
    buildCoreBody()
  );
}

// Returning user /start
async function buildWelcomeReturning(namaLengkap: string): Promise<string> {
  const greeting = greetingByTime();
  const basaBasi = await generateBasaBasi(namaLengkap);
  return (
    `Hai kak *${namaLengkap}*! 👋 ${greeting}\n\n` +
    `Selamat datang kembali di *BOT LESA VI* — Witel Suramadu TREG 3! 🏢\n\n` +
    `${basaBasi}\n\n` +
    buildCoreBody()
  );
}

// First-time unlinked /start
function buildWelcomeUnlinked(firstName: string, chatId: string): string {
  return (
    `Halo *${firstName}*! 👋\n\n` +
    `Saya Bot LESA VI — AM Reminder Witel Suramadu TREG 3.\n\n` +
    `Untuk terhubung ke sistem, klik *link verifikasi* yang dikirimkan admin kepadamu. Atau bagikan ID berikut ke admin untuk dihubungkan secara manual:\n\n` +
    `🆔 *Chat ID kamu:* \`${chatId}\`\n\n` +
    `Belum dapat link? Hubungi admin LESA VI.`
  );
}

// Get current YYYY-MM period
function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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

      // ── callback_query (inline keyboard buttons) ────────────────────────
      if (update.callback_query) {
        const cb = update.callback_query;
        const cbChatId = String(cb.message?.chat?.id || cb.from?.id || "");
        const cbData = (cb.data || "").trim();
        await answerCallbackQuery(token, cb.id);
        if (!cbChatId) continue;

        const [linkedAm] = await db.select().from(accountManagersTable)
          .where(eq(accountManagersTable.telegramChatId, cbChatId));

        if (!linkedAm) {
          await sendToTelegram(token, cbChatId, `❌ Akun kamu belum terhubung. Minta admin untuk generate link verifikasi.`).catch(() => {});
          continue;
        }

        const amFirstName = linkedAm.nama.split(" ")[0];

        // ── Funneling & Activity (unchanged) ────────────────────────────
        if (cbData === "/funneling" || cbData === "/activity") {
          const period = currentPeriod();
          const opts = { includePerformance: false, includeFunnel: cbData === "/funneling", includeActivity: cbData === "/activity" };
          const msgs = await buildTelegramMessages(linkedAm.nik, period, opts);
          for (const m of msgs) await sendToTelegram(token, cbChatId, m).catch(() => {});
          if (!msgs.length) await sendToTelegram(token, cbChatId, `Belum ada data untuk periode ini kak *${amFirstName}*.`).catch(() => {});
          continue;
        }

        // ── Performansi: show period picker ─────────────────────────────
        if (cbData === "/performansi") {
          const now = new Date();
          const displayMonth = `${MONTH_NAMES[now.getMonth() + 1]} ${now.getFullYear()}`;
          const pickerKeyboard = {
            inline_keyboard: [
              [{ text: `📅 Bulan Terkini (${displayMonth})`, callback_data: "perf:current" }],
              [{ text: "🗓 Pilih Bulan Lain", callback_data: "perf:menu" }],
            ],
          };
          await sendToTelegram(token, cbChatId,
            `📊 *Performansi Revenue*\n\nMau lihat rekap performansi bulan apa, kak *${amFirstName}*?`,
            pickerKeyboard
          ).catch(() => {});
          continue;
        }

        // ── perf:current — current month, snapshot-aware ─────────────────
        if (cbData === "perf:current") {
          const period = currentPeriod();
          const msgs = await buildTelegramMessages(linkedAm.nik, period, { includePerformance: true, includeFunnel: false, includeActivity: false });
          for (const m of msgs) await sendToTelegram(token, cbChatId, m).catch(() => {});
          if (!msgs.length) {
            const now = new Date();
            await sendToTelegram(token, cbChatId,
              `_Data performansi untuk *${MONTH_NAMES[now.getMonth() + 1]} ${now.getFullYear()}* belum tersedia kak *${amFirstName}*. Mungkin belum diimport bulan ini._`
            ).catch(() => {});
          }
          continue;
        }

        // ── perf:menu — show available month buttons ──────────────────────
        if (cbData === "perf:menu") {
          const periods = await getAvailablePerfPeriods(linkedAm.nik);
          if (!periods.length) {
            await sendToTelegram(token, cbChatId, `❌ Belum ada data performansi tersimpan untuk akun kamu kak *${amFirstName}*.`).catch(() => {});
            continue;
          }
          const SHORT_MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
          const buttons = periods.map(p => ({
            text: `${SHORT_MONTHS[p.bulan]} ${p.tahun}`,
            callback_data: `perf:${p.tahun}-${String(p.bulan).padStart(2, "0")}`,
          }));
          const rows: typeof buttons[] = [];
          for (let i = 0; i < buttons.length; i += 3) rows.push(buttons.slice(i, i + 3));
          await sendToTelegram(token, cbChatId,
            `🗓 *Pilih Periode Performansi*\n\nSilakan pilih bulan yang ingin kamu lihat kak *${amFirstName}*:`,
            { inline_keyboard: rows }
          ).catch(() => {});
          continue;
        }

        // ── perf:YYYY-MM — specific period, snapshot-aware ────────────────
        if (cbData.startsWith("perf:")) {
          const periodStr = cbData.slice(5);
          if (/^\d{4}-\d{2}$/.test(periodStr)) {
            const msgs = await buildTelegramMessages(linkedAm.nik, periodStr, { includePerformance: true, includeFunnel: false, includeActivity: false });
            for (const m of msgs) await sendToTelegram(token, cbChatId, m).catch(() => {});
            if (!msgs.length) {
              const [yr, mo] = periodStr.split("-").map(Number);
              await sendToTelegram(token, cbChatId,
                `_Data performansi untuk *${MONTH_NAMES[mo]} ${yr}* tidak ditemukan kak *${amFirstName}*._`
              ).catch(() => {});
            }
          }
          continue;
        }

        continue;
      }

      // ── Regular messages ───────────────────────────────────────────────
      const msg = update.message;
      if (!msg) continue;

      const chatId = String(msg.chat.id);
      const firstName = msg.from?.first_name || msg.chat?.first_name || "";
      const lastName = msg.from?.last_name || msg.chat?.last_name || "";
      const username = msg.from?.username || "";
      const text = (msg.text || "").trim();

      await upsertBotUser({
        chatId, firstName, lastName, username,
        lastMessage: text.slice(0, 80),
        lastSeen: new Date().toISOString(),
      });

      const isVerifCode = (s: string) => /^\d{6}$/.test(s) || /^ES-LESA-VI-\d+$/i.test(s);

      const tryLinkByCode = async (code: string, source: string) => {
        const now = new Date();
        const [am] = await db.select().from(accountManagersTable)
          .where(eq(accountManagersTable.telegramCode, code));
        if (!am) {
          await sendToTelegram(token, chatId, `❌ Link/kode tidak valid atau sudah kadaluarsa.\n\nMinta admin untuk generate link baru.`).catch(() => {});
          return false;
        }
        if (!am.telegramCodeExpiry || am.telegramCodeExpiry <= now) {
          await sendToTelegram(token, chatId, `⏰ Link sudah kadaluarsa.\n\nMinta admin untuk generate link baru.`).catch(() => {});
          return false;
        }
        await db.update(accountManagersTable)
          .set({ telegramChatId: chatId, telegramCode: null, telegramCodeExpiry: null })
          .where(eq(accountManagersTable.id, am.id));
        await upsertBotUser({ ...botUsersMap.get(chatId)!, lastMessage: `✅ Linked via ${source}` });
        await sendToTelegram(token, chatId, await buildWelcomeLinked(am.nama), MAIN_KEYBOARD).catch(() => {});
        logger.info({ amId: am.id, nama: am.nama, chatId, source }, "AM auto-linked");
        return true;
      };

      // /start
      if (text.startsWith("/start")) {
        const deepLinkCode = text.slice(6).trim();
        if (isVerifCode(deepLinkCode)) {
          await tryLinkByCode(deepLinkCode, "magic link");
          continue;
        }
        const [linkedAm] = await db.select().from(accountManagersTable)
          .where(eq(accountManagersTable.telegramChatId, chatId));
        if (linkedAm) {
          await sendToTelegram(token, chatId, await buildWelcomeReturning(linkedAm.nama), MAIN_KEYBOARD).catch(() => {});
        } else {
          await sendToTelegram(token, chatId, buildWelcomeUnlinked(firstName, chatId)).catch(() => {});
        }
        continue;
      }

      // /myid
      if (text === "/myid") {
        await sendToTelegram(token, chatId,
          `🆔 *Chat ID kamu:* \`${chatId}\`\n\nBagikan ID ini ke admin LESA VI untuk menghubungkan akun kamu ke sistem.`
        ).catch(() => {});
        continue;
      }

      // Text shortcuts
      if (["/funneling", "/activity", "/performansi"].includes(text)) {
        const [linkedAm] = await db.select().from(accountManagersTable)
          .where(eq(accountManagersTable.telegramChatId, chatId));
        if (!linkedAm) {
          await sendToTelegram(token, chatId, `❌ Akun kamu belum terhubung. Minta admin untuk generate link verifikasi.`).catch(() => {});
          continue;
        }
        const amFirstName = linkedAm.nama.split(" ")[0];

        // /performansi → show period picker
        if (text === "/performansi") {
          const now = new Date();
          const displayMonth = `${MONTH_NAMES[now.getMonth() + 1]} ${now.getFullYear()}`;
          const pickerKeyboard = {
            inline_keyboard: [
              [{ text: `📅 Bulan Terkini (${displayMonth})`, callback_data: "perf:current" }],
              [{ text: "🗓 Pilih Bulan Lain", callback_data: "perf:menu" }],
            ],
          };
          await sendToTelegram(token, chatId,
            `📊 *Performansi Revenue*\n\nMau lihat rekap performansi bulan apa, kak *${amFirstName}*?`,
            pickerKeyboard
          ).catch(() => {});
          continue;
        }

        const period = currentPeriod();
        const opts = { includePerformance: false, includeFunnel: text === "/funneling", includeActivity: text === "/activity" };
        const msgs = await buildTelegramMessages(linkedAm.nik, period, opts);
        for (const m of msgs) await sendToTelegram(token, chatId, m).catch(() => {});
        if (!msgs.length) await sendToTelegram(token, chatId, `Belum ada data untuk periode ini kak *${amFirstName}*.`).catch(() => {});
        continue;
      }

      // Verification code
      if (isVerifCode(text)) {
        await tryLinkByCode(text, "manual code");
        continue;
      }

      // ── AI chat for all other messages ─────────────────────────────────
      if (text && !text.startsWith("/")) {
        const [linkedAm] = await db.select().from(accountManagersTable)
          .where(eq(accountManagersTable.telegramChatId, chatId));

        const aiReply = await chatWithGemini(text, {
          amName: linkedAm?.nama,
          divisi: linkedAm?.divisi,
        });

        if (aiReply) {
          await sendToTelegram(token, chatId, aiReply).catch(() => {});
        } else if (!linkedAm) {
          await sendToTelegram(token, chatId,
            `Halo kak! Untuk bisa menggunakan bot ini, kamu perlu terhubung ke sistem dulu ya.\n\nKetik /myid untuk dapat Chat ID kamu.`
          ).catch(() => {});
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
  } catch { /* non-fatal */ }
}

export function startTelegramPoller(intervalMs = 15000) {
  const run = async () => {
    await pollOnce();
    pollerTimer = setTimeout(run, intervalMs);
  };
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
  }).catch(() => { pollerTimer = setTimeout(run, 5000); });
}

export function stopTelegramPoller() {
  if (pollerTimer) { clearTimeout(pollerTimer); pollerTimer = null; }
}

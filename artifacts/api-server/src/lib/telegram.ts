import { db, appSettingsTable, accountManagersTable, performanceDataTable, salesFunnelTable, salesActivityTable, telegramLogsTable, dataImportsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "./logger";

const MONTH_NAMES = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

// ── Snapshot-aware helpers ──────────────────────────────────────────────────

// Get performance rows for a period: try latest snapshot first, fallback to all snapshots
async function getSnapshotAwarePerfs(year: number, month: number) {
  const [latestImport] = await db.select()
    .from(dataImportsTable)
    .where(eq(dataImportsTable.type, "performance"))
    .orderBy(desc(dataImportsTable.createdAt))
    .limit(1);

  if (latestImport) {
    const fromLatest = await db.select().from(performanceDataTable)
      .where(and(
        eq(performanceDataTable.importId, latestImport.id),
        eq(performanceDataTable.tahun, year),
        eq(performanceDataTable.bulan, month),
      ));
    if (fromLatest.length > 0) return fromLatest;
  }

  // Fallback: any data for that period across all snapshots
  return db.select().from(performanceDataTable)
    .where(and(eq(performanceDataTable.tahun, year), eq(performanceDataTable.bulan, month)));
}

// Get distinct periods that have data for a given NIK, ordered newest first
export async function getAvailablePerfPeriods(nik: string): Promise<{ tahun: number; bulan: number }[]> {
  const rows = await db.selectDistinct({
    tahun: performanceDataTable.tahun,
    bulan: performanceDataTable.bulan,
  }).from(performanceDataTable)
    .where(eq(performanceDataTable.nik, nik));
  return rows.sort((a, b) => b.tahun !== a.tahun ? b.tahun - a.tahun : b.bulan - a.bulan);
}

// ── Formatting helpers ──────────────────────────────────────────────────────

function formatRupiah(val: number): string {
  if (val >= 1_000_000_000_000) return `Rp ${(val / 1_000_000_000_000).toFixed(2).replace(".", ",")} Triliun`;
  if (val >= 1_000_000_000) return `Rp ${(val / 1_000_000_000).toFixed(2).replace(".", ",")} Miliar`;
  if (val >= 1_000_000) return `Rp ${(val / 1_000_000).toFixed(2).replace(".", ",")} Juta`;
  if (val === 0) return `Rp 0`;
  return `Rp ${val.toLocaleString("id-ID")}`;
}

function fmtPct(val: number): string {
  return val.toFixed(2).replace(".", ",") + "%";
}

function achLabel(ach: number): string {
  if (ach >= 100) return "(Tercapai)";
  if (ach >= 80) return "(Mendekati)";
  return "(Di bawah target)";
}

function greetingByTime(): string {
  const hourWib = (new Date().getUTCHours() + 7) % 24;
  if (hourWib >= 3 && hourWib < 11) return "Selamat pagi~";
  if (hourWib >= 11 && hourWib < 15) return "Selamat siang~";
  if (hourWib >= 15 && hourWib < 18) return "Selamat sore~";
  return "Selamat malam~";
}

function rankFeedback(firstName: string, rankCm: number, achCm: number): string {
  if (achCm >= 100) return `✅ Selamat kak ${firstName}! Target bulan ini sudah tercapai. Mantap sekali, pertahankan momentum ini di bulan depan!`;
  if (rankCm === 1) return `🥇 Luar biasa kak ${firstName}! Kamu jadi yang terbaik bulan ini di antara seluruh AM Witel Suramadu. Pertahankan terus ya!`;
  if (rankCm <= 3) return `🥈 Keren kak ${firstName}! Kamu masuk podium top 3 bulan ini. Tinggal sedikit lagi menuju puncak — tetap semangat!`;
  if (rankCm <= 10) return `⚡ Good job kak ${firstName}! Kamu sudah di kelompok atas. Terus tingkatkan dan podium bukan hal yang mustahil buat kamu!`;
  return `💪 Semangat kak ${firstName}! Masih ada waktu tersisa di bulan ini — yuk kejar targetnya!\nJangan ragu koordinasi dengan tim kalau butuh support ya 🙏`;
}

function getEmbedUrl(): string {
  const domain = process.env.REPLIT_DEV_DOMAIN;
  if (domain) return `https://${domain}/embed/performa`;
  return `https://rlegs-suramadu.replit.app/embed/performa`;
}

// --- BUILD FUNCTIONS: each returns ONE message string ---

async function buildPerformanceMessage(
  nik: string,
  period: string,
): Promise<string | null> {
  const [year, month] = period.split("-").map(Number);

  const [am] = await db.select().from(accountManagersTable).where(eq(accountManagersTable.nik, nik));
  if (!am) return null;

  const firstName = am.nama.split(" ")[0];

  // Fetch all AMs' performance data for this period — latest snapshot first, fallback to all
  const allPerfs = await getSnapshotAwarePerfs(year, month);

  const p = allPerfs.find(x => x.nik === nik);
  const totalAMs = allPerfs.length;

  // Both ranks computed dynamically from all AMs in this period
  const sortedByCm = [...allPerfs].sort((a, b) => (b.achRate || 0) - (a.achRate || 0));
  const rankCm = sortedByCm.findIndex(x => x.nik === nik) + 1;

  const sortedByYtd = [...allPerfs].sort((a, b) => (b.achRateYtd || 0) - (a.achRateYtd || 0));
  const rankYtd = sortedByYtd.findIndex(x => x.nik === nik) + 1;

  // Overall rates
  const achCm = p?.achRate || 0;
  const achYtd = p?.achRateYtd || 0;

  // Fetch YTD data for sub-categories: all months in same year up to this month
  const ytdPerfs = await db.select().from(performanceDataTable)
    .where(and(eq(performanceDataTable.nik, nik), eq(performanceDataTable.tahun, year)));
  const ytdUpTo = ytdPerfs.filter(x => x.bulan <= month);

  function sumYtdAch(realKey: keyof typeof ytdPerfs[0], targetKey: keyof typeof ytdPerfs[0]): number {
    const totalReal = ytdUpTo.reduce((s, x) => s + ((x[realKey] as number) || 0), 0);
    const totalTarget = ytdUpTo.reduce((s, x) => s + ((x[targetKey] as number) || 0), 0);
    return totalTarget > 0 ? (totalReal / totalTarget) * 100 : 0;
  }

  const achRegulerCm = (p?.targetReguler ?? 0) > 0 ? ((p?.realReguler ?? 0) / p!.targetReguler!) * 100 : 0;
  const achSustainCm = (p?.targetSustain ?? 0) > 0 ? ((p?.realSustain ?? 0) / p!.targetSustain!) * 100 : 0;
  const achScalingCm = (p?.targetScaling ?? 0) > 0 ? ((p?.realScaling ?? 0) / p!.targetScaling!) * 100 : 0;
  const achNgtmaCm   = (p?.targetNgtma ?? 0) > 0   ? ((p?.realNgtma ?? 0)   / p!.targetNgtma!)   * 100 : 0;

  const achRegulerYtd = sumYtdAch("realReguler", "targetReguler");
  const achSustainYtd = sumYtdAch("realSustain", "targetSustain");
  const achScalingYtd = sumYtdAch("realScaling", "targetScaling");
  const achNgtmaYtd   = sumYtdAch("realNgtma", "targetNgtma");

  const greeting = greetingByTime();
  const feedback = rankFeedback(firstName, rankCm, achCm);

  let msg = `📊 *LAPORAN PERFORMANSI AM*\n`;
  msg += `LESA VI — Witel Suramadu\n\n`;
  msg += `Halo kak ${firstName}! 👋 ${greeting}\n\n`;
  msg += `Berikut rekap performansi kamu\n`;
  msg += `untuk periode *${MONTH_NAMES[month]} ${year}*:\n\n`;

  // Section A: Reguler — with rank; order: Real → Target → Ach CM → Ach YTD → Rank CM → Rank YTD
  msg += `*A. Reguler Revenue*\n`;
  msg += `├ Real Revenue    : ${formatRupiah(p?.realReguler ?? 0)}\n`;
  msg += `├ Target Revenue  : ${formatRupiah(p?.targetReguler ?? 0)}\n`;
  msg += `├ Ach CM          : ${fmtPct(achRegulerCm)} ${achLabel(achRegulerCm)}\n`;
  msg += `├ Ach YTD         : ${fmtPct(achRegulerYtd)} ${achLabel(achRegulerYtd)}\n`;
  msg += `│   Rank CM       : #${rankCm} dari ${totalAMs}\n`;
  msg += `│   Rank YTD      : #${rankYtd} dari ${totalAMs}\n\n`;

  // Section B: Sustain
  msg += `*B. Sustain Revenue*\n`;
  msg += `├ Real Revenue    : ${formatRupiah(p?.realSustain ?? 0)}\n`;
  msg += `├ Target Sustain  : ${formatRupiah(p?.targetSustain ?? 0)}\n`;
  msg += `├ Ach CM          : ${fmtPct(achSustainCm)} ${achLabel(achSustainCm)}\n`;
  msg += `└ Ach YTD         : ${fmtPct(achSustainYtd)} ${achLabel(achSustainYtd)}\n\n`;

  // Section C: Scaling
  msg += `*C. Scaling Revenue*\n`;
  msg += `├ Real Revenue    : ${formatRupiah(p?.realScaling ?? 0)}\n`;
  msg += `├ Target Scaling  : ${formatRupiah(p?.targetScaling ?? 0)}\n`;
  msg += `├ Ach CM          : ${fmtPct(achScalingCm)} ${achLabel(achScalingCm)}\n`;
  msg += `└ Ach YTD         : ${fmtPct(achScalingYtd)} ${achLabel(achScalingYtd)}\n\n`;

  // Section D: NGTMA
  msg += `*D. NGTMA Revenue*\n`;
  msg += `├ Real Revenue    : ${formatRupiah(p?.realNgtma ?? 0)}\n`;
  msg += `├ Target NGTMA    : ${formatRupiah(p?.targetNgtma ?? 0)}\n`;
  msg += `├ Ach CM          : ${fmtPct(achNgtmaCm)} ${achLabel(achNgtmaCm)}\n`;
  msg += `└ Ach YTD         : ${fmtPct(achNgtmaYtd)} ${achLabel(achNgtmaYtd)}\n\n`;

  msg += `💬 *Feedback*\n\n`;
  msg += `${feedback}\n\n`;
  msg += `📎 *Detail lengkap:*\n`;
  msg += `${getEmbedUrl()}`;

  return msg;
}

async function buildFunnelMessage(nik: string): Promise<string | null> {
  const [am] = await db.select().from(accountManagersTable).where(eq(accountManagersTable.nik, nik));
  if (!am) return null;

  const firstName = am.nama.split(" ")[0];

  const lops = await db.select().from(salesFunnelTable).where(eq(salesFunnelTable.nikAm, nik));
  const activeLops = lops.filter(l => !["Won", "Lost"].includes(l.statusF || ""));
  const wonLops = lops.filter(l => l.statusF === "Won");
  const totalNilaiAktif = activeLops.reduce((s, l) => s + (l.nilaiProyek || 0), 0);
  const totalNilaiWon = wonLops.reduce((s, l) => s + (l.nilaiProyek || 0), 0);

  const greeting = greetingByTime();

  let msg = `📋 *SALES FUNNEL*\n`;
  msg += `LESA VI — Witel Suramadu\n\n`;
  msg += `Halo kak ${firstName}! 👋 ${greeting}\n\n`;
  msg += `Berikut status *Sales Funnel* kamu:\n\n`;
  msg += `LOP Aktif   : *${activeLops.length}* proyek\n`;
  msg += `Nilai Aktif : *${formatRupiah(totalNilaiAktif)}*\n`;
  msg += `LOP Won     : ${wonLops.length} proyek (${formatRupiah(totalNilaiWon)})\n\n`;

  if (activeLops.length > 0) {
    msg += `*Top LOP Aktif:*\n`;
    const top = activeLops.slice(0, 5);
    for (const lop of top) {
      msg += `• ${lop.namaProyek || "-"}\n  _${lop.statusF}_ · ${formatRupiah(lop.nilaiProyek || 0)}\n`;
    }
    if (activeLops.length > 5) msg += `_...dan ${activeLops.length - 5} proyek lainnya_\n`;
    msg += `\n`;
  } else {
    msg += `_Belum ada LOP aktif. Yuk tambah pipeline baru! 💡_\n\n`;
  }

  return msg;
}

async function buildActivityMessage(nik: string, period: string): Promise<string | null> {
  const [year, month] = period.split("-").map(Number);

  const [am] = await db.select().from(accountManagersTable).where(eq(accountManagersTable.nik, nik));
  if (!am) return null;

  const firstName = am.nama.split(" ")[0];

  const acts = await db.select().from(salesActivityTable).where(eq(salesActivityTable.nik, nik));
  const monthActs = acts.filter(a => a.activityEndDate?.startsWith(period));
  const achieved = monthActs.length >= am.kpiActivity;
  const remaining = am.kpiActivity - monthActs.length;
  const greeting = greetingByTime();

  let msg = `📌 *SALES ACTIVITY*\n`;
  msg += `LESA VI — Witel Suramadu\n\n`;
  msg += `Halo kak ${firstName}! 👋 ${greeting}\n\n`;
  msg += `Status *Sales Activity* — ${MONTH_NAMES[month]} ${year}:\n\n`;
  msg += `Activity   : *${monthActs.length}* / ${am.kpiActivity} KPI\n`;
  msg += `Status     : ${achieved ? `✅ KPI Tercapai!` : `⚠️ Belum tercapai — butuh *${remaining}* lagi`}\n\n`;

  if (!achieved && remaining <= 3) {
    msg += `_Hampir sampai, kak ${firstName}! Tinggal ${remaining} lagi 💪_\n\n`;
  } else if (!achieved) {
    msg += `_Yuk tambah activity kak ${firstName}, masih ada waktu! 🚀_\n\n`;
  }

  return msg;
}

// --- PUBLIC API ---

export async function buildTelegramMessages(
  nik: string,
  period: string,
  options: { includePerformance: boolean; includeFunnel: boolean; includeActivity: boolean }
): Promise<string[]> {
  const messages: string[] = [];

  if (options.includePerformance) {
    const m = await buildPerformanceMessage(nik, period);
    if (m) messages.push(m);
  }

  if (options.includeFunnel) {
    const m = await buildFunnelMessage(nik);
    if (m) messages.push(m);
  }

  if (options.includeActivity) {
    const m = await buildActivityMessage(nik, period);
    if (m) messages.push(m);
  }

  return messages;
}

/** @deprecated Use buildTelegramMessages (returns array) instead */
export async function buildTelegramMessage(
  nik: string,
  period: string,
  options: { includePerformance: boolean; includeFunnel: boolean; includeActivity: boolean }
): Promise<string> {
  const msgs = await buildTelegramMessages(nik, period, options);
  return msgs.join("\n\n");
}

export async function sendToTelegram(
  botToken: string,
  chatId: string,
  message: string,
  replyMarkup?: object
): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body: Record<string, unknown> = { chat_id: chatId, text: message, parse_mode: "Markdown" };
  if (replyMarkup) body.reply_markup = replyMarkup;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const data = await response.json() as { description?: string };
    throw new Error(data.description || "Telegram API error");
  }
}

export async function answerCallbackQuery(botToken: string, callbackQueryId: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  }).catch(() => {});
}

export { greetingByTime };

export async function sendReminderToAllAMs(
  period: string,
  options: { includePerformance: boolean; includeFunnel: boolean; includeActivity: boolean },
  targetNiks?: string[]
): Promise<{ sent: number; failed: number; skipped: number; details: { nik: string; namaAm: string; status: string; error?: string }[] }> {
  const [settings] = await db.select().from(appSettingsTable);
  if (!settings?.telegramBotToken) {
    return { sent: 0, failed: 0, skipped: 0, details: [] };
  }

  let ams = await db.select().from(accountManagersTable);
  if (targetNiks && targetNiks.length > 0) {
    ams = ams.filter(a => targetNiks.includes(a.nik));
  }

  let sent = 0, failed = 0, skipped = 0;
  const details: { nik: string; namaAm: string; status: string; error?: string }[] = [];

  for (const am of ams) {
    if (!am.telegramChatId) {
      skipped++;
      details.push({ nik: am.nik, namaAm: am.nama, status: "skipped" });
      continue;
    }

    try {
      // Build all messages for this AM — each type is a SEPARATE message
      const messages = await buildTelegramMessages(am.nik, period, options);
      if (!messages.length) {
        skipped++;
        details.push({ nik: am.nik, namaAm: am.nama, status: "skipped" });
        continue;
      }

      // Send each message individually with a small delay to avoid flood limits
      for (let i = 0; i < messages.length; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, 500));
        await sendToTelegram(settings.telegramBotToken!, am.telegramChatId, messages[i]);
      }

      sent++;
      details.push({ nik: am.nik, namaAm: am.nama, status: "sent" });

      await db.insert(telegramLogsTable).values({
        nik: am.nik, namaAm: am.nama, telegramChatId: am.telegramChatId,
        status: "sent", period, messageType: "reminder",
      });
    } catch (error) {
      failed++;
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      details.push({ nik: am.nik, namaAm: am.nama, status: "failed", error: errMsg });

      await db.insert(telegramLogsTable).values({
        nik: am.nik, namaAm: am.nama, telegramChatId: am.telegramChatId || null,
        status: "failed", period, messageType: "reminder", error: errMsg,
      });

      logger.error({ nik: am.nik, error: errMsg }, "Failed to send Telegram message");
    }
  }

  return { sent, failed, skipped, details };
}

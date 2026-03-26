import { db, appSettingsTable, accountManagersTable, performanceDataTable, salesFunnelTable, salesActivityTable, telegramLogsTable, dataImportsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "../../shared/logger";
import { generatePerfFeedback, generateBasaBasi, generateFunnelMotivation } from "./ai";

const MONTH_NAMES = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function formatSnapshotDate(snapshotDate: string | null | undefined, period: string | null | undefined, fallback: string = "-"): string {
  const raw = snapshotDate || period || "";
  if (!raw) return fallback;
  if (raw.length === 10) {
    // YYYY-MM-DD
    const [y, m, d] = raw.split("-").map(Number);
    if (y && m && d) return `${d} ${MONTH_NAMES[m] || m} ${y}`;
  }
  if (raw.length === 7) {
    // YYYY-MM
    const [y, m] = raw.split("-").map(Number);
    if (y && m) return `${MONTH_NAMES[m] || m} ${y}`;
  }
  return raw;
}

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
  if (domain) return `https://${domain}/presentation`;
  return `https://rlegs-suramadu.replit.app/presentation`;
}

function getFunnelDetailUrl(): string {
  const domain = process.env.REPLIT_DEV_DOMAIN;
  if (domain) return `https://${domain}/visualisasi/funnel`;
  return `https://rlegs-suramadu.replit.app/visualisasi/funnel`;
}

// ── Funnel helpers ──────────────────────────────────────────────────────────

function isFunnel5(status: string | null | undefined): boolean {
  return status === "F5" || status === "Won";
}

interface FunnelCounts { F0: number; F1: number; F2: number; F3: number; F4: number; F5: number }

function countByStatus(lops: { statusF?: string | null }[]): FunnelCounts {
  const counts: FunnelCounts = { F0: 0, F1: 0, F2: 0, F3: 0, F4: 0, F5: 0 };
  for (const l of lops) {
    const s = l.statusF || "";
    if (s === "F0") counts.F0++;
    else if (s === "F1") counts.F1++;
    else if (s === "F2") counts.F2++;
    else if (s === "F3") counts.F3++;
    else if (s === "F4") counts.F4++;
    else if (s === "F5" || s === "Won") counts.F5++;
  }
  return counts;
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

  // Detect zero-revenue condition: all real values are 0
  const totalReal = (p?.realReguler ?? 0) + (p?.realSustain ?? 0) + (p?.realScaling ?? 0) + (p?.realNgtma ?? 0);
  const noRealData = !p || totalReal === 0;

  // Only call AI for feedback when there's actual data (saves time on empty records)
  const fallbackFeedback = rankFeedback(firstName, rankCm, achCm);
  const feedback = noRealData
    ? null
    : await generatePerfFeedback(firstName, achCm, rankCm, totalAMs, MONTH_NAMES[month], year, fallbackFeedback);

  let msg = `📊 *LAPORAN PERFORMANSI ACCOUNT MANAGER*\n`;
  msg += `LESA VI — Witel Suramadu\n\n`;
  msg += `Halo kak *${firstName}*! 👋 ${greeting}\n\n`;
  msg += `Berikut rekap performansi kamu\n`;
  msg += `untuk periode *${MONTH_NAMES[month]} ${year}*:\n\n`;

  // Section A: Reguler — with rank
  msg += `*A. Reguler Revenue*\n`;
  msg += `├ *Real Revenue*   : ${formatRupiah(p?.realReguler ?? 0)}\n`;
  msg += `├ *Target Revenue* : ${formatRupiah(p?.targetReguler ?? 0)}\n`;
  msg += `├ *Ach CM*         : ${fmtPct(achRegulerCm)} ${achLabel(achRegulerCm)}\n`;
  msg += `├ *Ach YTD*        : ${fmtPct(achRegulerYtd)} ${achLabel(achRegulerYtd)}\n`;
  msg += `│   *Rank CM*      : #${rankCm} dari ${totalAMs}\n`;
  msg += `│   *Rank YTD*     : #${rankYtd} dari ${totalAMs}\n\n`;

  // Section B: Sustain
  msg += `*B. Sustain Revenue*\n`;
  msg += `├ *Real Revenue*   : ${formatRupiah(p?.realSustain ?? 0)}\n`;
  msg += `├ *Target Sustain* : ${formatRupiah(p?.targetSustain ?? 0)}\n`;
  msg += `├ *Ach CM*         : ${fmtPct(achSustainCm)} ${achLabel(achSustainCm)}\n`;
  msg += `└ *Ach YTD*        : ${fmtPct(achSustainYtd)} ${achLabel(achSustainYtd)}\n\n`;

  // Section C: Scaling
  msg += `*C. Scaling Revenue*\n`;
  msg += `├ *Real Revenue*   : ${formatRupiah(p?.realScaling ?? 0)}\n`;
  msg += `├ *Target Scaling* : ${formatRupiah(p?.targetScaling ?? 0)}\n`;
  msg += `├ *Ach CM*         : ${fmtPct(achScalingCm)} ${achLabel(achScalingCm)}\n`;
  msg += `└ *Ach YTD*        : ${fmtPct(achScalingYtd)} ${achLabel(achScalingYtd)}\n\n`;

  // Section D: NGTMA
  msg += `*D. NGTMA Revenue*\n`;
  msg += `├ *Real Revenue*   : ${formatRupiah(p?.realNgtma ?? 0)}\n`;
  msg += `├ *Target NGTMA*   : ${formatRupiah(p?.targetNgtma ?? 0)}\n`;
  msg += `├ *Ach CM*         : ${fmtPct(achNgtmaCm)} ${achLabel(achNgtmaCm)}\n`;
  msg += `└ *Ach YTD*        : ${fmtPct(achNgtmaYtd)} ${achLabel(achNgtmaYtd)}\n\n`;

  msg += `💬 *Feedback Performansi:*\n\n`;
  if (noRealData) {
    msg += `_Mohon maaf kak, sepertinya data revenue kamu untuk periode ini belum tercatat di sistem. Mohon menunggu info update terkait performa bulan ini ya — kami akan segera menginformasikan jika data sudah tersedia. 🙏_\n\n`;
  } else {
    msg += `${feedback}\n\n`;
  }
  msg += `📎 Untuk melihat performa lengkap kamu dan benchmarking dengan AM lain, silahkan akses link berikut:\n`;
  msg += `${getEmbedUrl()}`;

  return msg;
}

async function buildFunnelMessage(nik: string): Promise<string | null> {
  const [am] = await db.select().from(accountManagersTable).where(eq(accountManagersTable.nik, nik));
  if (!am) return null;

  // Get the 2 latest funnel import snapshots (newest first)
  const funnelImports = await db.select()
    .from(dataImportsTable)
    .where(eq(dataImportsTable.type, "funnel"))
    .orderBy(desc(dataImportsTable.createdAt))
    .limit(2);

  if (funnelImports.length === 0) return null;

  // All LOPs for this AM across all snapshots
  const allLops = await db.select().from(salesFunnelTable).where(eq(salesFunnelTable.nikAm, nik));

  const latestImport = funnelImports[0];
  const latestLops = allLops.filter(l => l.importId === latestImport.id);
  const counts = countByStatus(latestLops);
  const total = latestLops.length;
  const snapshotDateLatest = formatSnapshotDate(latestImport.snapshotDate, latestImport.period, latestImport.createdAt?.toISOString()?.slice(0, 10) || "-");

  const basaBasi = await generateBasaBasi(am.nama);

  // ── Kondisi C: Only 1 snapshot — no comparison possible ─────────────────
  if (funnelImports.length < 2) {
    let msg = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📋 *MONITORING SALES FUNNELING*\n`;
    msg += `LESA VI — Witel Suramadu\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `Halo kak *${am.nama}*! 👋\n\n`;
    msg += `_${basaBasi}_\n\n`;
    msg += `Berikut data funneling kakak per\n`;
    msg += `*${snapshotDateLatest}* ya kak 🙏\n\n`;
    msg += `📊 *Ringkasan LOP Kakak Saat Ini:*\n`;
    msg += `├ F0 (Lead)        : ${counts.F0} proyek\n`;
    msg += `├ F1 (Prospect)    : ${counts.F1} proyek\n`;
    msg += `├ F2 (Quote)       : ${counts.F2} proyek\n`;
    msg += `├ F3 (Negosiasi)   : ${counts.F3} proyek\n`;
    msg += `├ F4 (Closing)     : ${counts.F4} proyek\n`;
    msg += `└ F5 (Won) ✅      : ${counts.F5} proyek\n`;
    msg += `*Total             : ${total} proyek*\n\n`;
    msg += `_ℹ️ Perbandingan dengan data sebelumnya belum tersedia_\n`;
    msg += `_karena ini merupakan snapshot pertama yang tercatat._\n`;
    msg += `_Perbandingan akan muncul pada laporan berikutnya._\n\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📎 Detail lengkap:\n`;
    msg += getFunnelDetailUrl();
    return msg;
  }

  // ── 2+ snapshots: compare latest vs previous ─────────────────────────────
  const prevImport = funnelImports[1];
  const prevLops = allLops.filter(l => l.importId === prevImport.id);
  const snapshotDatePrev = formatSnapshotDate(prevImport.snapshotDate, prevImport.period, prevImport.createdAt?.toISOString()?.slice(0, 10) || "-");

  const prevMap = new Map(prevLops.map(l => [l.lopid, l]));

  const lopStagnan: { lopid: string; pelanggan: string; status: string }[] = [];
  const lopBergerak: { lopid: string; pelanggan: string; statusLama: string; statusBaru: string }[] = [];

  for (const lop of latestLops) {
    const prev = prevMap.get(lop.lopid);
    if (!prev) continue; // new LOP in this snapshot — skip

    const statusBaru = lop.statusF || "";
    const statusLama = prev.statusF || "";

    if (statusBaru === statusLama) {
      // Same status = stagnan, but ignore F5/Won (it's fine to stay Won)
      if (!isFunnel5(statusBaru)) {
        lopStagnan.push({ lopid: lop.lopid, pelanggan: lop.pelanggan, status: statusBaru });
      }
    } else {
      lopBergerak.push({ lopid: lop.lopid, pelanggan: lop.pelanggan, statusLama, statusBaru });
    }
  }

  const hasStagnan = lopStagnan.length > 0;

  // ── Header (common) ──────────────────────────────────────────────────────
  let msg = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📋 *MONITORING SALES FUNNELING*\n`;
  msg += `LESA VI — Witel Suramadu\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `Halo kak *${am.nama}*! 👋\n\n`;
  msg += `_${basaBasi}_\n\n`;
  msg += `Izin menginformasikan hasil monitoring sales funneling kakak\n`;
  msg += `per *${snapshotDateLatest}* ya kak 🙏\n\n`;
  msg += `📊 *Ringkasan LOP Kakak Saat Ini:*\n`;
  msg += `├ F0 (Lead)        : ${counts.F0} proyek\n`;
  msg += `├ F1 (Prospect)    : ${counts.F1} proyek\n`;
  msg += `├ F2 (Quote)       : ${counts.F2} proyek\n`;
  msg += `├ F3 (Negosiasi)   : ${counts.F3} proyek\n`;
  msg += `├ F4 (Closing)     : ${counts.F4} proyek\n`;
  msg += `└ F5 (Won) ✅      : ${counts.F5} proyek\n`;
  msg += `*Total             : ${total} proyek*\n\n`;
  msg += `📅 _Data dibandingkan dengan snapshot sebelumnya_\n`;
  msg += `_tertanggal ${snapshotDatePrev}_\n`;

  if (hasStagnan) {
    // ── Kondisi A: Ada LOP stagnan ─────────────────────────────────────────
    msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `⚠️ *LOP Belum Bergerak:*\n`;
    msg += `_(status sama seperti data sebelumnya)_\n\n`;
    for (const lop of lopStagnan) {
      msg += `• *${lop.lopid}* — ${lop.pelanggan}\n`;
      msg += `  Status masih *${lop.status}* sejak snapshot sebelumnya\n`;
    }
    msg += `\n`;
    const motivation = await generateFunnelMotivation(am.nama, lopStagnan.length, false);
    msg += `_${motivation}_\n`;

    msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `✅ *LOP yang Sudah Bergerak:*\n`;
    msg += `_(ada perubahan status dibanding data sebelumnya)_\n\n`;
    if (lopBergerak.length > 0) {
      for (const lop of lopBergerak) {
        msg += `• *${lop.lopid}* — ${lop.pelanggan}\n`;
        msg += `  ${lop.statusLama} → *${lop.statusBaru}* 🎯\n`;
      }
    } else {
      msg += `_Belum ada pergerakan status pada periode ini._\n`;
    }
  } else {
    // ── Kondisi B: Semua LOP sudah bergerak ───────────────────────────────
    msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🎉 *LOP Bergerak Semua — Keren!*\n\n`;
    const motivation = await generateFunnelMotivation(am.nama, 0, true);
    msg += `_${motivation}_\n\n`;
    msg += `✅ *Perubahan Status LOP:*\n\n`;
    if (lopBergerak.length > 0) {
      for (const lop of lopBergerak) {
        msg += `• *${lop.lopid}* — ${lop.pelanggan}\n`;
        msg += `  ${lop.statusLama} → *${lop.statusBaru}* 🎯\n`;
      }
    } else {
      msg += `_Belum ada pergerakan status pada periode ini._\n`;
    }
  }

  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📎 Detail lengkap:\n`;
  msg += getFunnelDetailUrl();

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

import { db, accountManagersTable, appSettingsTable, salesFunnelTargetTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const DEFAULT_AMS = [
  { nik: "401431", nama: "NYARI KUSUMANINGRUM",                     slug: "nyari-kusumaningrum",                      tipe: "LESA", divisi: "DPS", witel: "SURAMADU", kpiActivity: 30, aktif: true, crossWitel: true },
  { nik: "402478", nama: "ANA RUKMANA",                              slug: "ana-rukmana",                              tipe: "LESA", divisi: "DPS", witel: "SURAMADU", kpiActivity: 30, aktif: true, crossWitel: false },
  { nik: "403613", nama: "NADYA ZAHROTUL HAYATI",                    slug: "nadya-zahrotul-hayati",                    tipe: "LESA", divisi: "DPS", witel: "SURAMADU", kpiActivity: 30, aktif: true, crossWitel: false },
  { nik: "404429", nama: "WILDAN ARIEF",                             slug: "wildan-arief",                             tipe: "LESA", divisi: "DPS", witel: "SURAMADU", kpiActivity: 30, aktif: true, crossWitel: true },
  { nik: "405075", nama: "KATATA VEKANIDYA SEKAR PUSPITASARI",       slug: "katata-vekanidya-sekar-puspitasari",       tipe: "LESA", divisi: "DPS", witel: "SURAMADU", kpiActivity: 30, aktif: true, crossWitel: false },
  { nik: "405690", nama: "CAESAR RIO ANGGINA TORUAN",                slug: "caesar-rio-anggina-toruan",                tipe: "LESA", divisi: "DPS", witel: "SURAMADU", kpiActivity: 30, aktif: true, crossWitel: false },
  { nik: "850046", nama: "MOH RIZAL BIN MOH. FERRY Y.P. DARA",      slug: "moh-rizal-bin-moh-ferry-yp-dara",          tipe: "LESA", divisi: "DPS", witel: "SURAMADU", kpiActivity: 30, aktif: true, crossWitel: false },
  { nik: "870022", nama: "HAVEA PERTIWI",                            slug: "havea-pertiwi",                            tipe: "LESA", divisi: "DPS", witel: "SURAMADU", kpiActivity: 30, aktif: true, crossWitel: false },
  { nik: "896661", nama: "NI MADE NOVI WIRANA",                      slug: "ni-made-novi-wirana",                      tipe: "LESA", divisi: "DPS", witel: "SURAMADU", kpiActivity: 30, aktif: true, crossWitel: false },
  { nik: "910017", nama: "SAFIRINA FEBRYANTI",                       slug: "safirina-febryanti",                       tipe: "LESA", divisi: "DSS", witel: "SURAMADU", kpiActivity: 30, aktif: true, crossWitel: false },
  { nik: "910024", nama: "VIVIN VIOLITA",                            slug: "vivin-violita",                            tipe: "LESA", divisi: "DPS", witel: "SURAMADU", kpiActivity: 30, aktif: true, crossWitel: false },
  { nik: "920064", nama: "ERVINA HANDAYANI",                         slug: "ervina-handayani",                         tipe: "LESA", divisi: "DPS", witel: "SURAMADU", kpiActivity: 30, aktif: true, crossWitel: false },
  { nik: "980067", nama: "HANDIKA DAGNA NEVANDA",                    slug: "handika-dagna-nevanda",                    tipe: "LESA", divisi: "DPS", witel: "SURAMADU", kpiActivity: 30, aktif: true, crossWitel: true },
];

const DEFAULT_MANAGER = {
  nik: "850099",
  nama: "RENI WULANSARI",
  slug: "reni-wulansari",
  role: "MANAGER" as const,
  tipe: "LESA",
  divisi: "DPS",
  witel: "SURAMADU",
  kpiActivity: 0,
};

const DEFAULT_FUNNEL_TARGETS = [
  { divisi: "DPS", tahun: 2026, targetFullHo: 97076000000, targetHo: 70257000000 },
  { divisi: "DSS", tahun: 2026, targetFullHo: 73780000000, targetHo: 60048000000 },
];

export async function ensureDefaultSeed(): Promise<void> {
  const existingAms = await db.select({ nik: accountManagersTable.nik }).from(accountManagersTable).limit(1);
  if (existingAms.length === 0) {
    await db.insert(accountManagersTable).values(DEFAULT_AMS as any);
  }

  const existingManager = await db
    .select({ nik: accountManagersTable.nik })
    .from(accountManagersTable)
    .where(eq(accountManagersTable.nik, "850099"));
  if (existingManager.length === 0) {
    await db.insert(accountManagersTable).values(DEFAULT_MANAGER as any);
  }

  const existingSettings = await db.select({ id: appSettingsTable.id }).from(appSettingsTable).limit(1);
  if (existingSettings.length === 0) {
    await db.insert(appSettingsTable).values({
      autoSendOnImport: true,
      kpiActivityDefault: 30,
      gSheetsFunnelPattern: "TREG3_SALES_FUNNEL_",
      gSheetsSyncEnabled: false,
      gSheetsSyncHourWib: 5,
      gSheetsSyncIntervalDays: 1,
    });
  }

  const existingTargets = await db.select({ id: salesFunnelTargetTable.id }).from(salesFunnelTargetTable).limit(1);
  if (existingTargets.length === 0) {
    await db.insert(salesFunnelTargetTable).values(DEFAULT_FUNNEL_TARGETS);
  }
}

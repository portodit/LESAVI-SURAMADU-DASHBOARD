import { db, accountManagersTable, appSettingsTable, salesFunnelTargetTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Default Google Drive folder IDs (TREG3 Suramadu production folders)
const DEFAULT_GDRIVE_FOLDERS = {
  gDriveFolderPerformance: "1qt32nVLMT6Xd3HRXHIZvW4PPN3osuOjX",
  gDriveFolderFunnel:      "1BX1uNVRo7EtqmFdvVQxgtACh21M0-4BT",
  gDriveFolderActivity:    "1sFgsmn016jDQGrIXaRuygj_CTgKKGP16",
  gDriveFolderTarget:      "1O082T_jUbeY5hoaDMJtF-cwH3HfOJDee",
};

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
  // Always upsert all AMs — using onConflictDoNothing so we never overwrite user edits
  // but also never skip if admin/manager accounts already exist in the table
  for (const am of DEFAULT_AMS) {
    await db.insert(accountManagersTable).values(am as any).onConflictDoNothing();
  }

  // Upsert default manager
  await db.insert(accountManagersTable).values(DEFAULT_MANAGER as any).onConflictDoNothing();

  const googleApiKey = process.env.GOOGLE_API_KEY || null;

  const existingSettings = await db.select({ id: appSettingsTable.id, gSheetsApiKey: appSettingsTable.gSheetsApiKey }).from(appSettingsTable).limit(1);
  if (existingSettings.length === 0) {
    // Fresh install: seed everything including API key and Drive folders
    await db.insert(appSettingsTable).values({
      autoSendOnImport: true,
      kpiActivityDefault: 30,
      gSheetsFunnelPattern: "TREG3_SALES_FUNNEL_",
      gSheetsSyncEnabled: false,
      gSheetsSyncHourWib: 5,
      gSheetsSyncIntervalDays: 1,
      gSheetsApiKey: googleApiKey,
      ...DEFAULT_GDRIVE_FOLDERS,
      gDriveSyncEnabled: false,
      gDriveSyncHourWib: 7,
      gDriveSyncIntervalDays: 1,
    });
  } else {
    // Settings already exist — patch missing fields from env/defaults without overwriting user data
    const current = existingSettings[0];
    const patches: Record<string, any> = {};

    // Apply Google API key from env if DB is still empty
    if (!current.gSheetsApiKey && googleApiKey) {
      patches.gSheetsApiKey = googleApiKey;
    }

    // Apply default Drive folder IDs if missing (patch only, don't overwrite)
    const existingFull = await db.select().from(appSettingsTable).limit(1);
    const s = existingFull[0] as any;
    if (!s.gDriveFolderPerformance) patches.gDriveFolderPerformance = DEFAULT_GDRIVE_FOLDERS.gDriveFolderPerformance;
    if (!s.gDriveFolderFunnel)      patches.gDriveFolderFunnel      = DEFAULT_GDRIVE_FOLDERS.gDriveFolderFunnel;
    if (!s.gDriveFolderActivity)    patches.gDriveFolderActivity    = DEFAULT_GDRIVE_FOLDERS.gDriveFolderActivity;
    if (!s.gDriveFolderTarget)      patches.gDriveFolderTarget      = DEFAULT_GDRIVE_FOLDERS.gDriveFolderTarget;

    if (Object.keys(patches).length > 0) {
      await db.update(appSettingsTable).set(patches).where(eq(appSettingsTable.id, current.id));
    }
  }

  const existingTargets = await db.select({ id: salesFunnelTargetTable.id }).from(salesFunnelTargetTable).limit(1);
  if (existingTargets.length === 0) {
    await db.insert(salesFunnelTargetTable).values(DEFAULT_FUNNEL_TARGETS);
  }
}

import { db, accountManagersTable, adminUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const AM_DATA = [
  { nik: "401431", nama: "NYARI KUSUMANINGRUM",                     slug: "nyari-kusumaningrum",                      role: "AM" as const, tipe: "LESA", divisi: "DPS", witel: "SURAMADU", kpiActivity: 30, aktif: true, crossWitel: true },
  { nik: "402478", nama: "ANA RUKMANA",                              slug: "ana-rukmana",                              role: "AM" as const, tipe: "LESA", divisi: "DPS", witel: "SURAMADU", kpiActivity: 30, aktif: true, crossWitel: false },
  { nik: "403613", nama: "NADYA ZAHROTUL HAYATI",                    slug: "nadya-zahrotul-hayati",                    role: "AM" as const, tipe: "LESA", divisi: "DPS", witel: "SURAMADU", kpiActivity: 30, aktif: true, crossWitel: false },
  { nik: "404429", nama: "WILDAN ARIEF",                             slug: "wildan-arief",                             role: "AM" as const, tipe: "LESA", divisi: "DPS", witel: "SURAMADU", kpiActivity: 30, aktif: true, crossWitel: true },
  { nik: "405075", nama: "KATATA VEKANIDYA SEKAR PUSPITASARI",       slug: "katata-vekanidya-sekar-puspitasari",       role: "AM" as const, tipe: "LESA", divisi: "DPS", witel: "SURAMADU", kpiActivity: 30, aktif: true, crossWitel: false },
  { nik: "405690", nama: "CAESAR RIO ANGGINA TORUAN",                slug: "caesar-rio-anggina-toruan",                role: "AM" as const, tipe: "LESA", divisi: "DPS", witel: "SURAMADU", kpiActivity: 30, aktif: true, crossWitel: false },
  { nik: "850046", nama: "MOH RIZAL BIN MOH. FERRY Y.P. DARA",      slug: "moh-rizal-bin-moh-ferry-yp-dara",          role: "AM" as const, tipe: "LESA", divisi: "DPS", witel: "SURAMADU", kpiActivity: 30, aktif: true, crossWitel: false },
  { nik: "870022", nama: "HAVEA PERTIWI",                            slug: "havea-pertiwi",                            role: "AM" as const, tipe: "LESA", divisi: "DPS", witel: "SURAMADU", kpiActivity: 30, aktif: true, crossWitel: false },
  { nik: "896661", nama: "NI MADE NOVI WIRANA",                      slug: "ni-made-novi-wirana",                      role: "AM" as const, tipe: "LESA", divisi: "DPS", witel: "SURAMADU", kpiActivity: 30, aktif: true, crossWitel: false },
  { nik: "910017", nama: "SAFIRINA FEBRYANTI",                       slug: "safirina-febryanti",                       role: "AM" as const, tipe: "LESA", divisi: "DSS", witel: "SURAMADU", kpiActivity: 30, aktif: true, crossWitel: false },
  { nik: "910024", nama: "VIVIN VIOLITA",                            slug: "vivin-violita",                            role: "AM" as const, tipe: "LESA", divisi: "DPS", witel: "SURAMADU", kpiActivity: 30, aktif: true, crossWitel: false },
  { nik: "920064", nama: "ERVINA HANDAYANI",                         slug: "ervina-handayani",                         role: "AM" as const, tipe: "LESA", divisi: "DPS", witel: "SURAMADU", kpiActivity: 30, aktif: true, crossWitel: false },
  { nik: "980067", nama: "HANDIKA DAGNA NEVANDA",                    slug: "handika-dagna-nevanda",                    role: "AM" as const, tipe: "LESA", divisi: "DPS", witel: "SURAMADU", kpiActivity: 30, aktif: true, crossWitel: true },
];

const MANAGER_DATA = [
  { nik: "850099", nama: "RENI WULANSARI", slug: "reni-wulansari", role: "MANAGER" as const, tipe: "LESA", divisi: "DPS", witel: "SURAMADU", kpiActivity: 0, aktif: true, crossWitel: false },
];

const OFFICER_DATA = [
  {
    nik: "160203",
    nama: "Admin Officer",
    slug: "officer-bliaditdev",
    role: "OFFICER" as const,
    tipe: "LESA",
    divisi: "DPS",
    witel: "SURAMADU",
    kpiActivity: 30,
    aktif: true,
    crossWitel: false,
    email: "bliaditdev@gmail.com",
    passwordHash: "$2b$10$ucAam8hy6a5YHcMbJ6yUv.ncLN/AUskcX4YpRilQG0Hy9v3HU3zHi",
  },
];

const ADMIN_DATA = [
  {
    email: "bliaditdev@gmail.com",
    passwordHash: "$2b$10$9kQ8E7MfHxtvPHpt5DTEpOXGlV8rEDQHwiHsr7.EI903BhSAfAp6m",
    role: "admin",
  },
];

export async function seedAccounts(opts: { truncate?: boolean } = {}) {
  if (opts.truncate) {
    console.log("  [accounts] Truncating account_managers and admin_users...");
    await db.delete(accountManagersTable);
    await db.delete(adminUsersTable);
  }

  console.log(`  [accounts] Seeding ${AM_DATA.length} Account Manager(s)...`);
  for (const am of AM_DATA) {
    await db.insert(accountManagersTable).values(am).onConflictDoUpdate({
      target: accountManagersTable.nik,
      set: { nama: am.nama, divisi: am.divisi, tipe: am.tipe, aktif: am.aktif, crossWitel: am.crossWitel, kpiActivity: am.kpiActivity },
    });
  }

  console.log(`  [accounts] Seeding ${MANAGER_DATA.length} Manager(s)...`);
  for (const m of MANAGER_DATA) {
    await db.insert(accountManagersTable).values(m).onConflictDoUpdate({
      target: accountManagersTable.nik,
      set: { nama: m.nama, role: m.role, divisi: m.divisi, aktif: m.aktif },
    });
  }

  console.log(`  [accounts] Seeding ${OFFICER_DATA.length} Officer(s)...`);
  for (const o of OFFICER_DATA) {
    await db.insert(accountManagersTable).values(o).onConflictDoUpdate({
      target: accountManagersTable.nik,
      set: { nama: o.nama, role: o.role, email: o.email },
    });
  }

  console.log(`  [accounts] Seeding ${ADMIN_DATA.length} Admin user(s)...`);
  for (const a of ADMIN_DATA) {
    const existing = await db.select({ id: adminUsersTable.id }).from(adminUsersTable).where(eq(adminUsersTable.email, a.email));
    if (existing.length === 0) {
      await db.insert(adminUsersTable).values(a);
    } else {
      console.log(`    [accounts] Admin '${a.email}' already exists, skipping.`);
    }
  }

  console.log("  [accounts] Done.");
}

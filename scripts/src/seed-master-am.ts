/**
 * Seed script — Master data AM Telkom TR3/Suramadu
 * Mengisi tabel account_managers (satu-satunya tabel master AM).
 * Aman dijalankan berulang kali (upsert by NIK).
 *
 * Jalankan:
 *   pnpm --filter @workspace/scripts run seed-am
 */

import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";

// ─── Helper ────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

// ─── Data Master AM ────────────────────────────────────────────────────────

const AM_DATA: Array<{
  nik: string;
  nama: string;
  divisi: "DPS" | "DSS";
  crossWitel: boolean;
  kpiActivity: number;
}> = [
  { nik: "402478", nama: "ANA RUKMANA",                           divisi: "DPS", crossWitel: false, kpiActivity: 30 },
  { nik: "405690", nama: "CAESAR RIO ANGGINA TORUAN",             divisi: "DPS", crossWitel: false, kpiActivity: 30 },
  { nik: "920064", nama: "ERVINA HANDAYANI",                      divisi: "DPS", crossWitel: false, kpiActivity: 30 },
  { nik: "980067", nama: "HANDIKA DAGNA NEVANDA",                 divisi: "DPS", crossWitel: true,  kpiActivity: 30 },
  { nik: "870022", nama: "HAVEA PERTIWI",                         divisi: "DPS", crossWitel: false, kpiActivity: 30 },
  { nik: "405075", nama: "KATATA VEKANIDYA SEKAR PUSPITASARI",    divisi: "DPS", crossWitel: false, kpiActivity: 30 },
  { nik: "850046", nama: "MOH RIZAL BIN MOH. FERRY Y.P. DARA",   divisi: "DPS", crossWitel: false, kpiActivity: 30 },
  { nik: "403613", nama: "NADYA ZAHROTUL HAYATI",                 divisi: "DPS", crossWitel: false, kpiActivity: 30 },
  { nik: "896661", nama: "NI MADE NOVI WIRANA",                   divisi: "DPS", crossWitel: false, kpiActivity: 30 },
  { nik: "401431", nama: "NYARI KUSUMANINGRUM",                   divisi: "DPS", crossWitel: true,  kpiActivity: 30 },
  { nik: "910017", nama: "SAFIRINA FEBRYANTI",                    divisi: "DSS", crossWitel: false, kpiActivity: 30 },
  { nik: "910024", nama: "VIVIN VIOLITA",                         divisi: "DPS", crossWitel: false, kpiActivity: 30 },
  { nik: "404429", nama: "WILDAN ARIEF",                          divisi: "DPS", crossWitel: true,  kpiActivity: 30 },
];

// ─── Seed ──────────────────────────────────────────────────────────────────

async function seedMasterAm() {
  console.log("Menyemai data ke tabel account_managers...");

  for (const am of AM_DATA) {
    const slug = slugify(am.nama);
    await db.execute(sql`
      INSERT INTO account_managers (nik, nama, slug, divisi, witel, kpi_activity, aktif, cross_witel)
      VALUES (
        ${am.nik},
        ${am.nama},
        ${slug},
        ${am.divisi},
        'SURAMADU',
        ${am.kpiActivity},
        true,
        ${am.crossWitel}
      )
      ON CONFLICT (nik)
      DO UPDATE SET
        nama         = EXCLUDED.nama,
        slug         = EXCLUDED.slug,
        divisi       = EXCLUDED.divisi,
        witel        = EXCLUDED.witel,
        kpi_activity = EXCLUDED.kpi_activity,
        aktif        = EXCLUDED.aktif,
        cross_witel  = EXCLUDED.cross_witel
    `);
    console.log(`  OK  ${am.nik}  ${am.nama}  (slug: ${slug})`);
  }

  console.log(`\nSelesai! ${AM_DATA.length} AM berhasil di-seed ke account_managers.`);
}

seedMasterAm()
  .catch(err => {
    console.error("Seed gagal:", err.message);
    process.exit(1);
  })
  .finally(() => pool.end());

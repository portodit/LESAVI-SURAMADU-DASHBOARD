/**
 * LESA VI Witel Suramadu — Database Seeder
 *
 * Cara pakai:
 *   pnpm --filter @workspace/api-server run seed            # seed semua (skip duplikat)
 *   pnpm --filter @workspace/api-server run seed:truncate   # hapus lalu seed ulang semua
 *
 * Atau seed per modul:
 *   pnpm --filter @workspace/api-server run seed -- accounts
 *   pnpm --filter @workspace/api-server run seed -- funnel-targets
 *   pnpm --filter @workspace/api-server run seed -- performance
 *   pnpm --filter @workspace/api-server run seed -- activity
 *   pnpm --filter @workspace/api-server run seed -- funnel
 */

import { seedAccounts } from "./seed-accounts.js";
import { seedFunnelTargets } from "./seed-funnel-targets.js";
import { seedPerformance } from "./seed-performance.js";
import { seedActivity } from "./seed-activity.js";
import { seedFunnel } from "./seed-funnel.js";

const ARGS = process.argv.slice(2);
const TRUNCATE = ARGS.includes("--truncate") || process.env.SEED_TRUNCATE === "1";
const TARGET = ARGS.find((a) => !a.startsWith("--")) ?? "all";

const MODULES: Record<string, () => Promise<void>> = {
  accounts: () => seedAccounts({ truncate: TRUNCATE }),
  "funnel-targets": () => seedFunnelTargets({ truncate: TRUNCATE }),
  performance: () => seedPerformance({ truncate: TRUNCATE }),
  activity: () => seedActivity({ truncate: TRUNCATE }),
  funnel: () => seedFunnel({ truncate: TRUNCATE }),
};

async function main() {
  console.log("=".repeat(60));
  console.log("  LESA VI Witel Suramadu — Database Seeder");
  console.log(`  Target  : ${TARGET}`);
  console.log(`  Truncate: ${TRUNCATE ? "YES — data lama akan dihapus!" : "NO  — skip jika duplikat"}`);
  console.log("=".repeat(60));

  const toRun = TARGET === "all" ? Object.keys(MODULES) : [TARGET];

  for (const mod of toRun) {
    const fn = MODULES[mod];
    if (!fn) {
      console.error(`\n[ERROR] Modul '${mod}' tidak ditemukan.`);
      console.error(`Pilihan: ${Object.keys(MODULES).join(", ")}, all`);
      process.exit(1);
    }
    console.log(`\n▶ Menjalankan seeder: ${mod}`);
    const start = Date.now();
    await fn();
    console.log(`  ✓ ${mod} selesai dalam ${((Date.now() - start) / 1000).toFixed(1)}s`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("  Seeding selesai!");
  console.log("=".repeat(60));
  process.exit(0);
}

main().catch((err) => {
  console.error("\n[FATAL ERROR] Seeder gagal:", err);
  process.exit(1);
});

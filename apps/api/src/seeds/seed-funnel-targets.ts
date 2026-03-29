import { db, salesFunnelTargetTable } from "@workspace/db";

const FUNNEL_TARGETS = [
  { divisi: "DPS", tahun: 2026, targetFullHo: 97076000000, targetHo: 70257000000 },
  { divisi: "DSS", tahun: 2026, targetFullHo: 73780000000, targetHo: 60048000000 },
];

export async function seedFunnelTargets(opts: { truncate?: boolean } = {}) {
  if (opts.truncate) {
    console.log("  [funnel-targets] Truncating sales_funnel_target...");
    await db.delete(salesFunnelTargetTable);
  }

  console.log(`  [funnel-targets] Seeding ${FUNNEL_TARGETS.length} target(s)...`);
  for (const t of FUNNEL_TARGETS) {
    const existing = await db
      .select({ id: salesFunnelTargetTable.id })
      .from(salesFunnelTargetTable)
      .limit(1);

    if (existing.length === 0 || opts.truncate) {
      await db.insert(salesFunnelTargetTable).values(t);
    } else {
      console.log(`    [funnel-targets] Target ${t.divisi} ${t.tahun} already exists, skipping (use --truncate to overwrite).`);
    }
  }

  console.log("  [funnel-targets] Done.");
}

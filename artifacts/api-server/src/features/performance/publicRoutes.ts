import { Router, type IRouter } from "express";
import { db, performanceDataTable, dataImportsTable, accountManagersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/public/performance", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Frame-Options", "ALLOWALL");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { importId, divisi } = req.query;

  let snapshotId: number | null = null;

  if (importId) {
    snapshotId = parseInt(String(importId));
  } else {
    const latest = await db
      .select()
      .from(dataImportsTable)
      .where(eq(dataImportsTable.type, "performance"))
      .orderBy(desc(dataImportsTable.id))
      .limit(1);
    snapshotId = latest[0]?.id ?? null;
  }

  if (!snapshotId) {
    res.json([]);
    return;
  }

  const conditions = [eq(performanceDataTable.importId, snapshotId)];
  if (divisi) conditions.push(eq(performanceDataTable.divisi, String(divisi)));

  const data = await db
    .select()
    .from(performanceDataTable)
    .where(and(...conditions));

  res.json(data.map(d => ({ ...d, createdAt: d.createdAt.toISOString() })));
});

router.get("/public/import-history", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Frame-Options", "ALLOWALL");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const history = await db
    .select()
    .from(dataImportsTable)
    .where(eq(dataImportsTable.type, "performance"))
    .orderBy(desc(dataImportsTable.id));

  res.json(history.map(h => ({ ...h, createdAt: h.createdAt.toISOString() })));
});

router.get("/public/am", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  const ams = await db
    .select({ nik: accountManagersTable.nik, nama: accountManagersTable.nama, divisi: accountManagersTable.divisi, role: accountManagersTable.role })
    .from(accountManagersTable)
    .orderBy(accountManagersTable.nama);
  res.json(ams);
});

export default router;

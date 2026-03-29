import { Router, type IRouter } from "express";
import { db, appSettingsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/public/settings", async (_req, res): Promise<void> => {
  const [settings] = await db.select({
    kpiActivityDefault: appSettingsTable.kpiActivityDefault,
  }).from(appSettingsTable).limit(1);

  res.json({
    kpiActivityDefault: settings?.kpiActivityDefault ?? 30,
  });
});

export default router;

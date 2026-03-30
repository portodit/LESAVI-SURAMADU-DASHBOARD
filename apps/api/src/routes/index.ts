import { Router, type IRouter } from "express";
import healthRouter from "../features/health/routes";
import authRouter from "../features/auth/routes";
import amRouter from "../features/am/routes";
import importRouter from "../features/import/routes";
import performanceRouter from "../features/performance/routes";
import funnelRouter from "../features/funnel/routes";
import activityRouter from "../features/activity/routes";
import telegramRouter from "../features/telegram/routes";
import settingsRouter from "../features/settings/routes";
import gSheetsRouter from "../features/gsheets/routes";
import gDriveRouter from "../features/gdrive/routes";
import corporateRouter from "../features/corporate/routes";
import publicAmRouter from "../features/am/publicRoutes";
import publicPerformanceRouter from "../features/performance/publicRoutes";
import publicFunnelRouter from "../features/funnel/publicRoutes";
import publicActivityRouter from "../features/activity/publicRoutes";
import publicSettingsRouter from "../features/settings/publicRoutes";
import { requireAuth, requireManagerOrOfficer } from "../shared/auth";

const router: IRouter = Router();

// Rute publik (tanpa auth)
router.use(healthRouter);
router.use(authRouter);
router.use(publicAmRouter);
router.use(publicPerformanceRouter);
router.use(publicFunnelRouter);
router.use(publicActivityRouter);
router.use(publicSettingsRouter);

// Rute dashboard — hanya MANAGER dan OFFICER
// Role "AM" dikembalikan 403; frontend akan redirect ke presentasi
const dashboardRouter: IRouter = Router();
dashboardRouter.use(requireAuth);
dashboardRouter.use(requireManagerOrOfficer);
dashboardRouter.use(amRouter);
dashboardRouter.use(importRouter);
dashboardRouter.use(performanceRouter);
dashboardRouter.use(funnelRouter);
dashboardRouter.use(activityRouter);
dashboardRouter.use(telegramRouter);
dashboardRouter.use(settingsRouter);
dashboardRouter.use(gSheetsRouter);
dashboardRouter.use(gDriveRouter);
dashboardRouter.use(corporateRouter);

router.use(dashboardRouter);

export default router;

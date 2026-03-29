import app from "./app";
import { logger } from "./shared/logger";
import { ensureDefaultAdmin } from "./shared/auth";
import { ensureDefaultSeed } from "./shared/seed";
import { startTelegramPoller } from "./features/telegram/poller";
import { startGSheetsScheduler } from "./features/gsheets/scheduler";
import { startGDriveScheduler } from "./features/gdrive/scheduler";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

ensureDefaultAdmin()
  .then(() => logger.info("Default admin user ensured"))
  .catch(err => logger.error({ err }, "Failed to ensure default admin"));

ensureDefaultSeed()
  .then(() => logger.info("Default seed data ensured"))
  .catch(err => logger.error({ err }, "Failed to ensure default seed data"));

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startTelegramPoller(15000);
  startGSheetsScheduler();
  startGDriveScheduler();
});

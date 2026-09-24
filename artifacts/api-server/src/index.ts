import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import { initScreenerStore } from "./screener/store";
import { alerts, ingestion } from "./screener/runtime";

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

async function start() {
  await initScreenerStore();
  const server = app.listen(port, () => {
    logger.info({ port }, "Server listening");
  });

  await alerts.start();
  ingestion.start();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down");
    ingestion.stop();
    await alerts.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

start().catch((error) => {
  logger.error({ err: error }, "Failed to start API server");
  process.exit(1);
});

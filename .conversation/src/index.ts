import { assertConfiguration, config } from "./config.js";
import { initSchema, pool } from "./db.js";
import { TokenAnalyzer } from "./analyzer.js";
import { TelegramAlerts } from "./telegram.js";
import { IngestionService } from "./ingest.js";
import { createServer } from "./server.js";

assertConfiguration();
await initSchema();

const analyzer = new TokenAnalyzer();
const alerts = new TelegramAlerts(analyzer);
const ingestion = new IngestionService(analyzer, alerts);
const app = createServer(analyzer);
const server = app.listen(config.port, () => {
  console.log(`[http] listening on port ${config.port}`);
});

await alerts.start();
ingestion.start();

async function shutdown(signal: string): Promise<void> {
  console.log(`[app] ${signal} received; shutting down`);
  ingestion.stop();
  await alerts.stop();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
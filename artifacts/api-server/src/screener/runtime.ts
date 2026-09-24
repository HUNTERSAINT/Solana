import { TokenAnalyzer } from "./analyzer";
import { IngestionService } from "./ingest";
import { TelegramAlerts } from "./telegram";

export const analyzer = new TokenAnalyzer();
export const alerts = new TelegramAlerts(analyzer);
export const ingestion = new IngestionService(analyzer, alerts);
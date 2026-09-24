import { config } from "./config.js";
import { upsertPair, upsertToken, saveAnalysis } from "./db.js";
import { DexScreenerClient } from "./dexscreener.js";
import type { TelegramAlerts } from "./telegram.js";
import type { TokenAnalyzer } from "./analyzer.js";

export class IngestionService {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly analyzer: TokenAnalyzer,
    private readonly alerts: TelegramAlerts,
    private readonly dex = new DexScreenerClient(),
  ) {}

  async runOnce(): Promise<{ discovered: number; analyzed: number; alerted: number }> {
    if (this.running) return { discovered: 0, analyzed: 0, alerted: 0 };
    this.running = true;
    let analyzed = 0;
    let alerted = 0;
    try {
      const pairs = await this.dex.discover();
      for (const pair of pairs) {
        await upsertToken(pair.baseToken.address, pair.baseToken.name, pair.baseToken.symbol, pair.raw);
        const isNew = await upsertPair(pair);
        if (!isNew) continue;

        const result = await this.analyzer.analyze(pair.baseToken.address, pair);
        await saveAnalysis(result);
        analyzed += 1;

        const hasUnknown = result.checks.some((item) => item.status === "unknown");
        if (result.score >= config.alertMinScore && (config.alertOnUnknown || !hasUnknown)) {
          try {
            await this.alerts.alert(result);
            alerted += 1;
          } catch (error) {
            console.error(`[ingest] alert failed for ${pair.baseToken.address}`, error);
          }
        }
      }
      console.log(`[ingest] discovered=${pairs.length} new analyzed=${analyzed} alerted=${alerted}`);
      return { discovered: pairs.length, analyzed, alerted };
    } finally {
      this.running = false;
    }
  }

  start(): void {
    void this.runOnce().catch((error) => console.error("[ingest] initial poll failed", error));
    this.timer = setInterval(() => {
      void this.runOnce().catch((error) => console.error("[ingest] poll failed", error));
    }, config.pollIntervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
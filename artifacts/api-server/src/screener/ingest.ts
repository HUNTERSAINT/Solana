import { logger } from "../lib/logger";
import { screenerConfig } from "./config";
import { DexScreenerClient } from "./sources";
import { analysisIsStale, saveAnalysis, upsertPair, upsertToken } from "./store";
import type { TokenAnalyzer } from "./analyzer";
import type { TelegramAlerts } from "./telegram";
import { groupTopPairs, includePair } from "./filters";

export class IngestionService {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly analyzer: TokenAnalyzer,
    private readonly alerts: TelegramAlerts,
    private readonly dex = new DexScreenerClient(),
  ) {}

  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const pairs = await this.dex.discover();
      const storedPairs: Array<{ pair: (typeof pairs)[number]; isNew: boolean }> = [];
      let analyzed = 0;
      let alerted = 0;
      for (const pair of pairs) {
        await upsertToken(pair.baseToken.address, pair.baseToken.name, pair.baseToken.symbol, pair.raw);
        storedPairs.push({ pair, isNew: await upsertPair(pair) });
      }

      const eligiblePairs = pairs.filter(includePair);
      const selectedPairs = groupTopPairs(eligiblePairs, 2);
      let refreshed = 0;
      for (const pair of selectedPairs) {
        const stored = storedPairs.find(({ pair: storedPair }) => storedPair.pairAddress === pair.pairAddress);
        if (!stored || (!stored.isNew && !(await analysisIsStale(pair.pairAddress)))) continue;
        const result = await this.analyzer.analyze(pair.baseToken.address, pair);
        await saveAnalysis(result);
        analyzed += 1;
        refreshed += stored.isNew ? 0 : 1;
        const hasUnknown = result.checks.some((check) => check.status === "unknown");
        if (result.score >= screenerConfig.alertMinScore && (screenerConfig.alertOnUnknown || !hasUnknown)) {
          try {
            await this.alerts.alert(result);
            alerted += 1;
          } catch (error) {
            logger.error({ err: error, address: pair.baseToken.address }, "Token alert failed");
          }
        }
      }
      logger.info(
        {
          discovered: pairs.length,
          stored: storedPairs.length,
          filtered: pairs.length - eligiblePairs.length,
          groupedTokens: new Set(selectedPairs.map((pair) => pair.baseToken.address)).size,
          analyzed,
          refreshed,
          alerted,
        },
        "Screener poll completed",
      );
    } finally {
      this.running = false;
    }
  }

  start(): void {
    void this.runOnce().catch((error) => logger.error({ err: error }, "Initial screener poll failed"));
    this.timer = setInterval(() => void this.runOnce().catch((error) => logger.error({ err: error }, "Screener poll failed")), screenerConfig.pollIntervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
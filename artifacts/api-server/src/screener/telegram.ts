import { Bot } from "grammy";
import { logger } from "../lib/logger";
import { screenerConfig } from "./config";
import { formatAnalysis, formatPairMessages } from "./format";
import { pairsForToken, recentPairs, saveAnalysis, upsertPair, upsertToken } from "./store";
import type { TokenAnalyzer } from "./analyzer";
import type { AnalysisResult } from "./types";

const solanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export class TelegramAlerts {
  readonly bot?: Bot;

  constructor(private readonly analyzer: TokenAnalyzer) {
    if (!screenerConfig.telegramBotToken) return;
    this.bot = new Bot(screenerConfig.telegramBotToken);
    this.bot.command("start", (ctx) => ctx.reply("Solana due-diligence assistant. Use /check <token_address> for a transparent checklist."));
    this.bot.command("help", (ctx) => ctx.reply("Usage:\n/check <solana_token_address>\n/pairs [count]\n/pairs <token_address>\n\n/pairs groups tokens and shows the top pairs by liquidity. A token address expands its eligible pairs. Unknown checks are warnings, not passes."));
    this.bot.command("pairs", async (ctx) => {
      const argument = ctx.match.trim();
      try {
        const tokenAddress = argument.split(/\s+/)[0] ?? "";
        const rows = solanaAddress.test(tokenAddress)
          ? await pairsForToken(tokenAddress)
          : await recentPairs(Number.isInteger(Number(argument)) && Number(argument) > 0 ? Number(argument) : 10);
        for (const message of formatPairMessages(rows)) {
          await ctx.reply(message, {
            parse_mode: "HTML",
            link_preview_options: { is_disabled: true },
          });
        }
      } catch (error) {
        logger.error({ err: error }, "Telegram pair listing failed");
        await ctx.reply("I could not load the discovered pairs right now.");
      }
    });
    this.bot.command("check", async (ctx) => {
      const address = ctx.match.trim().split(/\s+/)[0] ?? "";
      if (!solanaAddress.test(address)) {
        await ctx.reply("Please provide a valid-looking Solana token address after /check.");
        return;
      }
      await ctx.reply("Running the checklist…");
      try {
        const result = await this.analyzer.analyze(address);
        await upsertToken(address, result.tokenName, result.tokenSymbol);
        if (result.pair) await upsertPair(result.pair);
        await saveAnalysis(result);
        await ctx.reply(formatAnalysis(result), { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
      } catch (error) {
        logger.error({ err: error, address }, "Telegram token check failed");
        await ctx.reply("I could not analyze that token right now.");
      }
    });
    this.bot.catch((error) => logger.error({ err: error }, "Telegram bot error"));
  }

  async start(): Promise<void> {
    if (!this.bot) {
      logger.info("Telegram bot disabled; TELEGRAM_BOT_TOKEN is not configured");
      return;
    }
    await this.bot.api.setMyCommands([
      { command: "check", description: "Analyze a Solana token address" },
      { command: "pairs", description: "Show grouped pairs and safety checks" },
      { command: "help", description: "Show bot usage" },
    ]);
    this.bot.start({ onStart: () => logger.info("Telegram polling started") });
  }

  async alert(result: AnalysisResult): Promise<void> {
    if (!this.bot || !screenerConfig.telegramAlertChatId) return;
    await this.bot.api.sendMessage(screenerConfig.telegramAlertChatId, formatAnalysis(result, true), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  }

  async stop(): Promise<void> {
    if (this.bot) await this.bot.stop();
  }
}
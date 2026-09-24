import { Bot, type Context } from "grammy";
import { config } from "./config.js";
import { formatAnalysis } from "./format.js";
import type { TokenAnalyzer } from "./analyzer.js";
import type { AnalysisResult } from "./types.js";
import { saveAnalysis, upsertPair, upsertToken } from "./db.js";

const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function isSolanaAddress(value: string): boolean {
  return SOLANA_ADDRESS.test(value);
}

export class TelegramAlerts {
  readonly bot?: Bot;

  constructor(private readonly analyzer: TokenAnalyzer) {
    if (!config.telegramBotToken) return;
    this.bot = new Bot(config.telegramBotToken);
    this.registerHandlers(this.bot);
  }

  private registerHandlers(bot: Bot): void {
    bot.command("start", async (ctx) => {
      await ctx.reply(
        "This bot is a Solana token due-diligence assistant. Use /check <token_address> for an on-demand checklist. It does not predict prices or guarantee safety.",
      );
    });

    bot.command("help", async (ctx) => {
      await ctx.reply("Usage:\n/check <solana_token_address>\n\nThe report marks unavailable data as unknown; unknown checks are not passes.");
    });

    bot.command("check", async (ctx) => {
      const address = ctx.match.trim().split(/\s+/)[0] ?? "";
      if (!isSolanaAddress(address)) {
        await ctx.reply("Please provide a valid-looking Solana token address after /check.");
        return;
      }
      await ctx.reply("Running the checklist…");
      try {
        const result = await this.analyzer.analyze(address);
        await upsertToken(address, result.tokenName, result.tokenSymbol, {});
        if (result.pair) await upsertPair(result.pair);
        await saveAnalysis(result);
        await ctx.reply(formatAnalysis(result), { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
      } catch (error) {
        console.error("[telegram] check failed", error);
        await ctx.reply("I couldn't analyze that token right now. The upstream market or risk data source may be unavailable.");
      }
    });

    bot.catch((error) => console.error("[telegram] bot error", error));
  }

  async start(): Promise<void> {
    if (!this.bot) {
      console.log("[telegram] TELEGRAM_BOT_TOKEN not configured; bot disabled");
      return;
    }
    await this.bot.api.setMyCommands([
      { command: "check", description: "Analyze a Solana token address" },
      { command: "help", description: "Show bot usage" },
    ]);
    this.bot.start({ onStart: () => console.log("[telegram] bot polling started") });
  }

  async alert(result: AnalysisResult): Promise<void> {
    if (!this.bot || !config.telegramAlertChatId) return;
    await this.bot.api.sendMessage(config.telegramAlertChatId, formatAnalysis(result, true), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  }

  async stop(): Promise<void> {
    if (this.bot) await this.bot.stop();
  }
}
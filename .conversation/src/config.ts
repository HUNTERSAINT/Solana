import "dotenv/config";

function numberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function booleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

const searchTerms = (process.env.DEX_SEARCH_TERMS ?? "SOL,USDC,USDT,WIF,BONK,MEME")
  .split(",")
  .map((term) => term.trim())
  .filter(Boolean);

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: numberEnv("PORT", 3000),
  logLevel: process.env.LOG_LEVEL ?? "info",
  databaseUrl: process.env.DATABASE_URL ?? "",
  pgSsl: booleanEnv("PGSSL", false),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramAlertChatId: process.env.TELEGRAM_ALERT_CHAT_ID ?? "",
  dexscreenerApiUrl: (process.env.DEXSCREENER_API_URL ?? "https://api.dexscreener.com").replace(/\/$/, ""),
  rugcheckApiUrl: (process.env.RUGCHECK_API_URL ?? "https://api.rugcheck.xyz").replace(/\/$/, ""),
  rugcheckApiKey: process.env.RUGCHECK_API_KEY ?? "",
  solanaRpcUrl: process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com",
  pollIntervalMs: Math.max(15, numberEnv("POLL_INTERVAL_SECONDS", 60)) * 1000,
  searchTerms,
  minLiquidityUsd: Math.max(0, numberEnv("MIN_LIQUIDITY_USD", 10_000)),
  maxHolderConcentrationPercent: Math.min(100, Math.max(0, numberEnv("MAX_HOLDER_CONCENTRATION_PERCENT", 35))),
  maxVolumeLiquidityRatio: Math.max(0, numberEnv("MAX_VOLUME_LIQUIDITY_RATIO", 20)),
  alertMinScore: Math.min(100, Math.max(0, numberEnv("ALERT_MIN_SCORE", 60))),
  alertOnUnknown: booleanEnv("ALERT_ON_UNKNOWN", false),
};

export function assertConfiguration(): void {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required. Copy .env.example to .env and configure PostgreSQL.");
  }
  if (config.searchTerms.length === 0) {
    throw new Error("DEX_SEARCH_TERMS must contain at least one search term.");
  }
}
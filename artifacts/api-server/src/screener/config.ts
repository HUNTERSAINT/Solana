function numberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function boolEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.toLowerCase();
  return value === "true" ? true : value === "false" ? false : fallback;
}

export const screenerConfig = {
  dexscreenerUrl: (process.env.DEXSCREENER_API_URL ?? "https://api.dexscreener.com").replace(/\/$/, ""),
  rugcheckUrl: (process.env.RUGCHECK_API_URL ?? "https://api.rugcheck.xyz").replace(/\/$/, ""),
  rugcheckApiKey: process.env.RUGCHECK_API_KEY ?? "",
  goplusUrl: (process.env.GOPLUS_API_URL ?? "https://api.gopluslabs.io").replace(/\/$/, ""),
  goplusApiKey: process.env.GOPLUS_API_KEY ?? "",
  solanaRpcUrl: process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramAlertChatId: process.env.TELEGRAM_ALERT_CHAT_ID ?? "",
  pollIntervalMs: Math.max(60, numberEnv("POLL_INTERVAL_SECONDS", 120)) * 1000,
  searchTerms: (process.env.DEX_SEARCH_TERMS ?? "SOL,USDC,USDT,WIF,BONK,MEME")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  minLiquidityUsd: Math.max(0, numberEnv("MIN_LIQUIDITY_USD", 1_000)),
  lowLiquidityVolumeRatioOverride: Math.max(0, numberEnv("LOW_LIQUIDITY_VOLUME_RATIO_OVERRIDE", 20)),
  lowLiquidityMinVolumeUsd: Math.max(0, numberEnv("LOW_LIQUIDITY_MIN_VOLUME_USD", 5_000)),
  anomalyLiquidityUsd: Math.max(0, numberEnv("ANOMALY_LIQUIDITY_USD", 1_000)),
  anomalyZeroVolumeUsd: Math.max(0, numberEnv("ANOMALY_ZERO_VOLUME_USD", 0)),
  anomalyVolumeLiquidityRatio: Math.max(0, numberEnv("ANOMALY_VOLUME_LIQUIDITY_RATIO", 20)),
  maxTopWalletsPercent: Math.min(100, Math.max(0, numberEnv("MAX_HOLDER_CONCENTRATION_PERCENT", 50))),
  maxVolumeLiquidityRatio: Math.max(0, numberEnv("MAX_VOLUME_LIQUIDITY_RATIO", 20)),
  rpcMaxRetries: Math.min(8, Math.max(0, Math.floor(numberEnv("RPC_MAX_RETRIES", 4)))),
  rpcBackoffMs: Math.min(10_000, Math.max(100, numberEnv("RPC_BACKOFF_MS", 1_000))),
  analysisRefreshMs: Math.max(5, numberEnv("ANALYSIS_REFRESH_MINUTES", 60)) * 60_000,
  alertMinScore: Math.min(100, Math.max(0, numberEnv("ALERT_MIN_SCORE", 60))),
  alertOnUnknown: boolEnv("ALERT_ON_UNKNOWN", false),
};
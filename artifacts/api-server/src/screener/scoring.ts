import { screenerConfig } from "./config";
import type { AnalysisResult, CheckResult, MintMetadata, PairData, SafetyData } from "./types";
import type { RiskData } from "./sources";
import { pairAnomalies } from "./filters";

function makeCheck(
  key: string,
  label: string,
  status: CheckResult["status"],
  detail: string,
  source?: string,
): CheckResult {
  return { key, label, status, detail, source };
}

export function scoreToken(
  tokenAddress: string,
  pair: PairData | undefined,
  risk: RiskData,
  mint: MintMetadata,
  safety: SafetyData = {
    sellability: { status: "unknown", detail: "Sellability data unavailable" },
    liquidityLock: { status: "unknown", detail: "Liquidity-lock data unavailable" },
  },
): AnalysisResult {
  const liquidity = pair?.liquidityUsd;
  const volume = pair?.volume24hUsd;
  const ratio = liquidity && liquidity > 0 && volume !== undefined ? volume / liquidity : undefined;
  const topWallets = risk.topWalletsPercent;
  const anomalies = pair ? pairAnomalies(pair) : [];
  const checks: CheckResult[] = [
    liquidity === undefined
      ? makeCheck("liquidity-threshold", "Minimum liquidity", "unknown", "Liquidity data unavailable")
      : makeCheck(
          "liquidity-threshold",
          "Minimum liquidity",
          liquidity >= screenerConfig.minLiquidityUsd ? "pass" : "fail",
          `$${Math.round(liquidity).toLocaleString()} ${liquidity >= screenerConfig.minLiquidityUsd ? "meets" : "is below"} the $${Math.round(screenerConfig.minLiquidityUsd).toLocaleString()} threshold`,
          "DexScreener",
        ),
    liquidity === undefined
      ? makeCheck("liquidity-active", "Active liquidity", "unknown", "Pair liquidity data unavailable")
      : makeCheck("liquidity-active", "Active liquidity", liquidity > 0 ? "pass" : "fail", liquidity > 0 ? "Pair reports non-zero liquidity" : "Pair reports zero liquidity", "DexScreener"),
    topWallets === undefined
      ? makeCheck("holder-concentration", "Top-wallet concentration", "unknown", "Holder distribution unavailable", risk.source)
      : makeCheck(
          "holder-concentration",
          "Top 10 holder concentration",
          topWallets <= screenerConfig.maxTopWalletsPercent ? "pass" : "fail",
          `Top ${Math.min(10, risk.holdersChecked ?? 10)} reported wallets hold ${topWallets.toFixed(2)}%; limit is ${screenerConfig.maxTopWalletsPercent}%`,
          risk.source,
        ),
    mint.accountFound === false
      ? makeCheck("mint-authority", "Mint authority revoked", "unknown", "Mint account could not be read from Solana RPC", "Solana RPC")
      : makeCheck("mint-authority", "Mint authority revoked", mint.mintAuthorityRevoked ? "pass" : "fail", mint.mintAuthorityRevoked ? "Mint authority is revoked" : "Mint authority is still present", "Solana RPC"),
    ratio === undefined
      ? makeCheck("volume-liquidity-ratio", "Volume/liquidity sanity", "unknown", "24h volume or liquidity unavailable", "DexScreener")
      : makeCheck("volume-liquidity-ratio", "Volume/liquidity sanity", ratio <= screenerConfig.maxVolumeLiquidityRatio ? "pass" : "fail", `24h volume is ${ratio.toFixed(2)}× reported liquidity; limit is ${screenerConfig.maxVolumeLiquidityRatio}×`, "DexScreener"),
    makeCheck(
      "sellability",
      "Honeypot / sellability",
      safety.sellability.status,
      safety.sellability.detail,
      safety.sellability.source,
    ),
    makeCheck(
      "liquidity-lock",
      "Liquidity lock status",
      safety.liquidityLock.status,
      safety.liquidityLock.detail,
      safety.liquidityLock.source,
    ),
    makeCheck(
      "market-anomaly",
      "Market data anomaly",
      pair === undefined || liquidity === undefined || volume === undefined ? "unknown" : anomalies.length ? "fail" : "pass",
      pair === undefined || liquidity === undefined || volume === undefined
        ? "Liquidity or 24h volume data unavailable"
        : anomalies.length
          ? `⚠️ unusual — verify manually: ${anomalies.join("; ")}`
          : "No configured liquidity/volume anomaly detected",
      "DexScreener",
    ),
  ];
  const passedChecks = checks.filter((check) => check.status === "pass").length;
  const totalChecks = checks.length;
  const score = Math.round((passedChecks / totalChecks) * 100);
  return {
    tokenAddress,
    tokenName: pair?.baseToken.name,
    tokenSymbol: pair?.baseToken.symbol,
    pair,
    checks,
    passedChecks,
    totalChecks,
    score,
    riskLevel: score >= 80 ? "LOWER" : score >= 60 ? "MODERATE" : "HIGHER",
    metrics: {
      liquidityUsd: liquidity,
      volume24hUsd: volume,
      volumeLiquidityRatio: ratio,
      topHolderPercent: risk.topHolderPercent,
      topWalletsPercent: risk.topWalletsPercent,
      mintAuthorityRevoked: mint.mintAuthorityRevoked,
      freezeAuthorityRevoked: mint.freezeAuthorityRevoked,
      rugCheckRiskCount: risk.riskCount,
      anomalyFlags: anomalies,
      sellabilityStatus: safety.sellability.status,
      liquidityLockStatus: safety.liquidityLock.status,
    },
    analyzedAt: new Date().toISOString(),
  };
}
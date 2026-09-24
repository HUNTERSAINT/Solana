import { config } from "./config.js";
import type { AnalysisResult, CheckResult, ExternalRiskData, MintMetadata, PairData } from "./types.js";

function money(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return "unavailable";
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function check(
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
  risk: ExternalRiskData,
  mint: MintMetadata,
): AnalysisResult {
  const liquidity = pair?.liquidityUsd;
  const volume = pair?.volume24hUsd;
  const ratio = liquidity && liquidity > 0 && volume !== undefined ? volume / liquidity : undefined;
  const topWallets = risk.holder?.topWalletsPercent;

  const checks: CheckResult[] = [
    liquidity === undefined
      ? check("liquidity-threshold", "Minimum liquidity", "unknown", "Liquidity data unavailable")
      : check(
          "liquidity-threshold",
          "Minimum liquidity",
          liquidity >= config.minLiquidityUsd ? "pass" : "fail",
          `${money(liquidity)} ${liquidity >= config.minLiquidityUsd ? "meets" : "is below"} the ${money(config.minLiquidityUsd)} threshold`,
          "DexScreener",
        ),
    liquidity === undefined
      ? check("liquidity-active", "Active liquidity", "unknown", "Pair liquidity data unavailable")
      : check(
          "liquidity-active",
          "Active liquidity",
          liquidity > 0 ? "pass" : "fail",
          liquidity > 0 ? "Pair reports non-zero liquidity" : "Pair reports zero liquidity",
          "DexScreener",
        ),
    topWallets === undefined
      ? check("holder-concentration", "Top-wallet concentration", "unknown", "Holder distribution unavailable", risk.holder?.source)
      : check(
          "holder-concentration",
          "Top-wallet concentration",
          topWallets <= config.maxHolderConcentrationPercent ? "pass" : "fail",
          `Top ${Math.min(10, risk.holder?.holdersChecked ?? 10)} reported wallets hold ${topWallets.toFixed(2)}%; limit is ${config.maxHolderConcentrationPercent}%`,
          risk.holder?.source,
        ),
    mint.accountFound === false
      ? check("mint-authority", "Mint authority revoked", "unknown", "Mint account could not be read from Solana RPC", "Solana RPC")
      : check(
          "mint-authority",
          "Mint authority revoked",
          mint.mintAuthorityRevoked ? "pass" : "fail",
          mint.mintAuthorityRevoked ? "Mint authority is revoked" : "Mint authority is still present",
          "Solana RPC",
        ),
    ratio === undefined
      ? check("volume-liquidity-ratio", "Volume/liquidity sanity", "unknown", "24h volume or liquidity unavailable", "DexScreener")
      : check(
          "volume-liquidity-ratio",
          "Volume/liquidity sanity",
          ratio <= config.maxVolumeLiquidityRatio ? "pass" : "fail",
          `24h volume is ${ratio.toFixed(2)}× reported liquidity; limit is ${config.maxVolumeLiquidityRatio}×`,
          "DexScreener",
        ),
  ];

  const passedChecks = checks.filter((item) => item.status === "pass").length;
  const totalChecks = checks.length;
  const score = Math.round((passedChecks / totalChecks) * 100);

  return {
    tokenAddress,
    pair,
    tokenName: pair?.baseToken.name,
    tokenSymbol: pair?.baseToken.symbol,
    checks,
    passedChecks,
    totalChecks,
    score,
    riskLevel: score >= 80 ? "LOWER" : score >= 60 ? "MODERATE" : "HIGHER",
    metrics: {
      liquidityUsd: liquidity,
      volume24hUsd: volume,
      volumeLiquidityRatio: ratio,
      topHolderPercent: risk.holder?.topHolderPercent,
      mintAuthorityRevoked: mint.mintAuthorityRevoked,
      freezeAuthorityRevoked: mint.freezeAuthorityRevoked,
      rugCheckRiskCount: risk.riskCount,
    },
    analyzedAt: new Date().toISOString(),
  };
}
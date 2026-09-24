import type { AnalysisResult, CheckResult } from "./types.js";

function escapeHtml(value: unknown): string {
  return String(value ?? "unavailable")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function compactMoney(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return "n/a";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function statusIcon(status: CheckResult["status"]): string {
  return status === "pass" ? "✅" : status === "fail" ? "❌" : "⚪";
}

export function formatAnalysis(result: AnalysisResult, alert = false): string {
  const symbol = result.tokenSymbol ? `$${result.tokenSymbol}` : "Solana token";
  const pairUrl = result.pair?.url ?? `https://dexscreener.com/solana/${result.pair?.pairAddress ?? result.tokenAddress}`;
  const rugUrl = `https://rugcheck.xyz/tokens/${result.tokenAddress}`;
  const checks = result.checks
    .map((item) => `${statusIcon(item.status)} <b>${escapeHtml(item.label)}</b> — ${escapeHtml(item.detail)}`)
    .join("\n");
  const unknowns = result.checks.filter((item) => item.status === "unknown").length;
  const header = alert ? "🚨 <b>New Solana token signal</b>" : "🔎 <b>Solana token due-diligence report</b>";

  return [
    header,
    `<b>${escapeHtml(symbol)}</b>${result.tokenName ? ` — ${escapeHtml(result.tokenName)}` : ""}`,
    `<code>${escapeHtml(result.tokenAddress)}</code>`,
    "",
    `<b>Score:</b> ${result.passedChecks}/${result.totalChecks} checks passed (${result.score}/100)`,
    `<b>Risk label:</b> ${result.riskLevel} · ${unknowns} unknown`,
    "",
    `<b>Market snapshot</b>`,
    `Liquidity: ${compactMoney(result.metrics.liquidityUsd)} · 24h volume: ${compactMoney(result.metrics.volume24hUsd)}`,
    `Largest holder: ${result.metrics.topHolderPercent === undefined ? "n/a" : `${result.metrics.topHolderPercent.toFixed(2)}%`}`,
    `Mint authority: ${result.metrics.mintAuthorityRevoked === undefined ? "unknown" : result.metrics.mintAuthorityRevoked ? "revoked" : "present"}`,
    "",
    `<b>Checklist</b>`,
    checks,
    "",
    `<a href="${escapeHtml(pairUrl)}">View on DexScreener</a> · <a href="${escapeHtml(rugUrl)}">Open RugCheck</a>`,
    "",
    "<i>Due-diligence automation, not financial advice or a prediction. Unknown checks are not passes.</i>",
  ].join("\n");
}
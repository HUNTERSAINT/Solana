import type { AnalysisResult, CheckResult, DiscoveredPair } from "./types";

function escapeHtml(value: unknown): string {
  return String(value ?? "unavailable").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function money(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return "n/a";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function icon(status: CheckResult["status"]): string {
  return status === "pass" ? "✅" : "⚠️";
}

function compactChecks(checks: CheckResult[] | undefined): string {
  if (!checks?.length) return "⚠️ Safety checks unavailable";
  return checks
    .filter((check) =>
      ["mint-authority", "holder-concentration", "sellability", "liquidity-lock", "market-anomaly"].includes(check.key),
    )
    .map((check) => `${icon(check.status)} ${escapeHtml(check.label)} — ${escapeHtml(check.detail)}`)
    .join("\n");
}

function pairSections(pairs: DiscoveredPair[]): string[] {
  const groups = new Map<string, DiscoveredPair[]>();
  for (const pair of pairs) {
    const group = groups.get(pair.tokenAddress) ?? [];
    group.push(pair);
    groups.set(pair.tokenAddress, group);
  }

  return [...groups.values()].map((group) => {
    const first = group[0];
    const token = first.tokenSymbol ? `$${first.tokenSymbol}` : first.tokenName ?? "Unknown token";
    const pairEntries = group.map((pair, index) => {
      const quote = pair.quoteSymbol ? ` / ${pair.quoteSymbol}` : "";
      const pairUrl = pair.pairUrl ?? `https://dexscreener.com/solana/${pair.pairAddress}`;
      return [
        `<b>Pair ${index + 1}: ${escapeHtml(token)}${escapeHtml(quote)}</b> · ${escapeHtml(pair.dexId)}`,
        `<code>${escapeHtml(pair.tokenAddress)}</code>`,
        `Liquidity: ${money(pair.liquidityUsd)} · 24h volume: ${money(pair.volume24hUsd)}`,
        compactChecks(pair.checks),
        `<a href="${escapeHtml(pairUrl)}">View pair on DexScreener</a>`,
      ].join("\n");
    });
    return pairEntries.join("\n\n");
  });
}

export function formatPairMessages(pairs: DiscoveredPair[]): string[] {
  if (pairs.length === 0) {
    return ["No eligible Solana pairs have been discovered yet. Try again after the next screener poll."];
  }

  const chunks: string[] = [];
  let current = "📊 <b>Recently discovered Solana pairs</b>";
  for (const section of pairSections(pairs)) {
    if (current.length + section.length + 2 > 3_800 && current !== "📊 <b>Recently discovered Solana pairs</b>") {
      chunks.push(current);
      current = "📊 <b>Recently discovered Solana pairs (continued)</b>";
    }
    current += `\n\n${section}`;
  }
  chunks.push(current);
  return chunks;
}

export function formatPairs(pairs: DiscoveredPair[]): string {
  return formatPairMessages(pairs).join("\n\n");
}

export function formatAnalysis(result: AnalysisResult, alert = false): string {
  const pairUrl = result.pair?.url ?? `https://dexscreener.com/solana/${result.pair?.pairAddress ?? result.tokenAddress}`;
  const checks = result.checks.map((check) => `${icon(check.status)} <b>${escapeHtml(check.label)}</b> — ${escapeHtml(check.detail)}`).join("\n");
  return [
    alert ? "🚨 <b>New Solana pair safety report</b>" : "🔎 <b>Solana token safety report</b>",
    `<b>${escapeHtml(result.tokenSymbol ? `$${result.tokenSymbol}` : "Solana token")}</b>${result.tokenName ? ` — ${escapeHtml(result.tokenName)}` : ""}`,
    `<code>${escapeHtml(result.tokenAddress)}</code>`,
    "",
    `<b>Safety checks:</b> ${result.passedChecks}/${result.totalChecks} verified (${result.score}/100)`,
    "",
    `<b>Market snapshot</b>`,
    `Liquidity: ${money(result.metrics.liquidityUsd)} · 24h volume: ${money(result.metrics.volume24hUsd)}`,
    `Largest holder: ${result.metrics.topHolderPercent === undefined ? "n/a" : `${result.metrics.topHolderPercent.toFixed(2)}%`}`,
    `Mint authority: ${result.metrics.mintAuthorityRevoked === undefined ? "unknown" : result.metrics.mintAuthorityRevoked ? "revoked" : "present"}`,
    "",
    "<b>Checklist — objective data only</b>",
    checks,
    "",
    `<a href="${escapeHtml(pairUrl)}">View on DexScreener</a> · <a href="https://rugcheck.xyz/tokens/${escapeHtml(result.tokenAddress)}">Open RugCheck</a>`,
    "",
    "<i>Due-diligence automation, not financial advice or a prediction. Unknown checks are not passes.</i>",
  ].join("\n");
}
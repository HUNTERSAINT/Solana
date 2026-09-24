import { config } from "./config.js";
import type { PairData } from "./types.js";

interface DexPair {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  volume?: { h24?: number };
  pairCreatedAt?: number;
  [key: string]: unknown;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15_000),
    headers: { accept: "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`DexScreener returned ${response.status} for ${url}`);
  return response.json() as Promise<T>;
}

function toPairData(pair: DexPair): PairData | null {
  if (!pair.pairAddress || !pair.baseToken?.address || !pair.chainId) return null;
  return {
    pairAddress: pair.pairAddress,
    chainId: pair.chainId,
    dexId: pair.dexId ?? "unknown",
    url: pair.url,
    baseToken: {
      address: pair.baseToken.address,
      name: pair.baseToken.name,
      symbol: pair.baseToken.symbol,
    },
    quoteToken: pair.quoteToken
      ? {
          address: pair.quoteToken.address,
          name: pair.quoteToken.name,
          symbol: pair.quoteToken.symbol,
        }
      : undefined,
    priceUsd: pair.priceUsd ? Number(pair.priceUsd) : undefined,
    liquidityUsd: pair.liquidity?.usd,
    fdvUsd: pair.fdv,
    marketCapUsd: pair.marketCap,
    volume24hUsd: pair.volume?.h24,
    pairCreatedAt: pair.pairCreatedAt,
    raw: pair,
  };
}

export class DexScreenerClient {
  async search(term: string): Promise<PairData[]> {
    const response = await fetchJson<{ pairs?: DexPair[] }>(
      `${config.dexscreenerApiUrl}/latest/dex/search?q=${encodeURIComponent(term)}`,
    );
    return (response.pairs ?? [])
      .map(toPairData)
      .filter((pair): pair is PairData => Boolean(pair))
      .filter((pair) => pair.chainId.toLowerCase() === "solana");
  }

  async getTokenPairs(address: string): Promise<PairData[]> {
    const response = await fetchJson<{ pairs?: DexPair[] }>(
      `${config.dexscreenerApiUrl}/latest/dex/tokens/${encodeURIComponent(address)}`,
    );
    return (response.pairs ?? [])
      .map(toPairData)
      .filter((pair): pair is PairData => Boolean(pair))
      .filter((pair) => pair.chainId.toLowerCase() === "solana");
  }

  async discover(): Promise<PairData[]> {
    const seen = new Set<string>();
    const pairs: PairData[] = [];
    for (const term of config.searchTerms) {
      try {
        for (const pair of await this.search(term)) {
          if (!seen.has(pair.pairAddress)) {
            seen.add(pair.pairAddress);
            pairs.push(pair);
          }
        }
      } catch (error) {
        console.warn(`[dex] search "${term}" failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return pairs;
  }
}
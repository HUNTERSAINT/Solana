import { screenerConfig } from "./config";
import type { MintMetadata, PairData, SafetyData } from "./types";
import { logger } from "../lib/logger";
import { fetchWithRetry } from "./retry";

interface DexPair {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  [key: string]: unknown;
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithRetry(url, {
    ...init,
    headers: { accept: "application/json", ...(init?.headers ?? {}) },
  }, url);
  if (!response.ok) throw new Error(`${response.status} from ${url}`);
  return response.json() as Promise<T>;
}

function toPair(pair: DexPair): PairData | undefined {
  if (!pair.pairAddress || !pair.chainId || !pair.baseToken?.address) return undefined;
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
    volume24hUsd: pair.volume?.h24,
    fdvUsd: pair.fdv,
    marketCapUsd: pair.marketCap,
    pairCreatedAt: pair.pairCreatedAt,
    raw: pair,
  };
}

export class DexScreenerClient {
  async search(term: string): Promise<PairData[]> {
    const data = await getJson<{ pairs?: DexPair[] }>(
      `${screenerConfig.dexscreenerUrl}/latest/dex/search?q=${encodeURIComponent(term)}`,
    );
    return (data.pairs ?? [])
      .map(toPair)
      .filter((pair): pair is PairData => Boolean(pair))
      .filter((pair) => pair.chainId.toLowerCase() === "solana");
  }

  async tokenPairs(address: string): Promise<PairData[]> {
    const data = await getJson<{ pairs?: DexPair[] }>(
      `${screenerConfig.dexscreenerUrl}/latest/dex/tokens/${encodeURIComponent(address)}`,
    );
    return (data.pairs ?? [])
      .map(toPair)
      .filter((pair): pair is PairData => Boolean(pair))
      .filter((pair) => pair.chainId.toLowerCase() === "solana");
  }

  async discover(): Promise<PairData[]> {
    const seen = new Set<string>();
    const result: PairData[] = [];
    for (const term of screenerConfig.searchTerms) {
      try {
        for (const pair of await this.search(term)) {
          if (!seen.has(pair.pairAddress)) {
            seen.add(pair.pairAddress);
            result.push(pair);
          }
        }
      } catch (error) {
        logger.warn({ err: error, term }, "DexScreener discovery search failed");
      }
    }
    return result;
  }
}

function percent(value: unknown): number | undefined {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return undefined;
  return number <= 1 ? number * 100 : number;
}

export interface RiskData {
  topHolderPercent?: number;
  topWalletsPercent?: number;
  holdersChecked?: number;
  riskCount?: number;
  riskNames?: string[];
  source?: string;
}

export interface TokenSecurityData {
  topWalletsPercent?: number;
  holdersChecked?: number;
  safety: SafetyData;
  source?: string;
}

export async function fetchRiskData(address: string): Promise<RiskData> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (screenerConfig.rugcheckApiKey) headers["X-API-KEY"] = screenerConfig.rugcheckApiKey;
  try {
    const response = await fetch(`${screenerConfig.rugcheckUrl}/v1/tokens/${address}/report`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`${response.status} from RugCheck`);
    const report = (await response.json()) as Record<string, unknown>;
    const holders = Array.isArray(report.topHolders)
      ? report.topHolders
      : Array.isArray(report.holders)
        ? report.holders
        : [];
    const percentages = holders
      .map((holder) => {
        const value = holder as Record<string, unknown>;
        return percent(value.pct ?? value.percentage ?? value.ownership);
      })
      .filter((value): value is number => value !== undefined);
    const risks = Array.isArray(report.risks) ? report.risks : [];
    return {
      topHolderPercent: percentages[0],
      topWalletsPercent: percentages.length > 0 ? Math.min(100, percentages.slice(0, 10).reduce((sum, value) => sum + value, 0)) : undefined,
      holdersChecked: holders.length || undefined,
      riskCount: risks.length,
      riskNames: risks
        .map((risk) => (typeof risk === "string" ? risk : (risk as Record<string, unknown>).name))
        .filter((risk): risk is string => typeof risk === "string")
        .slice(0, 5),
      source: "RugCheck",
    };
  } catch (error) {
    logger.warn({ err: error, address }, "RugCheck request failed; holder checks will be unknown");
    return {};
  }
}

function flagIsOn(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

function reportRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

export async function fetchTokenSecurity(address: string): Promise<TokenSecurityData> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (screenerConfig.goplusApiKey) headers.authorization = `Bearer ${screenerConfig.goplusApiKey}`;

  try {
    const response = await fetchWithRetry(
      `${screenerConfig.goplusUrl}/api/v1/solana/token_security?contract_addresses=${encodeURIComponent(address)}`,
      { headers },
      "GoPlus Solana token security",
    );
    if (!response.ok) throw new Error(`${response.status} from GoPlus`);
    const body = (await response.json()) as { result?: unknown };
    const result = reportRecord(body.result);
    const report = reportRecord(result?.[address]) ?? (result ? reportRecord(Object.values(result)[0]) : undefined);
    if (!report) {
      return {
        safety: {
          sellability: { status: "unknown", detail: "GoPlus returned no token security report", source: "GoPlus" },
          liquidityLock: { status: "unknown", detail: "Liquidity lock data unavailable", source: "GoPlus" },
        },
      };
    }

    const holders = Array.isArray(report.holders) ? report.holders : [];
    const percentages = holders
      .map((holder) => {
        const record = reportRecord(holder);
        return percent(record?.percent ?? record?.percentage);
      })
      .filter((value): value is number => value !== undefined);
    const lpHolders = Array.isArray(report.lp_holders) ? report.lp_holders : [];
    const lockedLpHolders = lpHolders.filter((holder) => flagIsOn(reportRecord(holder)?.is_locked));
    const nonTransferable = flagIsOn(report.non_transferable);
    const defaultFrozen = String(report.default_account_state ?? "") === "2";
    const transferHook = reportRecord(report.transfer_hook);
    const maliciousHook = flagIsOn(transferHook?.malicious_address);
    const sellability = nonTransferable || defaultFrozen || maliciousHook
      ? {
          status: "fail" as const,
          detail: nonTransferable
            ? "Token is marked non-transferable"
            : defaultFrozen
              ? "New token accounts are frozen"
              : "A malicious transfer hook was reported",
          source: "GoPlus",
        }
      : {
          status: "unknown" as const,
          detail: "No explicit transfer restriction was reported; no sell simulation was available",
          source: "GoPlus",
        };

    return {
      topWalletsPercent: percentages.length ? Math.min(100, percentages.slice(0, 10).reduce((sum, value) => sum + value, 0)) : undefined,
      holdersChecked: holders.length || undefined,
      safety: {
        sellability,
        liquidityLock: lpHolders.length === 0
          ? { status: "unknown", detail: "Liquidity-lock records were unavailable", source: "GoPlus" }
          : lockedLpHolders.length > 0
            ? { status: "pass", detail: `Lock evidence found for ${lockedLpHolders.length} liquidity holder record(s)`, source: "GoPlus" }
            : { status: "fail", detail: "No locked liquidity holder was detected", source: "GoPlus" },
      },
      source: "GoPlus",
    };
  } catch (error) {
    logger.warn({ err: error, address }, "GoPlus request failed; sellability and lock checks will be unknown");
    return {
      safety: {
        sellability: { status: "unknown", detail: "GoPlus security data unavailable", source: "GoPlus" },
        liquidityLock: { status: "unknown", detail: "GoPlus liquidity-lock data unavailable", source: "GoPlus" },
      },
    };
  }
}

function parseMintAccount(data: string): MintMetadata {
  const buffer = Buffer.from(data, "base64");
  if (buffer.length < 82) return { accountFound: false };
  return {
    accountFound: true,
    mintAuthorityRevoked: buffer.readUInt32LE(0) === 0,
    freezeAuthorityRevoked: buffer.readUInt32LE(46) === 0,
    decimals: buffer[44],
  };
}

export async function fetchMintMetadata(address: string): Promise<MintMetadata> {
  try {
    const response = await fetchWithRetry(screenerConfig.solanaRpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: [address, { encoding: "base64", commitment: "confirmed" }],
      }),
    }, "Solana RPC getAccountInfo");
    if (!response.ok) throw new Error(`${response.status} from Solana RPC`);
    const body = (await response.json()) as { result?: { value?: { data?: [string, string] } | null } };
    const data = body.result?.value?.data?.[0];
    return data ? parseMintAccount(data) : { accountFound: false };
  } catch (error) {
    logger.warn({ err: error, address }, "Solana mint metadata request failed");
    return { accountFound: false };
  }
}
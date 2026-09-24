import { config } from "./config.js";
import type { ExternalRiskData, MintMetadata } from "./types.js";

function asPercent(value: unknown): number | undefined {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return undefined;
  return number <= 1 ? number * 100 : number;
}

export async function fetchRugCheck(address: string): Promise<ExternalRiskData> {
  const headers: HeadersInit = { accept: "application/json" };
  if (config.rugcheckApiKey) headers["X-API-KEY"] = config.rugcheckApiKey;

  try {
    const response = await fetch(`${config.rugcheckApiUrl}/v1/tokens/${address}/report`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`RugCheck returned ${response.status}`);
    const report = (await response.json()) as Record<string, any>;
    const holders = Array.isArray(report.topHolders)
      ? report.topHolders
      : Array.isArray(report.holders)
        ? report.holders
        : [];
    const percentages = holders
      .map((holder) => asPercent(holder.pct ?? holder.percentage ?? holder.ownership ?? holder.amount))
      .filter((value): value is number => value !== undefined);
    const risks = Array.isArray(report.risks) ? report.risks : [];

    return {
      holder: {
        topHolderPercent: percentages[0],
        topWalletsPercent: percentages.length > 0 ? percentages.slice(0, 10).reduce((sum, value) => sum + value, 0) : undefined,
        holdersChecked: holders.length || undefined,
        source: "RugCheck",
      },
      riskCount: risks.length,
      riskNames: risks
        .map((risk) => (typeof risk === "string" ? risk : risk.name ?? risk.description))
        .filter(Boolean)
        .slice(0, 5),
      source: "RugCheck",
    };
  } catch (error) {
    console.warn(`[rugcheck] ${address}: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}

function rpcMintMetadata(data: string): MintMetadata {
  const buffer = Buffer.from(data, "base64");
  if (buffer.length < 82) return { accountFound: false };
  const mintAuthorityOption = buffer.readUInt32LE(0);
  const freezeAuthorityOption = buffer.readUInt32LE(46);
  return {
    accountFound: true,
    mintAuthorityRevoked: mintAuthorityOption === 0,
    freezeAuthorityRevoked: freezeAuthorityOption === 0,
    decimals: buffer[44],
  };
}

export async function fetchMintMetadata(address: string): Promise<MintMetadata> {
  try {
    const response = await fetch(config.solanaRpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: [address, { encoding: "base64", commitment: "confirmed" }],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Solana RPC returned ${response.status}`);
    const body = (await response.json()) as {
      result?: { value?: { data?: [string, string] } | null };
    };
    const data = body.result?.value?.data?.[0];
    return data ? rpcMintMetadata(data) : { accountFound: false };
  } catch (error) {
    console.warn(`[solana] ${address}: ${error instanceof Error ? error.message : String(error)}`);
    return { accountFound: false };
  }
}
import { DexScreenerClient } from "./dexscreener.js";
import { fetchMintMetadata, fetchRugCheck } from "./risk-data.js";
import { scoreToken } from "./scoring.js";
import type { AnalysisResult, PairData } from "./types.js";

export class TokenAnalyzer {
  constructor(private readonly dex = new DexScreenerClient()) {}

  async analyze(address: string, suppliedPair?: PairData): Promise<AnalysisResult> {
    let pair = suppliedPair;
    if (!pair) {
      const pairs = await this.dex.getTokenPairs(address);
      pair = pairs.sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))[0];
    }

    const [risk, mint] = await Promise.all([fetchRugCheck(address), fetchMintMetadata(address)]);
    return scoreToken(address, pair, risk, mint);
  }
}
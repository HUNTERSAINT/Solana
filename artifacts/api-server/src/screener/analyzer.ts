import { DexScreenerClient, fetchMintMetadata, fetchRiskData, fetchTokenSecurity } from "./sources";
import { scoreToken } from "./scoring";
import type { AnalysisResult, PairData } from "./types";

export class TokenAnalyzer {
  constructor(private readonly dex = new DexScreenerClient()) {}

  async analyze(address: string, suppliedPair?: PairData): Promise<AnalysisResult> {
    let pair = suppliedPair;
    if (!pair) {
      const pairs = await this.dex.tokenPairs(address);
      pair = pairs.sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))[0];
    }
    const [risk, mint, security] = await Promise.all([
      fetchRiskData(address),
      fetchMintMetadata(address),
      fetchTokenSecurity(address),
    ]);
    return scoreToken(
      address,
      pair,
      {
        ...risk,
        topWalletsPercent: risk.topWalletsPercent ?? security.topWalletsPercent,
        holdersChecked: risk.holdersChecked ?? security.holdersChecked,
      },
      mint,
      security.safety,
    );
  }
}
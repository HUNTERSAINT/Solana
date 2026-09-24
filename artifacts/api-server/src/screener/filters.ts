import { screenerConfig } from "./config";
import type { PairData } from "./types";

export function pairAnomalies(pair: PairData): string[] {
  const liquidity = pair.liquidityUsd;
  const volume = pair.volume24hUsd;
  const anomalies: string[] = [];

  if (
    liquidity !== undefined &&
    liquidity >= screenerConfig.anomalyLiquidityUsd &&
    volume !== undefined &&
    volume <= screenerConfig.anomalyZeroVolumeUsd
  ) {
    anomalies.push("high liquidity with zero/near-zero 24h volume");
  }

  if (
    liquidity !== undefined &&
    liquidity > 0 &&
    volume !== undefined &&
    volume / liquidity >= screenerConfig.anomalyVolumeLiquidityRatio
  ) {
    anomalies.push("24h volume is unusually high relative to liquidity");
  }

  return anomalies;
}

export function includePair(pair: PairData): boolean {
  const liquidity = pair.liquidityUsd;
  const volume = pair.volume24hUsd;

  if (liquidity === undefined) return true;
  if (liquidity >= screenerConfig.minLiquidityUsd) return true;

  const ratio = liquidity > 0 && volume !== undefined ? volume / liquidity : 0;
  return (
    volume !== undefined &&
    volume >= screenerConfig.lowLiquidityMinVolumeUsd &&
    ratio >= screenerConfig.lowLiquidityVolumeRatioOverride
  );
}

export function groupTopPairs(pairs: PairData[], perToken = 2): PairData[] {
  const groups = new Map<string, PairData[]>();
  for (const pair of pairs) {
    const group = groups.get(pair.baseToken.address) ?? [];
    group.push(pair);
    groups.set(pair.baseToken.address, group);
  }

  return [...groups.values()].flatMap((group) =>
    group
      .sort((a, b) => (b.liquidityUsd ?? -1) - (a.liquidityUsd ?? -1))
      .slice(0, perToken),
  );
}
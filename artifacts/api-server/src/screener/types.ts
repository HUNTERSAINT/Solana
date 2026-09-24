export type CheckStatus = "pass" | "fail" | "unknown";

export interface PairData {
  pairAddress: string;
  chainId: string;
  dexId: string;
  url?: string;
  baseToken: { address: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: number;
  liquidityUsd?: number;
  volume24hUsd?: number;
  fdvUsd?: number;
  marketCapUsd?: number;
  pairCreatedAt?: number;
  raw: unknown;
}

export type SafetyStatus = "pass" | "fail" | "unknown";

export interface SafetyData {
  sellability: {
    status: SafetyStatus;
    detail: string;
    source?: string;
  };
  liquidityLock: {
    status: SafetyStatus;
    detail: string;
    source?: string;
  };
}

export interface DiscoveredPair {
  pairAddress: string;
  tokenAddress: string;
  tokenName?: string;
  tokenSymbol?: string;
  dexId: string;
  quoteSymbol?: string;
  liquidityUsd?: number;
  volume24hUsd?: number;
  pairUrl?: string;
  lastSeenAt: string;
  pairRank?: number;
  groupRank?: number;
  score?: number;
  checks?: CheckResult[];
}

export interface CheckResult {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
  source?: string;
}

export interface AnalysisResult {
  tokenAddress: string;
  tokenName?: string;
  tokenSymbol?: string;
  pair?: PairData;
  checks: CheckResult[];
  passedChecks: number;
  totalChecks: number;
  score: number;
  riskLevel: "LOWER" | "MODERATE" | "HIGHER";
  metrics: {
    liquidityUsd?: number;
    volume24hUsd?: number;
    volumeLiquidityRatio?: number;
    topHolderPercent?: number;
    topWalletsPercent?: number;
    mintAuthorityRevoked?: boolean;
    freezeAuthorityRevoked?: boolean;
    rugCheckRiskCount?: number;
    anomalyFlags?: string[];
    sellabilityStatus?: SafetyStatus;
    liquidityLockStatus?: SafetyStatus;
  };
  analyzedAt: string;
}

export interface MintMetadata {
  accountFound: boolean;
  mintAuthorityRevoked?: boolean;
  freezeAuthorityRevoked?: boolean;
  decimals?: number;
}
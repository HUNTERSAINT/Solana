export type CheckStatus = "pass" | "fail" | "unknown";

export interface CheckResult {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
  source?: string;
}

export interface PairData {
  pairAddress: string;
  chainId: string;
  dexId: string;
  url?: string;
  baseToken: {
    address: string;
    name?: string;
    symbol?: string;
  };
  quoteToken?: {
    address?: string;
    name?: string;
    symbol?: string;
  };
  priceUsd?: number;
  liquidityUsd?: number;
  fdvUsd?: number;
  marketCapUsd?: number;
  volume24hUsd?: number;
  pairCreatedAt?: number;
  raw: unknown;
}

export interface MintMetadata {
  accountFound: boolean;
  mintAuthorityRevoked?: boolean;
  freezeAuthorityRevoked?: boolean;
  decimals?: number;
}

export interface HolderData {
  topHolderPercent?: number;
  topWalletsPercent?: number;
  holdersChecked?: number;
  source?: string;
}

export interface ExternalRiskData {
  holder?: HolderData;
  riskCount?: number;
  riskNames?: string[];
  source?: string;
}

export interface AnalysisResult {
  tokenAddress: string;
  pair?: PairData;
  tokenName?: string;
  tokenSymbol?: string;
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
    mintAuthorityRevoked?: boolean;
    freezeAuthorityRevoked?: boolean;
    rugCheckRiskCount?: number;
  };
  analyzedAt: string;
}
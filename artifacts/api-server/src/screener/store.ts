import { pool } from "@workspace/db";
import { screenerConfig } from "./config";
import type { AnalysisResult, DiscoveredPair, PairData } from "./types";

export async function initScreenerStore(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS screener_tokens (
      address TEXT PRIMARY KEY,
      name TEXT,
      symbol TEXT,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      raw_data JSONB NOT NULL DEFAULT '{}'::jsonb
    );
    CREATE TABLE IF NOT EXISTS screener_pairs (
      pair_address TEXT PRIMARY KEY,
      token_address TEXT NOT NULL REFERENCES screener_tokens(address) ON DELETE CASCADE,
      chain_id TEXT NOT NULL,
      dex_id TEXT NOT NULL,
      pair_url TEXT,
      quote_symbol TEXT,
      price_usd NUMERIC,
      liquidity_usd NUMERIC,
      volume_24h_usd NUMERIC,
      fdv_usd NUMERIC,
      market_cap_usd NUMERIC,
      pair_created_at TIMESTAMPTZ,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      raw_data JSONB NOT NULL DEFAULT '{}'::jsonb
    );
    CREATE TABLE IF NOT EXISTS screener_pair_observations (
      id BIGSERIAL PRIMARY KEY,
      pair_address TEXT NOT NULL REFERENCES screener_pairs(pair_address) ON DELETE CASCADE,
      observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      price_usd NUMERIC,
      liquidity_usd NUMERIC,
      volume_24h_usd NUMERIC,
      fdv_usd NUMERIC,
      market_cap_usd NUMERIC
    );
    CREATE TABLE IF NOT EXISTS screener_analyses (
      id BIGSERIAL PRIMARY KEY,
      token_address TEXT NOT NULL REFERENCES screener_tokens(address) ON DELETE CASCADE,
      pair_address TEXT REFERENCES screener_pairs(pair_address) ON DELETE SET NULL,
      score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
      passed_checks INTEGER NOT NULL,
      total_checks INTEGER NOT NULL,
      risk_level TEXT NOT NULL,
      checks JSONB NOT NULL,
      metrics JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS screener_pairs_token_idx ON screener_pairs(token_address);
    CREATE INDEX IF NOT EXISTS screener_analyses_token_idx ON screener_analyses(token_address, created_at DESC);
    CREATE INDEX IF NOT EXISTS screener_observations_pair_idx ON screener_pair_observations(pair_address, observed_at DESC);
  `);
}

export async function upsertToken(address: string, name?: string, symbol?: string, rawData: unknown = {}): Promise<void> {
  await pool.query(
    `INSERT INTO screener_tokens (address, name, symbol, raw_data)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (address) DO UPDATE SET
       name = COALESCE(EXCLUDED.name, screener_tokens.name),
       symbol = COALESCE(EXCLUDED.symbol, screener_tokens.symbol),
       last_seen_at = NOW(),
       raw_data = EXCLUDED.raw_data`,
    [address, name ?? null, symbol ?? null, JSON.stringify(rawData)],
  );
}

export async function upsertPair(pair: PairData): Promise<boolean> {
  const inserted = await pool.query<{ is_new: boolean }>(
    `WITH inserted AS (
       INSERT INTO screener_pairs (
         pair_address, token_address, chain_id, dex_id, pair_url, quote_symbol,
         price_usd, liquidity_usd, volume_24h_usd, fdv_usd, market_cap_usd,
         pair_created_at, raw_data
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (pair_address) DO NOTHING
       RETURNING pair_address
     )
     SELECT EXISTS (SELECT 1 FROM inserted) AS is_new`,
    [
      pair.pairAddress,
      pair.baseToken.address,
      pair.chainId,
      pair.dexId,
      pair.url ?? null,
      pair.quoteToken?.symbol ?? null,
      pair.priceUsd ?? null,
      pair.liquidityUsd ?? null,
      pair.volume24hUsd ?? null,
      pair.fdvUsd ?? null,
      pair.marketCapUsd ?? null,
      pair.pairCreatedAt ? new Date(pair.pairCreatedAt).toISOString() : null,
      JSON.stringify(pair.raw),
    ],
  );
  await pool.query(
    `UPDATE screener_pairs SET last_seen_at = NOW(), price_usd = $2, liquidity_usd = $3,
      volume_24h_usd = $4, fdv_usd = $5, market_cap_usd = $6, raw_data = $7
     WHERE pair_address = $1`,
    [pair.pairAddress, pair.priceUsd ?? null, pair.liquidityUsd ?? null, pair.volume24hUsd ?? null, pair.fdvUsd ?? null, pair.marketCapUsd ?? null, JSON.stringify(pair.raw)],
  );
  await pool.query(
    `INSERT INTO screener_pair_observations (pair_address, price_usd, liquidity_usd, volume_24h_usd, fdv_usd, market_cap_usd)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [pair.pairAddress, pair.priceUsd ?? null, pair.liquidityUsd ?? null, pair.volume24hUsd ?? null, pair.fdvUsd ?? null, pair.marketCapUsd ?? null],
  );
  return inserted.rows[0]?.is_new ?? false;
}

export async function saveAnalysis(result: AnalysisResult): Promise<void> {
  await pool.query(
    `INSERT INTO screener_analyses
      (token_address, pair_address, score, passed_checks, total_checks, risk_level, checks, metrics)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [result.tokenAddress, result.pair?.pairAddress ?? null, result.score, result.passedChecks, result.totalChecks, result.riskLevel, JSON.stringify(result.checks), JSON.stringify(result.metrics)],
  );
}

export async function analysisIsStale(pairAddress: string): Promise<boolean> {
  const result = await pool.query<{ created_at: Date | string }>(
    `SELECT created_at
     FROM screener_analyses
     WHERE pair_address = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [pairAddress],
  );
  const createdAt = result.rows[0]?.created_at;
  return !createdAt || Date.now() - new Date(createdAt).getTime() >= screenerConfig.analysisRefreshMs;
}

export async function recentTokens(limit = 25): Promise<unknown[]> {
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  const result = await pool.query(
    `SELECT t.address, t.name, t.symbol, t.first_seen_at, t.last_seen_at,
      a.score, a.passed_checks, a.total_checks, a.risk_level, a.created_at AS analyzed_at,
      p.liquidity_usd, p.volume_24h_usd, p.pair_url
     FROM screener_tokens t
     LEFT JOIN LATERAL (SELECT * FROM screener_analyses WHERE token_address = t.address ORDER BY created_at DESC LIMIT 1) a ON TRUE
     LEFT JOIN LATERAL (SELECT * FROM screener_pairs WHERE token_address = t.address ORDER BY liquidity_usd DESC NULLS LAST LIMIT 1) p ON TRUE
     ORDER BY t.last_seen_at DESC LIMIT $1`,
    [safeLimit],
  );
  return result.rows;
}

export async function recentPairs(limit = 10): Promise<DiscoveredPair[]> {
  const safeLimit = Math.min(20, Math.max(1, Math.floor(limit)));
  const result = await pool.query<DiscoveredPair>(
    `WITH eligible AS (
       SELECT p.*,
         ROW_NUMBER() OVER (
           PARTITION BY p.token_address
           ORDER BY p.liquidity_usd DESC NULLS LAST, p.last_seen_at DESC
         ) AS pair_rank,
         MAX(p.last_seen_at) OVER (PARTITION BY p.token_address) AS token_last_seen
       FROM screener_pairs p
       WHERE p.liquidity_usd IS NULL
          OR p.liquidity_usd >= $1
          OR (
            p.liquidity_usd > 0
            AND p.volume_24h_usd >= $2
            AND p.volume_24h_usd / p.liquidity_usd >= $3
          )
     ),
     token_order AS (
       SELECT token_address,
         ROW_NUMBER() OVER (ORDER BY MAX(token_last_seen) DESC) AS group_rank
       FROM eligible
       GROUP BY token_address
     )
     SELECT e.pair_address AS "pairAddress",
       e.token_address AS "tokenAddress",
       t.name AS "tokenName",
       t.symbol AS "tokenSymbol",
       e.dex_id AS "dexId",
       e.quote_symbol AS "quoteSymbol",
       e.liquidity_usd::double precision AS "liquidityUsd",
       e.volume_24h_usd::double precision AS "volume24hUsd",
       e.pair_url AS "pairUrl",
       e.last_seen_at::text AS "lastSeenAt",
       e.pair_rank AS "pairRank",
       o.group_rank AS "groupRank",
       a.score,
       a.checks
     FROM eligible e
     JOIN token_order o ON o.token_address = e.token_address
     JOIN screener_tokens t ON t.address = e.token_address
     LEFT JOIN LATERAL (
       SELECT score, checks
       FROM screener_analyses
       WHERE pair_address = e.pair_address
       ORDER BY created_at DESC
       LIMIT 1
     ) a ON TRUE
     WHERE e.pair_rank <= 2 AND o.group_rank <= $4
     ORDER BY o.group_rank, e.pair_rank`,
    [
      screenerConfig.minLiquidityUsd,
      screenerConfig.lowLiquidityMinVolumeUsd,
      screenerConfig.lowLiquidityVolumeRatioOverride,
      safeLimit,
    ],
  );
  return result.rows;
}

export async function pairsForToken(address: string): Promise<DiscoveredPair[]> {
  const result = await pool.query<DiscoveredPair>(
    `SELECT p.pair_address AS "pairAddress",
       p.token_address AS "tokenAddress",
       t.name AS "tokenName",
       t.symbol AS "tokenSymbol",
       p.dex_id AS "dexId",
       p.quote_symbol AS "quoteSymbol",
       p.liquidity_usd::double precision AS "liquidityUsd",
       p.volume_24h_usd::double precision AS "volume24hUsd",
       p.pair_url AS "pairUrl",
       p.last_seen_at::text AS "lastSeenAt",
       a.score,
       a.checks
     FROM screener_pairs p
     JOIN screener_tokens t ON t.address = p.token_address
     LEFT JOIN LATERAL (
       SELECT score, checks
       FROM screener_analyses
       WHERE pair_address = p.pair_address
       ORDER BY created_at DESC
       LIMIT 1
     ) a ON TRUE
     WHERE p.token_address = $1
       AND (
         p.liquidity_usd IS NULL
         OR p.liquidity_usd >= $2
         OR (
           p.liquidity_usd > 0
           AND p.volume_24h_usd >= $3
           AND p.volume_24h_usd / p.liquidity_usd >= $4
         )
       )
     ORDER BY p.liquidity_usd DESC NULLS LAST, p.last_seen_at DESC`,
    [
      address,
      screenerConfig.minLiquidityUsd,
      screenerConfig.lowLiquidityMinVolumeUsd,
      screenerConfig.lowLiquidityVolumeRatioOverride,
    ],
  );
  return result.rows;
}

export async function tokenHistory(address: string): Promise<unknown> {
  const [token, analyses] = await Promise.all([
    pool.query("SELECT * FROM screener_tokens WHERE address = $1", [address]),
    pool.query("SELECT * FROM screener_analyses WHERE token_address = $1 ORDER BY created_at DESC LIMIT 50", [address]),
  ]);
  return token.rows.length ? { token: token.rows[0], analyses: analyses.rows } : null;
}
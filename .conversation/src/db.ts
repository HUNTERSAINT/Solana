import { Pool, type PoolClient } from "pg";
import { config } from "./config.js";
import type { AnalysisResult, PairData } from "./types.js";

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.pgSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function initSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tokens (
      address TEXT PRIMARY KEY,
      name TEXT,
      symbol TEXT,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      raw_data JSONB NOT NULL DEFAULT '{}'::jsonb
    );

    CREATE TABLE IF NOT EXISTS pairs (
      pair_address TEXT PRIMARY KEY,
      token_address TEXT NOT NULL REFERENCES tokens(address) ON DELETE CASCADE,
      chain_id TEXT NOT NULL,
      dex_id TEXT NOT NULL,
      pair_url TEXT,
      quote_symbol TEXT,
      price_usd NUMERIC,
      liquidity_usd NUMERIC,
      fdv_usd NUMERIC,
      market_cap_usd NUMERIC,
      volume_24h_usd NUMERIC,
      pair_created_at TIMESTAMPTZ,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      raw_data JSONB NOT NULL DEFAULT '{}'::jsonb
    );

    CREATE INDEX IF NOT EXISTS pairs_token_address_idx ON pairs(token_address);
    CREATE INDEX IF NOT EXISTS pairs_last_seen_at_idx ON pairs(last_seen_at DESC);

    CREATE TABLE IF NOT EXISTS pair_observations (
      id BIGSERIAL PRIMARY KEY,
      pair_address TEXT NOT NULL REFERENCES pairs(pair_address) ON DELETE CASCADE,
      observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      price_usd NUMERIC,
      liquidity_usd NUMERIC,
      volume_24h_usd NUMERIC,
      fdv_usd NUMERIC,
      market_cap_usd NUMERIC
    );

    CREATE INDEX IF NOT EXISTS pair_observations_pair_time_idx
      ON pair_observations(pair_address, observed_at DESC);

    CREATE TABLE IF NOT EXISTS analyses (
      id BIGSERIAL PRIMARY KEY,
      token_address TEXT NOT NULL REFERENCES tokens(address) ON DELETE CASCADE,
      pair_address TEXT REFERENCES pairs(pair_address) ON DELETE SET NULL,
      score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
      passed_checks INTEGER NOT NULL,
      total_checks INTEGER NOT NULL,
      risk_level TEXT NOT NULL,
      checks JSONB NOT NULL,
      metrics JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS analyses_token_created_idx
      ON analyses(token_address, created_at DESC);
  `);
}

export async function upsertToken(address: string, name?: string, symbol?: string, rawData: unknown = {}): Promise<void> {
  await pool.query(
    `INSERT INTO tokens (address, name, symbol, raw_data)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (address) DO UPDATE SET
       name = COALESCE(EXCLUDED.name, tokens.name),
       symbol = COALESCE(EXCLUDED.symbol, tokens.symbol),
       last_seen_at = NOW(),
       raw_data = EXCLUDED.raw_data`,
    [address, name ?? null, symbol ?? null, JSON.stringify(rawData)],
  );
}

export async function upsertPair(pair: PairData): Promise<boolean> {
  const result = await pool.query<{ is_new: boolean }>(
    `WITH inserted AS (
       INSERT INTO pairs (
         pair_address, token_address, chain_id, dex_id, pair_url, quote_symbol,
         price_usd, liquidity_usd, fdv_usd, market_cap_usd, volume_24h_usd,
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
      pair.fdvUsd ?? null,
      pair.marketCapUsd ?? null,
      pair.volume24hUsd ?? null,
      pair.pairCreatedAt ? new Date(pair.pairCreatedAt).toISOString() : null,
      JSON.stringify(pair.raw),
    ],
  );

  await pool.query(
    `UPDATE pairs SET
       last_seen_at = NOW(),
       price_usd = $2,
       liquidity_usd = $3,
       fdv_usd = $4,
       market_cap_usd = $5,
       volume_24h_usd = $6,
       raw_data = $7
     WHERE pair_address = $1`,
    [
      pair.pairAddress,
      pair.priceUsd ?? null,
      pair.liquidityUsd ?? null,
      pair.fdvUsd ?? null,
      pair.marketCapUsd ?? null,
      pair.volume24hUsd ?? null,
      JSON.stringify(pair.raw),
    ],
  );
  await pool.query(
    `INSERT INTO pair_observations (
       pair_address, price_usd, liquidity_usd, volume_24h_usd, fdv_usd, market_cap_usd
     )
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      pair.pairAddress,
      pair.priceUsd ?? null,
      pair.liquidityUsd ?? null,
      pair.volume24hUsd ?? null,
      pair.fdvUsd ?? null,
      pair.marketCapUsd ?? null,
    ],
  );

  return result.rows[0]?.is_new ?? false;
}

export async function saveAnalysis(result: AnalysisResult): Promise<void> {
  await pool.query(
    `INSERT INTO analyses (
       token_address, pair_address, score, passed_checks, total_checks,
       risk_level, checks, metrics
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      result.tokenAddress,
      result.pair?.pairAddress ?? null,
      result.score,
      result.passedChecks,
      result.totalChecks,
      result.riskLevel,
      JSON.stringify(result.checks),
      JSON.stringify(result.metrics),
    ],
  );
}

export async function listRecentTokens(limit = 25): Promise<unknown[]> {
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  const result = await pool.query(
    `SELECT
       t.address, t.name, t.symbol, t.first_seen_at, t.last_seen_at,
       a.score, a.passed_checks, a.total_checks, a.risk_level, a.created_at AS analyzed_at,
       p.liquidity_usd, p.volume_24h_usd, p.pair_url
     FROM tokens t
     LEFT JOIN LATERAL (
       SELECT * FROM analyses WHERE token_address = t.address ORDER BY created_at DESC LIMIT 1
     ) a ON TRUE
     LEFT JOIN LATERAL (
       SELECT * FROM pairs WHERE token_address = t.address ORDER BY liquidity_usd DESC NULLS LAST LIMIT 1
     ) p ON TRUE
     ORDER BY t.last_seen_at DESC
     LIMIT $1`,
    [safeLimit],
  );
  return result.rows;
}

export async function getTokenHistory(address: string): Promise<unknown> {
  const [token, analyses] = await Promise.all([
    pool.query("SELECT * FROM tokens WHERE address = $1", [address]),
    pool.query(
      "SELECT * FROM analyses WHERE token_address = $1 ORDER BY created_at DESC LIMIT 50",
      [address],
    ),
  ]);
  if (token.rows.length === 0) return null;
  return { token: token.rows[0], analyses: analyses.rows };
}
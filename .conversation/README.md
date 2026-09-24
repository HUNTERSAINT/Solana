# Solana Meme Coin Screener

A Node.js + TypeScript due-diligence assistant for Solana tokens. It polls DexScreener discovery searches, enriches the best pair with RugCheck and Solana RPC data, stores every observed pair and analysis in PostgreSQL, and can send new-token alerts through Telegram.

This is deliberately a **checklist, not a trading system**. A passing score is not a prediction, endorsement, or guarantee that a token is safe. Data that an upstream source cannot provide is shown as `unknown`, not counted as a pass.

## What it checks

Each analysis currently evaluates five signals:

- Minimum reported liquidity and non-zero active liquidity
- Largest reported holder concentration, when RugCheck provides holder data
- Whether the SPL mint authority is revoked, from Solana RPC
- Whether the 24-hour volume/liquidity ratio is within the configured sanity limit

The score is `passed checks / total checks`, expressed as a percentage. The API and Telegram output include the underlying checklist, sources, and metrics so a user can inspect why a score was produced.

## Requirements

- Node.js 20+
- PostgreSQL 14+
- A Telegram bot token from BotFather, if Telegram delivery is wanted

## Setup

```bash
cp .env.example .env
# Edit DATABASE_URL and, for Telegram, TELEGRAM_BOT_TOKEN and TELEGRAM_ALERT_CHAT_ID
npm install
npm run db:init
npm run dev
```

The application also runs the schema initializer at startup. `npm run db:init` is useful as an explicit connectivity check.

For production:

```bash
npm run build
npm start
```

## Configuration

See `.env.example` for every variable. Important defaults:

- `POLL_INTERVAL_SECONDS=60` controls discovery polling.
- `DEX_SEARCH_TERMS=SOL,USDC,USDT,WIF,BONK,MEME` controls the DexScreener searches.
- `MIN_LIQUIDITY_USD=10000` and `ALERT_MIN_SCORE=60` control the filter.
- `ALERT_ON_UNKNOWN=false` prevents alerts when a required upstream signal is unavailable.
- `RUGCHECK_API_KEY` is optional. The public endpoint may rate-limit; the app continues and records unknown holder data when it cannot fetch a report.

DexScreener does not expose a guaranteed chronological “all newly created Solana pairs” stream. This implementation uses several configurable search terms and PostgreSQL pair deduplication. For higher completeness, add a paid/indexer feed or a Solana log listener behind the same `PairData` interface.

## Telegram

Start the app with `TELEGRAM_BOT_TOKEN` set. The bot supports:

```text
/check <solana_token_address>
/help
```

Set `TELEGRAM_ALERT_CHAT_ID` to a channel or chat where the bot can post alerts. The bot needs permission to post in a channel. Telegram messages use HTML formatting and include links to DexScreener and RugCheck.

## HTTP API

- `GET /health` — process health check
- `GET /api/tokens?limit=25` — recently observed tokens and their latest analysis
- `GET /api/tokens/:address/check` — run and persist an on-demand analysis
- `GET /api/tokens/:address/history` — stored token metadata and up to 50 analyses

## Database

The app creates:

- `tokens` — one row per token address
- `pairs` — observed Solana pairs and their latest market state
- `pair_observations` — append-only market snapshots for historical tracking
- `analyses` — immutable score/checklist snapshots for historical tracking

For a managed PostgreSQL database, set `PGSSL=true` when the provider requires TLS. Do not commit `.env` or API keys.

## Operational notes

- Public APIs can rate-limit or return incomplete data. Failures are logged and represented as unknown checks where possible.
- The scoring layer never makes a price or profitability prediction.
- This starter does not execute trades, hold funds, or connect to a wallet.
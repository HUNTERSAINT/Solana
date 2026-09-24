# Solana Meme Coin Screener

This project contains a TypeScript API server that acts as a transparent Solana token safety-data assistant. It polls DexScreener, filters low-liquidity noise, groups pairs by token, enriches eligible pairs with RugCheck, GoPlus, and Solana RPC data, stores token/pair/analysis history in PostgreSQL, and optionally sends objective reports through grammY and Telegram.

It is not a trading system, price predictor, buy signal, or safety guarantee. Missing data is shown as `unknown`/`⚠️` and is never counted as a passed check.

## Run

The API artifact is already wired to the project workflow:

```bash
pnpm --filter @workspace/api-server run dev
```

The server creates its screener tables during startup. The project-provided `DATABASE_URL` is required.

## Optional configuration

Copy the values from [`artifacts/api-server/.env.example`](artifacts/api-server/.env.example) into the project environment when needed:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ALERT_CHAT_ID`
- `RUGCHECK_API_KEY`
- polling and scoring thresholds

Do not commit bot tokens or API keys. Use the project Secrets flow.

## API

- `GET /api/healthz`
- `GET /api/pairs?limit=10`
- `GET /api/pairs/:address`
- `GET /api/tokens?limit=25`
- `GET /api/tokens/:address/check`
- `GET /api/tokens/:address/history`

## Telegram

When `TELEGRAM_BOT_TOKEN` is configured, the bot supports:

```text
/check <solana_token_address>
/pairs [count]
/pairs <token_address>
/help
```

`/pairs` groups discovered tokens and shows up to the top two eligible pairs per token, ordered by liquidity. It returns up to 20 token groups and defaults to 10. `/pairs <token_address>` expands that token's eligible pairs.

Pairs below `MIN_LIQUIDITY_USD` are excluded unless they meet both the configured absolute-volume and volume/liquidity-ratio override. High-liquidity/zero-volume and unusually high volume/liquidity combinations remain visible with `⚠️ unusual — verify manually`.

Safety checks are objective evidence only: mint authority, top-10 holder concentration, transfer/sell restrictions, and detectable liquidity-lock evidence. If a provider cannot verify sellability or locking, the result is shown as `⚠️ unknown`.

Set `TELEGRAM_ALERT_CHAT_ID` to enable new-token alert delivery.

## Verification

```bash
pnpm run typecheck
pnpm --filter @workspace/api-server run build
```

## Deploy to Railway from GitHub

This repository includes a Dockerfile and `railway.toml` so Railway can deploy the pnpm monorepo consistently.

1. Push the repository to GitHub.
2. In Railway, create a new project and choose **Deploy from GitHub Repo**.
3. Select this repository and let Railway use the included Dockerfile.
4. Add a PostgreSQL service in the Railway project.
5. Add the following variables to the API service:
   - `DATABASE_URL` — reference the PostgreSQL service's `DATABASE_URL`
   - `TELEGRAM_BOT_TOKEN` — optional bot token
   - `TELEGRAM_ALERT_CHAT_ID` — optional alert destination
   - `RUGCHECK_API_KEY` — optional
    - `GOPLUS_API_KEY` — optional; enables the Solana token security equivalent for transfer restrictions, holder data, and liquidity-lock evidence
   - `SOLANA_RPC_URL` — recommended: a dedicated Solana RPC provider for production traffic
6. Deploy. Railway will run the API on its injected `PORT` and check `/api/healthz`.

The Telegram bot uses long polling, so deploy the API as an always-running Railway service. Do not run multiple replicas unless you switch Telegram delivery to webhooks; multiple pollers will compete for updates.

The default public Solana RPC endpoint can rate-limit. Set `SOLANA_RPC_URL` to a dedicated provider before relying on mint-authority checks in production.
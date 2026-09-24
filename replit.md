# Solana Meme Coin Screener

A TypeScript Solana token due-diligence assistant that polls market data, scores transparent safety checks, stores history in PostgreSQL, and can send Telegram alerts.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required runtime env: `DATABASE_URL` — provided by the project database
- Optional screener env: see `artifacts/api-server/.env.example`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/screener/sources.ts` — DexScreener, RugCheck, and Solana RPC clients
- `artifacts/api-server/src/screener/scoring.ts` — transparent five-check scoring rules
- `artifacts/api-server/src/screener/store.ts` — PostgreSQL schema and history persistence
- `artifacts/api-server/src/screener/telegram.ts` — grammY commands and alert delivery
- `artifacts/api-server/src/routes/screener.ts` — HTTP check, history, and recent-token endpoints
- `artifacts/api-server/.env.example` — optional configuration

## Architecture decisions

- The screener uses the existing `@workspace/db` PostgreSQL pool instead of creating a second database client.
- Public upstream failures produce `unknown` checks; unknown checks never count as passes.
- DexScreener discovery uses configurable search terms and pair deduplication because it does not provide a guaranteed chronological all-pairs stream.
- Market observations are append-only so later filtering accuracy and historical behavior can be evaluated.
- Telegram is optional: the HTTP API and polling pipeline work without a bot token.

## Product

The API exposes recent observed tokens, on-demand token checks, and token analysis history under `/api/tokens`. When configured, Telegram supports `/check <token_address>` and posts qualifying new-token alerts.

## User preferences

The user requested a complete Node.js/TypeScript Solana screener with PostgreSQL persistence, DexScreener ingestion, transparent due-diligence scoring, and grammY Telegram alerts.

## Gotchas

- A Telegram bot token and alert chat ID are optional and must be configured as secrets/env vars before delivery can work.
- Public DexScreener, RugCheck, and Solana RPC endpoints may rate-limit or omit data; the app records that as unknown instead of silently passing it.
- The API server initializes screener tables at startup; `DATABASE_URL` must be available to the existing project database package.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

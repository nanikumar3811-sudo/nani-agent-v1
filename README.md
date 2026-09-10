# NANI PRO X V3

NANI PRO X is an iPhone-first U.S. market intelligence dashboard for SPY/QQQ context, options research, PostgreSQL-backed memory, and future paper-trading workflows.

## Safety

- `LIVE_TRADING=false` is required.
- No broker order execution.
- No live trade placement.
- Defined-risk options research only.
- No naked or undefined-risk options.
- `MAX_PREMIUM_USD` and `MAX_TRADE_RISK_USD` are enforced configuration guardrails.
- Missing, invalid, delayed, rate-limited, or unavailable market data results in `NO_TRADE`.
- NANI never fabricates prices, technical indicators, option contracts, news, or market conditions.

## Architecture

```text
iPhone Safari
  → React/Vite dashboard
  → Fastify API
  → Alpaca provider adapter
  → PostgreSQL memory/state

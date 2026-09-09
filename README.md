# NANI ChatGPT Market Agent V1

This is the next architecture for NANI: a personal market-intelligence backend designed to be exposed to ChatGPT as a remote MCP app/server.

## What this is

NANI is no longer just an 8:15 scanner.

It maintains a persistent market state and exposes tools that ChatGPT can call when you ask natural-language questions:

- `nani_market_state` — current market/regime/context
- `nani_premarket_intelligence` — full premarket research packet
- `nani_symbol_deep_dive` — deep analysis context for a ticker
- `nani_options_context` — options-chain/contract context
- `nani_market_reaction` — explain what changed and compare against prior state
- `nani_watchlist` — current watchlist and candidate context
- `nani_save_thesis` — persist a thesis for later challenge
- `nani_get_theses` — retrieve active theses
- `nani_record_reaction` — record what actually happened
- `nani_risk_check` — defined-risk trade construction constraints

The MCP tools return evidence/context. ChatGPT remains the conversational reasoning layer.

## Important ChatGPT limitation

This package is built for the ChatGPT Apps/MCP integration path, but whether a custom MCP app can be connected and invoked from the iOS ChatGPT app depends on the current ChatGPT product surface and account/workspace eligibility.

Do not assume that uploading this ZIP to ChatGPT makes it a persistent app. The server must be deployed at a reachable HTTPS endpoint and connected through the supported ChatGPT app/MCP flow.

OpenAI's current developer documentation describes extending ChatGPT with MCP servers and optional UI. Verify current account/device availability before deployment.

## Safety

- Research/paper only.
- No live order tool exists.
- No broker order endpoint is exposed.
- No naked/undefined-risk strategies.
- The risk engine is a constraint checker, not an execution engine.
- Options "flow" is explicitly labeled as activity/context unless a provider supplies verified trade-level classification.
- Stale/missing data is surfaced, not silently replaced with zeros.

## Run locally

```bash
cp .env.example .env
npm install
npm run test
npm run dev
```

MCP endpoint:

```text
http://localhost:8088/mcp
```

Health:

```text
http://localhost:8088/health
```

For ChatGPT remote integration, deploy behind HTTPS and put the API token in your MCP gateway/auth layer. Do not expose provider keys to the client.

## 8:15 AM

The scheduler is optional. On a persistent server:

```env
ENABLE_SCHEDULER=true
BRIEFING_HOUR_CT=8
BRIEFING_MINUTE_CT=15
```

The scheduler captures the premarket intelligence packet and stores it in SQLite. ChatGPT can then ask:

> NANI, what did you see at 8:15 and what has changed?

## Intended conversational behavior

Examples:

> NANI, what's happening?

> Why is QQQ weak while NVDA is strong?

> Find me the strongest opportunity today.

> Challenge my QCOM call thesis.

> What changed since 8:15?

> Is this dip a buy or is the thesis breaking?

> Give me a defined-risk options idea under $500.

The ChatGPT-side instructions should tell the model to call NANI tools whenever current market evidence is required instead of guessing.

## Production hardening still required

Before exposing publicly:

1. Put the MCP server behind HTTPS.
2. Use strong authentication and rotate secrets.
3. Restrict CORS/allowed origins as appropriate.
4. Add rate limiting.
5. Use managed SQLite/Postgres if running multiple instances.
6. Add a market-data provider with true options trade classification if institutional-flow claims are required.
7. Add observability and alerting.
8. Keep paper/live execution completely separated.

This V1 deliberately prioritizes the ChatGPT-agent interface and persistent reasoning state over a standalone dashboard.

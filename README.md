# NANI PRO X

Evidence-first U.S. market-intelligence and paper-trading research terminal.

## Phase 1 foundation

- React/Vite frontend and Fastify API
- Deterministic DEMO provider with explicit DEMO status
- Provider abstraction boundary; REAL mode fails closed to UNAVAILABLE until a real adapter is configured
- Deterministic technical and market-regime engines
- Evidence packets with missing-data disclosure
- PostgreSQL migration foundation
- Research-only execution boundary; no broker connectivity or order routing

## Run

npm install
npm run dev

Demo mode requires no market-data credentials. It is deterministic and must never be interpreted as live market data.

## Checks

npm run build
npm run test
npm run typecheck
npm run lint
npm run format
npm run db:migrate
npm run db:seed

## Data honesty

Every normalized instrument carries provider, source, timestamps, freshness, and status. DEMO data is never presented as LIVE. If a real provider is not configured, the application fails closed to DATA UNAVAILABLE.

## Safety

LIVE_TRADING=false is mandatory. There is no live broker integration or execution path.

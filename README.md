# NANI PRO X V3
Daily-use mobile market intelligence command center.

Safety: LIVE_TRADING=false. No order endpoints. No execution. Defined-risk research only. Missing provider data fails closed.

Providers: Alpaca market data/options; Finnhub can be added for macro/news. PostgreSQL stores NANI state and memory.

Deploy: replace repo contents, commit to main, Render auto-deploys. Set DATABASE_URL, ALPACA_API_KEY and ALPACA_API_SECRET in Render.

Local: npm install && npm run build && npm start

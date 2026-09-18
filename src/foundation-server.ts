import Fastify from 'fastify';
import stat from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { foundationState } from './foundation.js';
import { health as dbHealth, initDb, closeDb } from './db.js';

const app = Fastify({ logger: { level: process.env.NODE_ENV === 'production' ? 'info' : 'debug' } });
const dir = path.dirname(fileURLToPath(import.meta.url));

function safeSymbol(value: unknown): string | null {
  const symbol = String(value ?? '').trim().toUpperCase();
  return /^[A-Z]{1,10}$/.test(symbol) ? symbol : null;
}

app.get('/health', async (request) => ({
  ok: true, service: 'nani-pro-x', status: 'ok', liveTrading: false, executionAllowed: false,
  dataMode: process.env.DATA_MODE === 'REAL' ? 'UNAVAILABLE' : 'DEMO',
  database: { connected: process.env.DATABASE_URL ? await dbHealth() : false }, requestId: request.id, timestamp: new Date().toISOString()
}));

app.get('/ready', async (_request, reply) => {
  const connected = process.env.DATABASE_URL ? await dbHealth() : false;
  return reply.code(connected || !process.env.DATABASE_URL ? 200 : 503).send({
    ok: connected || !process.env.DATABASE_URL, databaseConfigured: Boolean(process.env.DATABASE_URL),
    databaseConnected: connected, dataMode: process.env.DATA_MODE === 'REAL' ? 'UNAVAILABLE' : 'DEMO'
  });
});

app.get('/metrics', async () => {
  const state = await foundationState();
  const unavailable = state.instruments.filter(i => i.status === 'UNAVAILABLE').length;
  return { ok: true, provider: state.provider, instruments: state.instruments.length, unavailable, generatedAt: state.generatedAt };
});

app.get('/api/foundation', async () => foundationState());

app.get('/api/dashboard', async () => {
  const state = await foundationState();
  const by = new Map(state.instruments.map(i => [i.symbol, i]));
  const spy = by.get('SPY')!;
  const qqq = by.get('QQQ')!;
  const valid = spy.status === 'DEMO' || spy.status === 'LIVE';
  return {
    ok: true, generatedAt: state.generatedAt, mode: 'RESEARCH_ONLY',
    dataIntegrity: { state: state.mode, provider: state.provider.provider },
    marketPulse: { regime: state.regime.state, spy, qqq },
    finalDecision: { action: state.mode === 'DEMO' ? 'WATCH' : 'NO_TRADE', bestOpportunity: null, bestTrigger: null },
    reasons: [state.mode === 'DEMO' ? 'DEMO DATA — not live market data.' : 'Market data unavailable.'],
    evidence: state.evidence,
    providerHealth: state.provider,
    guardrails: { definedRiskOnly: true, liveTrading: false, executionAllowed: false },
    dataAvailable: valid
  };
});

app.get('/api/deep/:symbol', async (request, reply) => {
  const symbol = safeSymbol((request.params as {symbol?: string}).symbol);
  if (!symbol) return reply.code(400).send({ok:false,error:{code:'INVALID_SYMBOL',message:'A valid symbol is required.'}});
  const state = await foundationState();
  const instrument = state.instruments.find(i => i.symbol === symbol);
  if (!instrument) return reply.code(404).send({ok:false,error:{code:'SYMBOL_UNAVAILABLE',message:'Symbol is not in the Phase 1 demo universe.'}});
  const evidence = state.evidence.find(e => e.symbol === symbol) ?? null;
  return { ok:true, symbol, generatedAt:state.generatedAt, dataStatus:instrument.status, dataState:instrument.status, quote: { ...instrument.quote, quotedAt:instrument.quote.marketTimestamp, fetchedAt:instrument.receivedAt }, technical: { ...instrument.technical, barsAvailable: instrument.technical.bars, high20: instrument.technical.resistance, low20: instrument.technical.support, ema5: instrument.technical.ema9, ema20: instrument.technical.ema21 }, instrument, evidence, executionAllowed:false, liveTrading:false };
});



app.get('/api/options/:symbol', async (request, reply) => {
  const symbol = safeSymbol((request.params as {symbol?: string}).symbol);
  if (!symbol) return reply.code(400).send({ok:false,error:{code:'INVALID_SYMBOL',message:'A valid symbol is required.'}});
  const state = await foundationState();
  const instrument = state.instruments.find(i => i.symbol === symbol);
  if (!instrument) return reply.code(404).send({ok:false,error:{code:'SYMBOL_UNAVAILABLE',message:'Symbol is not in the Phase 1 demo universe.'}});
  return { ok:true, symbol, generatedAt:state.generatedAt, dataState: instrument.status, underlying: { price: instrument.quote.price, status: instrument.status, source: instrument.source, provider: instrument.provider }, snapshots:null, executionBlocked:true, finalDecision:{action:'NO_TRADE',reasonCodes:['OPTIONS_NOT_CONNECTED']}, rules:['Defined-risk only','No naked options','No execution','No live trade placement'], warnings:['Options trade-level data is not connected in Phase 1.'] };
});

app.get('/api/memory', async (_request, reply) => {
  if (!process.env.DATABASE_URL) return reply.send({ok:true,dataState:'UNAVAILABLE',items:[],reason:'PostgreSQL is not configured; demo mode does not persist memory.'});
  const { recentMemory } = await import('./db.js');
  return reply.send({ok:true,dataState:'LIVE',items:await recentMemory()});
});

app.post('/api/command', async (request, reply) => {
  const body = (request.body ?? {}) as { text?: unknown };
  const question = String(body.text ?? '').trim();
  if (!question) return reply.code(400).send({ok:false,error:{code:'COMMAND_TEXT_REQUIRED',message:'Enter a question.'}});
  const state = await foundationState();
  const answer = state.mode === 'DEMO'
    ? 'DEMO DATA: NANI can explain the deterministic technical/regime evidence, but this dataset is not live market data. Options flow, news, catalysts and other unavailable evidence remain explicitly unverified.'
    : 'NANI cannot validate current market data. NO_TRADE.';
  return {ok:true,answer,data: {dataIntegrity:{state:state.mode},marketPulse:{regime:state.regime.state}},memory:{saved:false}};
});

app.all('/api/execution/*', async (_request, reply) => reply.code(403).send({ok:false,error:{code:'LIVE_TRADING_DISABLED',message:'Live trading is permanently disabled.'}}));

app.register(stat, { root: path.join(dir, '../../dist/web'), prefix:'/' });
app.setNotFoundHandler((request, reply) => request.raw.url?.startsWith('/api/') ? reply.code(404).send({ok:false,error:{code:'NOT_FOUND',message:'API route not found.'}}) : reply.sendFile('index.html'));

if (process.env.DATABASE_URL) await initDb();
await app.listen({host:process.env.HOST || '0.0.0.0',port:Number(process.env.PORT || 10000)});
process.on('SIGTERM', async () => { await app.close(); await closeDb(); });

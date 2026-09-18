import type { MarketInstrument, RegimeSnapshot, RegimeFactor } from './domain.js';

export function marketRegime(instruments: MarketInstrument[]): RegimeSnapshot {
  const by = new Map(instruments.map(i => [i.symbol, i]));
  const factors: RegimeFactor[] = [];
  const missingInputs: string[] = [];
  let score = 0;
  let available = 0;

  const trendFactor = (symbol: string, weight: number) => {
    const i = by.get(symbol);
    if (!i || i.status === 'UNAVAILABLE') { missingInputs.push(symbol); factors.push({ name: symbol + ' trend', contribution: 0, status: 'MISSING', explanation: 'No validated input.' }); return; }
    available += 1;
    const trend = i.technical.trend;
    const contribution = trend === 'BULLISH' ? weight : trend === 'BEARISH' ? -weight : 0;
    score += contribution;
    factors.push({ name: symbol + ' trend', contribution, status: 'AVAILABLE', explanation: trend + ' technical structure.' });
  };
  trendFactor('SPY', 30);
  trendFactor('QQQ', 30);
  trendFactor('IWM', 15);

  const vix = by.get('VIX');
  if (!vix) {
    missingInputs.push('VIX');
    factors.push({ name: 'Volatility', contribution: 0, status: 'MISSING', explanation: 'No volatility input.' });
  } else {
    available += 1;
    const value = vix.quote.price ?? 0;
    const contribution = value > 25 ? -20 : value > 20 ? -10 : value < 14 ? 12 : 5;
    score += contribution;
    factors.push({ name: 'Volatility', contribution, status: 'AVAILABLE', explanation: 'VIX fixture state translated to a transparent regime contribution.' });
  }

  const breadthProxy = ['SPY', 'QQQ', 'IWM'].filter(s => by.get(s)?.technical.trend === 'BULLISH').length;
  if (available >= 3) {
    const contribution = breadthProxy >= 2 ? 15 : breadthProxy === 0 ? -15 : 0;
    score += contribution;
    factors.push({ name: 'Breadth proxy', contribution, status: 'AVAILABLE', explanation: 'Breadth proxy uses the three configured index/ETF trend inputs.' });
  } else {
    missingInputs.push('Breadth proxy');
    factors.push({ name: 'Breadth proxy', contribution: 0, status: 'MISSING', explanation: 'Insufficient index inputs.' });
  }

  const confidence = Math.max(0, Math.min(100, Math.round((available / 5) * 100)));
  const state = score >= 35 ? 'BULLISH' : score <= -35 ? 'BEARISH' : Math.abs(score) < 12 ? 'NEUTRAL' : 'TRANSITION';
  const timestamp = new Date().toISOString();
  const explanation = missingInputs.length
    ? state + ' based on validated inputs; confidence reduced because ' + missingInputs.join(', ') + ' are missing.'
    : state + ' based on SPY/QQQ/IWM trend, VIX state, and breadth proxy.';

  return { state, score, confidence, factors, missingInputs, timestamp, configurationVersion: 'regime-v1', explanation };
}

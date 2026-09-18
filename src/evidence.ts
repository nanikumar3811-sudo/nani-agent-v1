import type { EvidenceComponent, EvidencePacket, MarketInstrument, RegimeSnapshot } from './domain.js';

export function evidenceFor(symbol: string, instrument: MarketInstrument, regime: RegimeSnapshot): EvidencePacket {
  const components: EvidenceComponent[] = [];
  const t = instrument.technical;
  const quote = instrument.quote;
  const trendScore = t.trend === 'BULLISH' ? 70 : t.trend === 'BEARISH' ? 30 : 50;
  components.push({ name: 'Technical', score: trendScore, confidence: t.bars >= 200 ? 0.95 : 0.7, evidence: [`Trend: ${t.trend}`, `RSI: ${t.rsi14?.toFixed(1) ?? 'unavailable'}`, `EMA21: ${t.ema21?.toFixed(2) ?? 'unavailable'}`], contradictions: t.rsi14 !== null && t.rsi14 > 70 ? ['RSI is elevated.'] : [], status: instrument.status });
  const volumeScore = t.relativeVolume === null ? null : Math.min(100, Math.round(t.relativeVolume * 50));
  components.push({ name: 'Volume', score: volumeScore, confidence: volumeScore === null ? 0 : 0.8, evidence: volumeScore === null ? [] : [`Relative volume: ${t.relativeVolume!.toFixed(2)}x`], contradictions: [], status: instrument.status });
  components.push({ name: 'Momentum', score: quote.changePercent === null ? null : Math.max(0, Math.min(100, 50 + quote.changePercent * 10)), confidence: quote.changePercent === null ? 0 : 0.8, evidence: [`Change: ${quote.changePercent?.toFixed(2) ?? 'unavailable'}%`], contradictions: [], status: instrument.status });
  components.push({ name: 'Market Regime', score: regime.state === 'BULLISH' ? 75 : regime.state === 'BEARISH' ? 25 : 50, confidence: regime.confidence / 100, evidence: [`Regime: ${regime.state}`, `Score: ${regime.score}`], contradictions: regime.missingInputs.map(x => `Missing: ${x}`), status: instrument.status });
  components.push({ name: 'Options Flow', score: null, confidence: 0, evidence: [], contradictions: ['Options trade-level data is not connected in Phase 1.'], status: 'UNAVAILABLE' });
  components.push({ name: 'Catalyst', score: null, confidence: 0, evidence: [], contradictions: ['News/catalyst provider is not connected in Phase 1.'], status: 'UNAVAILABLE' });
  components.push({ name: 'Volatility', score: null, confidence: 0, evidence: [], contradictions: ['Symbol-level IV is not connected in Phase 1.'], status: 'UNAVAILABLE' });
  components.push({ name: 'Liquidity', score: quote.volume === null ? null : 80, confidence: quote.volume === null ? 0 : 0.7, evidence: quote.volume === null ? [] : [`Volume: ${quote.volume.toLocaleString()}`], contradictions: [], status: instrument.status });
  const missingData = components.filter(c => c.status === 'UNAVAILABLE').map(c => c.name);
  const usable = components.filter(c => c.score !== null);
  const avg = usable.length ? usable.reduce((s, c) => s + (c.score ?? 0) * c.confidence, 0) / usable.reduce((s, c) => s + c.confidence, 0) : 0;
  const status: EvidencePacket['status'] = missingData.length >= 3 ? 'DEVELOPING' : avg >= 70 ? 'TRADE-READY RESEARCH' : avg >= 55 ? 'WATCH' : 'NO_TRADE';
  return { symbol, timestamp: new Date().toISOString(), status, components, missingData, why: `Evidence is ${status.toLowerCase()}; ${missingData.length} evidence domains are unavailable in Phase 1.` };
}

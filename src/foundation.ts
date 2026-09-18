import type { EvidencePacket, MarketInstrument, RegimeSnapshot } from './domain.js';
import { evidenceFor } from './evidence.js';
import { marketRegime } from './regime.js';
import { createMarketDataProvider } from './provider.js';

export const COMMAND_SYMBOLS = ['SPY','QQQ','IWM','DIA','VIX','US10Y','DXY','WTI','GOLD','BTC','ETH'] as const;
export const DEMO_SYMBOLS = ['SPY','QQQ','IWM','DIA','VIX','NVDA','AAPL','META','MSFT','AMD','TSLA','ORCL','AVGO'] as const;

export async function foundationState(): Promise<{
  generatedAt: string;
  mode: 'DEMO' | 'UNAVAILABLE';
  instruments: MarketInstrument[];
  regime: RegimeSnapshot;
  evidence: EvidencePacket[];
  provider: Awaited<ReturnType<ReturnType<typeof createMarketDataProvider>['health']>>;
}> {
  const provider = createMarketDataProvider();
  const names = [...new Set([...COMMAND_SYMBOLS, ...DEMO_SYMBOLS])];
  const instruments = await Promise.all(names.map(symbol => provider.getInstrument(symbol)));
  const regime = marketRegime(instruments);
  const evidence = instruments.map(i => evidenceFor(i.symbol, i, regime));
  return { generatedAt: new Date().toISOString(), mode: provider.name === 'DEMO' ? 'DEMO' : 'UNAVAILABLE', instruments, regime, evidence, provider: await provider.health() };
}

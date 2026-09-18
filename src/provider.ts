import type { MarketInstrument, ProviderHealth } from './domain.js';
import { demoHealth, demoInstrument } from './demo-provider.js';

export interface MarketDataProvider {
  readonly name: string;
  getInstrument(symbol: string): Promise<MarketInstrument>;
  health(): Promise<ProviderHealth>;
}

export class DemoMarketDataProvider implements MarketDataProvider {
  readonly name = 'DEMO';
  async getInstrument(symbol: string): Promise<MarketInstrument> { return demoInstrument(symbol); }
  async health(): Promise<ProviderHealth> { return demoHealth(); }
}

export class UnavailableMarketDataProvider implements MarketDataProvider {
  readonly name = 'UNAVAILABLE';
  async getInstrument(symbol: string): Promise<MarketInstrument> {
    const now = new Date().toISOString();
    return {
      symbol, name: symbol, assetClass: 'UNKNOWN', source: 'NONE', provider: this.name,
      timestamp: now, receivedAt: now, marketTimestamp: null, freshness: 'UNAVAILABLE', status: 'UNAVAILABLE',
      quote: { symbol, price: null, previousClose: null, change: null, changePercent: null, volume: null, relativeVolume: null, marketTimestamp: null },
      technical: { timeframe: '5m', bars: 0, vwap: null, ema9: null, ema21: null, ema50: null, ema200: null, sma20: null, rsi14: null, macd: null, macdSignal: null, atr14: null, adx14: null, relativeVolume: null, support: null, resistance: null, trend: 'UNKNOWN' },
      candles: []
    };
  }
  async health(): Promise<ProviderHealth> {
    return { provider: this.name, status: 'UNAVAILABLE', latencyMs: null, lastSuccess: null, errorCount: 0, rateLimited: false, reason: 'No real provider configured.' };
  }
}

export function createMarketDataProvider(): MarketDataProvider {
  return process.env.DATA_MODE === 'REAL' ? new UnavailableMarketDataProvider() : new DemoMarketDataProvider();
}

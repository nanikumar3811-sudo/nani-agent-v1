import type { Candle, MarketInstrument, ProviderHealth, Quote, DataStatus } from './domain.js';
import { technicalSnapshot } from './technical.js';

const SYMBOLS: Record<string, { name: string; price: number; drift: number }> = {
  SPY: { name: 'SPDR S&P 500 ETF Trust', price: 663.4, drift: 0.00022 },
  QQQ: { name: 'Invesco QQQ Trust', price: 596.2, drift: 0.00028 },
  IWM: { name: 'iShares Russell 2000 ETF', price: 240.8, drift: 0.00012 },
  DIA: { name: 'SPDR Dow Jones Industrial Average ETF', price: 460.4, drift: 0.00008 },
  VIX: { name: 'CBOE Volatility Index', price: 15.8, drift: -0.00012 },
  NVDA: { name: 'NVIDIA Corporation', price: 178.5, drift: 0.00034 },
  AAPL: { name: 'Apple Inc.', price: 241.2, drift: 0.00019 },
  META: { name: 'Meta Platforms', price: 783.0, drift: 0.00031 },
  MSFT: { name: 'Microsoft', price: 508.2, drift: 0.00016 },
  AMD: { name: 'Advanced Micro Devices', price: 167.4, drift: 0.00021 },
  TSLA: { name: 'Tesla', price: 394.7, drift: 0.00018 },
  ORCL: { name: 'Oracle', price: 183.1, drift: 0.00025 },
  AVGO: { name: 'Broadcom', price: 362.4, drift: 0.00027 }
};

function hash(symbol: string): number {
  return [...symbol].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
}

function candlesFor(symbol: string): Candle[] {
  const cfg = SYMBOLS[symbol] ?? { name: symbol, price: 100, drift: 0.0001 };
  const h = hash(symbol);
  const result: Candle[] = [];
  let close = cfg.price * (0.91 + (h % 7) / 100);
  const start = Date.now() - 260 * 5 * 60 * 1000;
  for (let i = 0; i < 260; i += 1) {
    const wave = Math.sin((i + h % 17) / 11) * 0.0018;
    const micro = Math.sin((i * 3 + h % 29) / 7) * 0.0009;
    const change = cfg.drift + wave + micro;
    const open = close;
    close = close * (1 + change);
    const high = Math.max(open, close) * (1 + 0.0009 + Math.abs(Math.sin(i + h)) * 0.0005);
    const low = Math.min(open, close) * (1 - 0.0009 - Math.abs(Math.cos(i + h)) * 0.0005);
    const volume = Math.round((750_000 + (h % 500_000)) * (1 + 0.35 * Math.sin(i / 9)));
    result.push({
      timestamp: new Date(start + i * 5 * 60 * 1000).toISOString(),
      open, high, low, close, volume: Math.max(1000, volume)
    });
  }
  return result;
}

export function demoInstrument(symbol: string): MarketInstrument {
  const cfg = SYMBOLS[symbol] ?? { name: symbol, price: 100, drift: 0.0001 };
  const candles = candlesFor(symbol);
  const last = candles.at(-1)!;
  const previous = candles.at(-2)!.close;
  const quote: Quote = {
    symbol, price: last.close, previousClose: previous,
    change: last.close - previous,
    changePercent: ((last.close - previous) / previous) * 100,
    volume: last.volume, relativeVolume: technicalSnapshot(candles).relativeVolume,
    marketTimestamp: last.timestamp,
    status: 'DEMO'
  };
  const receivedAt = new Date().toISOString();
  return {
    symbol, name: cfg.name, assetClass: symbol === 'VIX' ? 'INDEX' : 'ETF/EQUITY',
    source: 'DEMO_FIXTURE', provider: 'DEMO',
    timestamp: receivedAt, receivedAt, marketTimestamp: last.timestamp,
    freshness: 'DEMO', status: 'DEMO', quote,
    technical: technicalSnapshot(candles), candles
  };
}

export function demoHealth(): ProviderHealth {
  return { provider: 'DEMO', status: 'DEMO', latencyMs: 0, lastSuccess: new Date().toISOString(), errorCount: 0, rateLimited: false, reason: 'Deterministic fixture provider; never represents live market data.' };
}

export const demoSymbols = Object.keys(SYMBOLS);

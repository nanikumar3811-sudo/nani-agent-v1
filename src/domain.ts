export type DataStatus = 'LIVE' | 'DELAYED' | 'STALE' | 'UNAVAILABLE' | 'DEMO';

export type Candle = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Quote = {
  symbol: string;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  relativeVolume: number | null;
  marketTimestamp: string | null;
  status: DataStatus;
};

export type TechnicalSnapshot = {
  timeframe: string;
  bars: number;
  vwap: number | null;
  ema9: number | null;
  ema21: number | null;
  ema50: number | null;
  ema200: number | null;
  sma20: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  atr14: number | null;
  adx14: number | null;
  relativeVolume: number | null;
  support: number | null;
  resistance: number | null;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'UNKNOWN';
};

export type MarketInstrument = {
  symbol: string;
  name: string;
  assetClass: string;
  source: string;
  provider: string;
  timestamp: string;
  receivedAt: string;
  marketTimestamp: string | null;
  freshness: DataStatus;
  status: DataStatus;
  quote: Quote;
  technical: TechnicalSnapshot;
  candles: Candle[];
};

export type Regime = 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'TRANSITION';

export type RegimeFactor = {
  name: string;
  contribution: number;
  status: 'AVAILABLE' | 'MISSING';
  explanation: string;
};

export type RegimeSnapshot = {
  state: Regime;
  score: number;
  confidence: number;
  factors: RegimeFactor[];
  missingInputs: string[];
  timestamp: string;
  configurationVersion: string;
  explanation: string;
};

export type EvidenceComponent = {
  name: string;
  score: number | null;
  confidence: number;
  evidence: string[];
  contradictions: string[];
  status: DataStatus;
};

export type EvidencePacket = {
  symbol: string;
  timestamp: string;
  status: 'DEVELOPING' | 'WATCH' | 'TRADE-READY RESEARCH' | 'NO_TRADE';
  components: EvidenceComponent[];
  missingData: string[];
  why: string;
};

export type ProviderHealth = {
  provider: string;
  status: DataStatus;
  latencyMs: number | null;
  lastSuccess: string | null;
  errorCount: number;
  rateLimited: boolean;
  reason: string | null;
};

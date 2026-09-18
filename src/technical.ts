import type { Candle, TechnicalSnapshot } from './domain.js';

const finite = (n: number | null): number | null => n !== null && Number.isFinite(n) ? n : null;

export function sma(values: number[], period: number): number | null {
  if (period <= 0 || values.length < period) return null;
  const slice = values.slice(-period);
  return finite(slice.reduce((a, b) => a + b, 0) / period);
}

export function ema(values: number[], period: number): number | null {
  if (period <= 0 || values.length < period) return null;
  const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const k = 2 / (period + 1);
  let result = seed;
  for (let i = period; i < values.length; i += 1) result = values[i] * k + result * (1 - k);
  return finite(result);
}

export function rsi(values: number[], period = 14): number | null {
  if (values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < values.length; i += 1) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return finite(100 - 100 / (1 + avgGain / avgLoss));
}

export function macd(values: number[]): { line: number | null; signal: number | null } {
  if (values.length < 35) return { line: null, signal: null };
  const lineValues: number[] = [];
  for (let i = 26; i <= values.length; i += 1) {
    const window = values.slice(0, i);
    const fast = ema(window, 12);
    const slow = ema(window, 26);
    if (fast !== null && slow !== null) lineValues.push(fast - slow);
  }
  const line = lineValues.at(-1) ?? null;
  return { line, signal: ema(lineValues, 9) };
}

export function atr(candles: Candle[], period = 14): number | null {
  if (candles.length <= period) return null;
  const tr: number[] = [];
  for (let i = 1; i < candles.length; i += 1) {
    const c = candles[i];
    const prev = candles[i - 1].close;
    tr.push(Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev)));
  }
  return sma(tr, period);
}

export function adx(candles: Candle[], period = 14): number | null {
  if (candles.length < period * 2 + 1) return null;
  const trs: number[] = [];
  const plus: number[] = [];
  const minus: number[] = [];
  for (let i = 1; i < candles.length; i += 1) {
    const c = candles[i];
    const p = candles[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
    const up = c.high - p.high;
    const down = p.low - c.low;
    plus.push(up > down && up > 0 ? up : 0);
    minus.push(down > up && down > 0 ? down : 0);
  }
  const atrValue = sma(trs, period);
  const p = sma(plus, period);
  const m = sma(minus, period);
  if (atrValue === null || p === null || m === null || atrValue === 0) return null;
  const pdi = 100 * p / atrValue;
  const mdi = 100 * m / atrValue;
  if (pdi + mdi === 0) return 0;
  return finite(100 * Math.abs(pdi - mdi) / (pdi + mdi));
}

export function vwap(candles: Candle[]): number | null {
  let pv = 0;
  let volume = 0;
  for (const c of candles) {
    if (!Number.isFinite(c.volume) || c.volume <= 0) continue;
    pv += ((c.high + c.low + c.close) / 3) * c.volume;
    volume += c.volume;
  }
  return volume > 0 ? finite(pv / volume) : null;
}

export function relativeVolume(candles: Candle[], period = 20): number | null {
  if (candles.length < period + 1) return null;
  const current = candles.at(-1)?.volume ?? 0;
  const baseline = sma(candles.slice(0, -1).map(c => c.volume), period);
  if (baseline === null || baseline <= 0) return null;
  return finite(current / baseline);
}

export function levels(candles: Candle[], lookback = 20): { support: number | null; resistance: number | null } {
  if (candles.length < lookback) return { support: null, resistance: null };
  const slice = candles.slice(-lookback);
  return { support: Math.min(...slice.map(c => c.low)), resistance: Math.max(...slice.map(c => c.high)) };
}

export function technicalSnapshot(candles: Candle[], timeframe = '5m'): TechnicalSnapshot {
  const clean = candles.filter(c =>
    Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) &&
    Number.isFinite(c.close) && c.high >= c.low && c.open > 0 && c.close > 0
  ).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const closes = clean.map(c => c.close);
  const last = closes.at(-1) ?? null;
  const e9 = ema(closes, 9);
  const e21 = ema(closes, 21);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, 200);
  const v = vwap(clean);
  const levelsValue = levels(clean);
  const macdValue = macd(closes);
  let trend: TechnicalSnapshot['trend'] = 'UNKNOWN';
  if (last !== null && e21 !== null && e50 !== null) {
    trend = last > e21 && e21 > e50 ? 'BULLISH' : last < e21 && e21 < e50 ? 'BEARISH' : 'NEUTRAL';
  }
  return {
    timeframe, bars: clean.length, vwap: v, ema9: e9, ema21: e21, ema50: e50, ema200: e200,
    sma20: sma(closes, 20), rsi14: rsi(closes), macd: macdValue.line, macdSignal: macdValue.signal,
    atr14: atr(clean), adx14: adx(clean), relativeVolume: relativeVolume(clean),
    support: levelsValue.support, resistance: levelsValue.resistance, trend
  };
}

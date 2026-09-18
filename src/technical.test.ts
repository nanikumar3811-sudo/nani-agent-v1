import assert from 'node:assert/strict';
import { ema, rsi, vwap, technicalSnapshot } from './technical.js';
import type { Candle } from './domain.js';

const candles: Candle[] = Array.from({ length: 60 }, (_, i) => ({
  timestamp: new Date(Date.UTC(2026, 0, 1, 0, i * 5)).toISOString(),
  open: 100 + i,
  high: 101 + i,
  low: 99 + i,
  close: 100 + i,
  volume: 1000 + i
}));
assert.equal(ema([1,2,3], 5), null);
assert.equal(rsi([1,2,3], 14), null);
assert.ok(vwap(candles)! > 100);
const snapshot = technicalSnapshot(candles);
assert.equal(snapshot.trend, 'BULLISH');
assert.ok(snapshot.ema9 !== null);
assert.ok(snapshot.ema21 !== null);

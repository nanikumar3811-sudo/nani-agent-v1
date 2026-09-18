import assert from 'node:assert/strict';
import { marketRegime } from './regime.js';
import { demoInstrument } from './demo-provider.js';
const instruments = ['SPY','QQQ','IWM','VIX'].map(demoInstrument);
const result = marketRegime(instruments);
assert.ok(['BULLISH','BEARISH','NEUTRAL','TRANSITION'].includes(result.state));
assert.ok(result.confidence >= 0 && result.confidence <= 100);
assert.equal(result.configurationVersion, 'regime-v1');

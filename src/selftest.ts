import {
  extractRawBars,
  normalizeBars,
} from './providers.js';
import { dashboard } from './engine.js';
import { closeDb, health, initDb } from './db.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`SELFTEST FAILED: ${message}`);
  }
}

const arrayShape = {
  bars: [
    {
      t: '2026-09-09T20:00:00Z',
      o: 500,
      h: 505,
      l: 498,
      c: 503,
      v: 1000,
    },
  ],
};

const keyedShape = {
  bars: {
    SPY: [
      {
        t: '2026-09-09T20:00:00Z',
        o: 500,
        h: 505,
        l: 498,
        c: 503,
        v: 1000,
      },
    ],
  },
};

assert(
  extractRawBars(arrayShape, 'SPY').length === 1,
  'Array-form Alpaca bars payload must be supported.',
);

assert(
  extractRawBars(keyedShape, 'SPY').length === 1,
  'Symbol-keyed Alpaca bars payload must be supported.',
);

assert(
  normalizeBars(arrayShape, 'SPY').length === 1,
  'Valid bars must normalize successfully.',
);

assert(
  normalizeBars(
    {
      bars: [
        {
          t: 'invalid-date',
          o: 1,
          h: 2,
          l: 0,
          c: 1,
        },
      ],
    },
    'SPY',
  ).length === 0,
  'Invalid bars must be rejected.',
);

await initDb();

const databaseHealthy = await health();

console.log(
  JSON.stringify(
    {
      selftest: 'starting',
      databaseHealthy,
      liveTrading: false,
    },
    null,
    2,
  ),
);

const result = await dashboard();

assert(result.ok === true, 'Dashboard must return a handled response.');
assert(
  result.actionSafety.liveTrading === false,
  'LIVE_TRADING must remain permanently disabled.',
);
assert(
  result.actionSafety.executionAllowed === false,
  'Execution must remain permanently disabled.',
);
assert(
  result.finalDecision.action === 'NO_TRADE' ||
    result.finalDecision.action === 'WATCH',
  'Dashboard must return a safe decision state.',
);

console.log(
  JSON.stringify(
    {
      selftest: 'passed',
      dataStatus: result.dataIntegrity.state,
      regime: result.marketPulse.regime,
      decision: result.finalDecision.action,
      reasons: result.reasons,
    },
    null,
    2,
  ),
);

await closeDb();

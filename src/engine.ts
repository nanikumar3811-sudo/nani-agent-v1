import {
  bars,
  options,
  quote,
  type DataStatus,
  type NormalizedBar,
  type ProviderResult,
  type QuoteData,
} from './providers.js';

type Trend = 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'UNKNOWN';
type Regime = 'RISK_ON' | 'RISK_OFF' | 'MIXED' | 'UNKNOWN';
type Decision = 'NO_TRADE' | 'WATCH';

type TechnicalState = {
  price: number | null;
  ema5: number | null;
  ema20: number | null;
  ema50: number | null;
  atr14: number | null;
  high20: number | null;
  low20: number | null;
  trend: Trend;
  warnings: string[];
};

type SymbolState = {
  symbol: string;
  dataStatus: DataStatus;
  quote: {
    symbol: string;
    price: number | null;
    bid: number | null;
    ask: number | null;
    quotedAt: string | null;
    fetchedAt: string | null;
    provider: 'ALPACA';
  };
  technical: TechnicalState;
  reasonCodes: string[];
  warnings: string[];
};

function safeNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function ema(values: number[], period: number): number | null {
  if (values.length < period) {
    return null;
  }

  const multiplier = 2 / (period + 1);
  let current = values[0];

  for (let index = 1; index < values.length; index += 1) {
    current = values[index] * multiplier + current * (1 - multiplier);
  }

  return Number.isFinite(current) ? current : null;
}

function atr14(values: NormalizedBar[]): number | null {
  if (values.length < 15) {
    return null;
  }

  const trueRanges: number[] = [];

  for (let index = 1; index < values.length; index += 1) {
    const current = values[index];
    const previous = values[index - 1];

    const range = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close),
    );

    if (Number.isFinite(range)) {
      trueRanges.push(range);
    }
  }

  if (trueRanges.length < 14) {
    return null;
  }

  const latest = trueRanges.slice(-14);
  const result = latest.reduce((sum, value) => sum + value, 0) / 14;

  return Number.isFinite(result) ? result : null;
}

function technicalState(
  values: NormalizedBar[],
  currentPrice: number | null,
): TechnicalState {
  const closes = values
    .map((bar) => safeNumber(bar.close))
    .filter((value): value is number => value !== null);

  const warnings: string[] = [];

  const ema5 = ema(closes, 5);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const atr = atr14(values);

  if (closes.length < 20) {
    warnings.push('At least 20 valid closing bars are required for EMA20.');
  }

  if (values.length < 15) {
    warnings.push('At least 15 valid OHLC bars are required for ATR14.');
  }

  const last20 = values.slice(-20);

  const high20 =
    last20.length === 20
      ? Math.max(...last20.map((bar) => bar.high))
      : null;

  const low20 =
    last20.length === 20
      ? Math.min(...last20.map((bar) => bar.low))
      : null;

  const price = currentPrice ?? closes.at(-1) ?? null;

  const trend: Trend =
    price !== null && ema5 !== null && ema20 !== null
      ? price > ema5 && ema5 > ema20
        ? 'BULLISH'
        : price < ema5 && ema5 < ema20
          ? 'BEARISH'
          : 'NEUTRAL'
      : 'UNKNOWN';

  return {
    price,
    ema5,
    ema20,
    ema50,
    atr14: atr,
    high20: Number.isFinite(high20) ? high20 : null,
    low20: Number.isFinite(low20) ? low20 : null,
    trend,
    warnings,
  };
}

function unavailableQuote(symbol: string, result: ProviderResult<QuoteData>) {
  return {
    symbol,
    price: null,
    bid: null,
    ask: null,
    quotedAt: null,
    fetchedAt: result.fetchedAt,
    provider: 'ALPACA' as const,
  };
}

async function getSymbolState(symbol: string): Promise<SymbolState> {
  const [quoteResult, barResult] = await Promise.all([
    quote(symbol),
    bars(symbol),
  ]);

  const quoteData = quoteResult.ok
    ? quoteResult.data
    : unavailableQuote(symbol, quoteResult);

  const barValues = barResult.ok ? barResult.data : [];

  const quoteStatus = quoteResult.status;
  const barStatus = barResult.status;

  const dataStatus: DataStatus =
    quoteResult.ok && barResult.ok
      ? 'LIVE'
      : quoteResult.ok || barResult.ok
        ? 'PARTIAL'
        : quoteStatus === 'RATE_LIMITED' || barStatus === 'RATE_LIMITED'
          ? 'RATE_LIMITED'
          : quoteStatus === 'INVALID' || barStatus === 'INVALID'
            ? 'INVALID'
            : 'UNAVAILABLE';

  const reasonCodes = [
    ...(quoteResult.ok ? [] : [quoteResult.reasonCode]),
    ...(barResult.ok ? [] : [barResult.reasonCode]),
  ];

  const warnings = [
    ...(quoteResult.ok ? [] : [quoteResult.message]),
    ...(barResult.ok ? [] : [barResult.message]),
  ];

  const technical = technicalState(barValues, quoteData.price);

  if (technical.trend === 'UNKNOWN') {
    warnings.push('Trend cannot be validated from sufficient market data.');
  }

  return {
    symbol,
    dataStatus,
    quote: {
      symbol,
      price: quoteData.price,
      bid: quoteData.bid,
      ask: quoteData.ask,
      quotedAt: quoteData.quotedAt,
      fetchedAt: quoteResult.fetchedAt,
      provider: 'ALPACA',
    },
    technical,
    reasonCodes,
    warnings: [...new Set(warnings)],
  };
}

function marketRegime(spy: SymbolState, qqq: SymbolState): Regime {
  if (
    spy.dataStatus !== 'LIVE' ||
    qqq.dataStatus !== 'LIVE' ||
    spy.technical.trend === 'UNKNOWN' ||
    qqq.technical.trend === 'UNKNOWN'
  ) {
    return 'UNKNOWN';
  }

  if (
    spy.technical.trend === 'BULLISH' &&
    qqq.technical.trend === 'BULLISH'
  ) {
    return 'RISK_ON';
  }

  if (
    spy.technical.trend === 'BEARISH' &&
    qqq.technical.trend === 'BEARISH'
  ) {
    return 'RISK_OFF';
  }

  return 'MIXED';
}

function finiteEnvironmentNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export async function dashboard() {
  const [spy, qqq] = await Promise.all([
    getSymbolState('SPY'),
    getSymbolState('QQQ'),
  ]);

  const regime = marketRegime(spy, qqq);
  const reasons = [...spy.warnings, ...qqq.warnings];
  const reasonCodes = [...spy.reasonCodes, ...qqq.reasonCodes];

  if (spy.dataStatus !== 'LIVE' || qqq.dataStatus !== 'LIVE') {
    reasons.push('Validated live SPY and QQQ data is unavailable or incomplete.');
    reasonCodes.push('MARKET_DATA_NOT_FULLY_VALIDATED');
  }

  if (regime === 'UNKNOWN') {
    reasons.push('Market regime is unknown because required trend data is not validated.');
    reasonCodes.push('REGIME_UNKNOWN');
  }

  if (regime === 'MIXED') {
    reasons.push('SPY and QQQ trend conditions are not aligned.');
    reasonCodes.push('SPY_QQQ_DIVERGENCE');
  }

  const canWatch =
    spy.dataStatus === 'LIVE' &&
    qqq.dataStatus === 'LIVE' &&
    (regime === 'RISK_ON' || regime === 'RISK_OFF');

  const action: Decision = canWatch ? 'WATCH' : 'NO_TRADE';

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    mode: 'RESEARCH_ONLY',
    actionSafety: {
      executionAllowed: false,
      liveTrading: false,
      optionsExecutionBlocked: true,
    },
    dataIntegrity: {
      state:
        spy.dataStatus === 'LIVE' && qqq.dataStatus === 'LIVE'
          ? 'LIVE'
          : spy.dataStatus === 'RATE_LIMITED' || qqq.dataStatus === 'RATE_LIMITED'
            ? 'RATE_LIMITED'
            : spy.dataStatus === 'PARTIAL' || qqq.dataStatus === 'PARTIAL'
              ? 'PARTIAL'
              : spy.dataStatus === 'INVALID' || qqq.dataStatus === 'INVALID'
                ? 'INVALID'
                : 'UNAVAILABLE',
      provider: 'ALPACA',
    },
    marketPulse: {
      regime,
      spy,
      qqq,
    },
    finalDecision: {
      action,
      bestOpportunity: null,
      bestTrigger: null,
      reasonCodes: [...new Set(reasonCodes)],
    },
    reasons: [...new Set(reasons)],
    guardrails: {
      maxPremiumUsd: finiteEnvironmentNumber('MAX_PREMIUM_USD', 500),
      maxTradeRiskUsd: finiteEnvironmentNumber('MAX_TRADE_RISK_USD', 200),
      definedRiskOnly: true,
    },
  };
}

export async function deep(symbol: string) {
  const state = await getSymbolState(symbol);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    symbol,
    dataStatus: state.dataStatus,
    quote: state.quote,
    technical: state.technical,
    reasonCodes: state.reasonCodes,
    warnings: state.warnings,
    decision: {
      action: state.dataStatus === 'LIVE' ? 'WATCH' : 'NO_TRADE',
      reason:
        state.dataStatus === 'LIVE'
          ? 'Research state available. Execution remains blocked.'
          : 'Live market data cannot be fully validated.',
    },
    executionAllowed: false,
    liveTrading: false,
  };
}

export async function optionContext(symbol: string) {
  const underlying = await getSymbolState(symbol);

  if (underlying.dataStatus !== 'LIVE') {
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      symbol,
      dataStatus: underlying.dataStatus,
      underlying,
      snapshots: null,
      executionBlocked: true,
      finalDecision: {
        action: 'NO_TRADE',
        reasonCodes: [
          ...underlying.reasonCodes,
          'UNDERLYING_DATA_UNAVAILABLE',
        ],
      },
      rules: [
        'Defined-risk only',
        'No naked options',
        'No execution',
        'Reject stale or unavailable underlying data',
      ],
      warnings: [
        ...underlying.warnings,
        'Options research is blocked until underlying market data is validated.',
      ],
    };
  }

  const optionResult = await options(symbol);

  if (!optionResult.ok) {
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      symbol,
      dataStatus: optionResult.status,
      underlying,
      snapshots: null,
      executionBlocked: true,
      finalDecision: {
        action: 'NO_TRADE',
        reasonCodes: [optionResult.reasonCode, 'OPTIONS_DATA_UNAVAILABLE'],
      },
      rules: [
        'Defined-risk only',
        'No naked options',
        'No execution',
        'Reject stale or unavailable underlying data',
      ],
      warnings: [optionResult.message],
    };
  }

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    symbol,
    dataStatus: 'LIVE',
    underlying,
    snapshots: optionResult.data,
    executionBlocked: true,
    finalDecision: {
      action: 'NO_TRADE',
      reasonCodes: ['OPTIONS_RESEARCH_ONLY', 'RISK_ENGINE_VETO'],
    },
    rules: [
      'Defined-risk only',
      'No naked options',
      'No execution',
      'No live trade placement',
      'Risk engine approval required before paper-trade evaluation',
    ],
    warnings: [
      'Options snapshots are research data only. No option contract is a trade candidate until all defined-risk and maximum-risk gates pass.',
    ],
  };
}

const BASE =
  process.env.ALPACA_DATA_BASE_URL || 'https://data.alpaca.markets';

export type DataStatus =
  | 'LIVE'
  | 'DELAYED'
  | 'PARTIAL'
  | 'STALE'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE'
  | 'INVALID';

export type ProviderReasonCode =
  | 'MISSING_PROVIDER_CONFIG'
  | 'PROVIDER_AUTH_FAILED'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_NETWORK_ERROR'
  | 'PROVIDER_HTTP_ERROR'
  | 'PROVIDER_INVALID_RESPONSE'
  | 'INSUFFICIENT_BARS'
  | 'OPTIONS_DATA_UNAVAILABLE';

type ProviderFailure = {
  ok: false;
  status: DataStatus;
  reasonCode: ProviderReasonCode;
  message: string;
  fetchedAt: string;
  provider: 'ALPACA';
};

type ProviderSuccess<T> = {
  ok: true;
  status: 'LIVE';
  data: T;
  fetchedAt: string;
  provider: 'ALPACA';
};

/*
  Important:
  This MUST be exported because src/engine.ts imports it as:

  import { type ProviderResult } from './providers.js';
*/
export type ProviderResult<T> = ProviderSuccess<T> | ProviderFailure;

export type NormalizedBar = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export type QuoteData = {
  symbol: string;
  price: number | null;
  bid: number | null;
  ask: number | null;
  quotedAt: string | null;
};

function getHeaders(): Record<string, string> {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_API_SECRET;

  if (!key || !secret) {
    throw new Error('MISSING_PROVIDER_CONFIG');
  }

  return {
    'APCA-API-KEY-ID': key,
    'APCA-API-SECRET-KEY': secret,
  };
}

function providerFailure(
  status: DataStatus,
  reasonCode: ProviderReasonCode,
  message: string,
  fetchedAt: string,
): ProviderFailure {
  return {
    ok: false,
    status,
    reasonCode,
    message,
    fetchedAt,
    provider: 'ALPACA',
  };
}

function classifyError(error: unknown, fetchedAt: string): ProviderFailure {
  const message = error instanceof Error ? error.message : String(error);

  if (message === 'MISSING_PROVIDER_CONFIG') {
    return providerFailure(
      'UNAVAILABLE',
      'MISSING_PROVIDER_CONFIG',
      'Market-data provider is not configured.',
      fetchedAt,
    );
  }

  if (message === 'PROVIDER_TIMEOUT') {
    return providerFailure(
      'UNAVAILABLE',
      'PROVIDER_TIMEOUT',
      'Market-data provider timed out. Please refresh shortly.',
      fetchedAt,
    );
  }

  if (
    message.startsWith('PROVIDER_HTTP_401') ||
    message.startsWith('PROVIDER_HTTP_403')
  ) {
    return providerFailure(
      'UNAVAILABLE',
      'PROVIDER_AUTH_FAILED',
      'Market-data provider authorization is unavailable.',
      fetchedAt,
    );
  }

  if (message.startsWith('PROVIDER_HTTP_429')) {
    return providerFailure(
      'RATE_LIMITED',
      'PROVIDER_RATE_LIMITED',
      'Market-data provider rate limit reached. Please refresh shortly.',
      fetchedAt,
    );
  }

  if (message === 'PROVIDER_INVALID_RESPONSE') {
    return providerFailure(
      'INVALID',
      'PROVIDER_INVALID_RESPONSE',
      'Market-data provider returned an invalid response.',
      fetchedAt,
    );
  }

  if (message.startsWith('PROVIDER_HTTP_')) {
    return providerFailure(
      'UNAVAILABLE',
      'PROVIDER_HTTP_ERROR',
      'Market-data provider request failed.',
      fetchedAt,
    );
  }

  return providerFailure(
    'UNAVAILABLE',
    'PROVIDER_NETWORK_ERROR',
    'Market-data provider could not be reached.',
    fetchedAt,
  );
}

async function request<T>(url: string): Promise<ProviderResult<T>> {
  const fetchedAt = new Date().toISOString();
  const parsedTimeout = Number(process.env.MARKET_DATA_TIMEOUT_MS || 10000);
  const timeoutMs =
    Number.isFinite(parsedTimeout) && parsedTimeout > 0
      ? parsedTimeout
      : 10000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: getHeaders(),
      signal: controller.signal,
    });

    const raw = await response.text();

    let data: T;

    try {
      data = JSON.parse(raw) as T;
    } catch {
      throw new Error('PROVIDER_INVALID_RESPONSE');
    }

    if (!response.ok) {
      throw new Error(`PROVIDER_HTTP_${response.status}`);
    }

    return {
      ok: true,
      status: 'LIVE',
      data,
      fetchedAt,
      provider: 'ALPACA',
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return classifyError(new Error('PROVIDER_TIMEOUT'), fetchedAt);
    }

    return classifyError(error, fetchedAt);
  } finally {
    clearTimeout(timer);
  }
}

function finite(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function toTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

/*
  Supports both likely Alpaca bar payload shapes:

  {
    "bars": [ ... ]
  }

  and:

  {
    "bars": {
      "SPY": [ ... ]
    }
  }
*/
export function extractRawBars(payload: unknown, symbol: string): unknown[] {
  const value = payload as {
    bars?: unknown[] | Record<string, unknown[]>;
  };

  if (Array.isArray(value?.bars)) {
    return value.bars;
  }

  if (
    value?.bars &&
    typeof value.bars === 'object' &&
    Array.isArray((value.bars as Record<string, unknown[]>)[symbol])
  ) {
    return (value.bars as Record<string, unknown[]>)[symbol];
  }

  return [];
}

export function normalizeBars(
  payload: unknown,
  symbol: string,
): NormalizedBar[] {
  const rawBars = extractRawBars(payload, symbol);
  const normalized: NormalizedBar[] = [];

  for (const rawBar of rawBars) {
    if (!rawBar || typeof rawBar !== 'object') {
      continue;
    }

    const bar = rawBar as Record<string, unknown>;

    const timestamp = toTimestamp(bar.t ?? bar.timestamp);
    const open = finite(bar.o ?? bar.open);
    const high = finite(bar.h ?? bar.high);
    const low = finite(bar.l ?? bar.low);
    const close = finite(bar.c ?? bar.close);
    const volume = finite(bar.v ?? bar.volume);

    if (
      !timestamp ||
      open === null ||
      high === null ||
      low === null ||
      close === null ||
      high < low
    ) {
      continue;
    }

    normalized.push({
      timestamp,
      open,
      high,
      low,
      close,
      volume,
    });
  }

  const deduplicated = new Map<string, NormalizedBar>();

  for (const bar of normalized) {
    deduplicated.set(bar.timestamp, bar);
  }

  return [...deduplicated.values()].sort(
    (left, right) =>
      new Date(left.timestamp).valueOf() - new Date(right.timestamp).valueOf(),
  );
}

export async function quote(
  symbol: string,
): Promise<ProviderResult<QuoteData>> {
  const result = await request<Record<string, unknown>>(
    `${BASE}/v2/stocks/${encodeURIComponent(symbol)}/quotes/latest`,
  );

  if (!result.ok) {
    return result;
  }

  const quoteValue =
    (result.data.quote as Record<string, unknown> | undefined) || result.data;

  const bid = finite(quoteValue.bp ?? quoteValue.bid);
  const ask = finite(quoteValue.ap ?? quoteValue.ask);
  const price = ask ?? bid;
  const quotedAt = toTimestamp(quoteValue.t ?? quoteValue.timestamp);

  if (price === null) {
    return providerFailure(
      'INVALID',
      'PROVIDER_INVALID_RESPONSE',
      'Market-data provider did not return a valid quote.',
      result.fetchedAt,
    );
  }

  return {
    ok: true,
    status: 'LIVE',
    data: {
      symbol,
      price,
      bid,
      ask,
      quotedAt,
    },
    fetchedAt: result.fetchedAt,
    provider: 'ALPACA',
  };
}

export async function bars(
  symbol: string,
): Promise<ProviderResult<NormalizedBar[]>> {
  const end = new Date();
  const start = new Date(end.getTime() - 120 * 86400000);

  const result = await request<unknown>(
    `${BASE}/v2/stocks/${encodeURIComponent(symbol)}/bars` +
      `?timeframe=1Day` +
      `&start=${encodeURIComponent(start.toISOString())}` +
      `&end=${encodeURIComponent(end.toISOString())}` +
      `&limit=100` +
      `&feed=iex`,
  );

  if (!result.ok) {
    return result;
  }

  const normalized = normalizeBars(result.data, symbol);

  if (normalized.length === 0) {
    return providerFailure(
      'INVALID',
      'INSUFFICIENT_BARS',
      'Market-data provider did not return valid historical bars.',
      result.fetchedAt,
    );
  }

  return {
    ok: true,
    status: 'LIVE',
    data: normalized,
    fetchedAt: result.fetchedAt,
    provider: 'ALPACA',
  };
}

export async function options(
  symbol: string,
): Promise<ProviderResult<unknown>> {
  const result = await request<unknown>(
    `${BASE}/v1beta1/options/snapshots/${encodeURIComponent(symbol)}` +
      '?feed=indicative&limit=100',
  );

  if (result.ok) {
    return result;
  }

  return {
    ok: false,
    status: result.status,
    reasonCode:
      result.reasonCode === 'MISSING_PROVIDER_CONFIG'
        ? 'MISSING_PROVIDER_CONFIG'
        : result.status === 'RATE_LIMITED'
          ? 'PROVIDER_RATE_LIMITED'
          : 'OPTIONS_DATA_UNAVAILABLE',
    message:
      result.status === 'RATE_LIMITED'
        ? result.message
        : 'Options research data is unavailable.',
    fetchedAt: result.fetchedAt,
    provider: 'ALPACA',
  };
}

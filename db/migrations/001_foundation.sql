CREATE TABLE IF NOT EXISTS symbols (
  symbol TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS market_snapshots (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL REFERENCES symbols(symbol),
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('LIVE','DELAYED','STALE','UNAVAILABLE','DEMO')),
  market_timestamp TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS market_snapshots_symbol_created_idx ON market_snapshots(symbol, created_at DESC);
CREATE TABLE IF NOT EXISTS technical_snapshots (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL REFERENCES symbols(symbol),
  timeframe TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS technical_snapshots_symbol_timeframe_idx ON technical_snapshots(symbol, timeframe, calculated_at DESC);
CREATE TABLE IF NOT EXISTS provider_health (
  provider TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  latency_ms INTEGER,
  last_success TIMESTAMPTZ,
  error_count INTEGER NOT NULL DEFAULT 0,
  rate_limited BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS evidence_packets (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL REFERENCES symbols(symbol),
  status TEXT NOT NULL,
  packet JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

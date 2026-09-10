import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

type UiState =
  | "IDLE"
  | "LOADING"
  | "SUCCESS"
  | "PARTIAL"
  | "STALE"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "ERROR";

const fmt = (value: any, digits = 2) => {
  if (value === null || value === undefined || value === "") return "—";

  const n = Number(value);

  if (!Number.isFinite(n)) return "—";

  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

const timeFmt = (value: any) => {
  if (!value) return "—";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) return "—";

  return d.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
};

const dateFmt = (value: any) => {
  if (!value) return "—";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) return "—";

  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

async function api<T = any>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    ...options,
  });

  const text = await response.text();

  let payload: any = {};

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {
      message: text || "Invalid server response",
    };
  }

  if (!response.ok) {
    throw new Error(
      payload?.message ||
        payload?.error ||
        `Request failed (${response.status})`
    );
  }

  return payload;
}

function stateFromData(data: any): UiState {
  const state = String(
    data?.dataIntegrity?.state ||
      data?.dataState ||
      data?.status ||
      ""
  ).toUpperCase();

  if (state === "LIVE") return "SUCCESS";
  if (state === "PARTIAL") return "PARTIAL";
  if (state === "STALE") return "STALE";
  if (state === "RATE_LIMITED") return "RATE_LIMITED";
  if (state === "UNAVAILABLE") return "UNAVAILABLE";

  return data ? "SUCCESS" : "IDLE";
}

function StatusBadge({
  state,
  compact = false,
}: {
  state?: string;
  compact?: boolean;
}) {
  const normalized = String(state || "UNKNOWN").toUpperCase();

  return (
    <span
      className={`status status-${normalized.toLowerCase()} ${
        compact ? "status-compact" : ""
      }`}
    >
      <span className="status-dot" />
      {normalized}
    </span>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone = "",
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className={`metric-card ${tone}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {detail && <div className="metric-detail">{detail}</div>}
    </div>
  );
}

function MarketCard({
  symbol,
  data,
  onOpen,
}: {
  symbol: string;
  data: any;
  onOpen: () => void;
}) {
  const quote = data?.quote || {};
  const technical = data?.technical || {};

  const trend = String(technical?.trend || "UNKNOWN").toUpperCase();

  const trendClass =
    trend === "BULLISH"
      ? "bullish"
      : trend === "BEARISH"
      ? "bearish"
      : "neutral";

  return (
    <article className="market-card">
      <div className="market-card-head">
        <div>
          <div className="symbol">{symbol}</div>
          <div className="symbol-subtitle">INDEX ETF</div>
        </div>

        <StatusBadge state={quote?.status || "UNAVAILABLE"} compact />
      </div>

      <div className="market-price">
        {quote?.price == null ? "—" : `$${fmt(quote.price)}`}
      </div>

      <div className={`trend-pill ${trendClass}`}>
        {trend === "BULLISH"
          ? "▲"
          : trend === "BEARISH"
          ? "▼"
          : "•"}{" "}
        {trend}
      </div>

      <div className="market-grid">
        <div>
          <span>EMA 5</span>
          <strong>{fmt(technical?.ema5)}</strong>
        </div>

        <div>
          <span>EMA 20</span>
          <strong>{fmt(technical?.ema20)}</strong>
        </div>

        <div>
          <span>EMA 50</span>
          <strong>{fmt(technical?.ema50)}</strong>
        </div>

        <div>
          <span>ATR 14</span>
          <strong>{fmt(technical?.atr14)}</strong>
        </div>

        <div>
          <span>20D HIGH</span>
          <strong>{fmt(technical?.high20)}</strong>
        </div>

        <div>
          <span>20D LOW</span>
          <strong>{fmt(technical?.low20)}</strong>
        </div>
      </div>

      <div className="market-footer">
        <span>
          Quote {timeFmt(quote?.quotedAt || quote?.fetchedAt)}
        </span>

        <button className="text-button" onClick={onOpen}>
          Deep dive →
        </button>
      </div>
    </article>
  );
}

function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">◎</div>
      <h3>{title}</h3>
      <p>{message}</p>
      {action}
    </div>
  );
}

function CommandView({
  dashboard,
  onDeep,
  question,
  setQuestion,
  answer,
  onAsk,
  busy,
}: {
  dashboard: any;
  onDeep: (symbol: string) => void;
  question: string;
  setQuestion: (value: string) => void;
  answer: string;
  onAsk: () => void;
  busy: boolean;
}) {
  const market = dashboard?.marketPulse;

  const regime = String(market?.regime || "UNKNOWN").toUpperCase();
  const decision = String(
    dashboard?.finalDecision?.action || "NO_TRADE"
  ).toUpperCase();

  const dataState = dashboard?.dataIntegrity?.state || "UNAVAILABLE";

  return (
    <>
      <section className="hero">
        <div>
          <div className="eyebrow">NANI PRO X / COMMAND CENTER</div>

          <h1>
            Market intelligence
            <span> without execution.</span>
          </h1>

          <p>
            Evidence-first market state, technical context and
            risk-gated decision support.
          </p>
        </div>

        <div className="hero-status">
          <StatusBadge state={dataState} />

          <span className="updated">
            Updated {timeFmt(dashboard?.generatedAt)}
          </span>
        </div>
      </section>

      <section className="metric-grid">
        <MetricCard
          label="DATA"
          value={<StatusBadge state={dataState} />}
          detail={
            dashboard?.dataIntegrity?.provider
              ? `Provider: ${dashboard.dataIntegrity.provider}`
              : "Provider unavailable"
          }
        />

        <MetricCard
          label="MARKET REGIME"
          value={regime}
          detail="SPY + QQQ alignment"
          tone={
            regime === "RISK_ON"
              ? "tone-positive"
              : regime === "RISK_OFF"
              ? "tone-negative"
              : "tone-neutral"
          }
        />

        <MetricCard
          label="DECISION"
          value={decision}
          detail={
            decision === "NO_TRADE"
              ? "Protection gate active"
              : "Wait for validated trigger"
          }
          tone={
            decision === "NO_TRADE"
              ? "tone-warning"
              : "tone-neutral"
          }
        />
      </section>

      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">MARKET PULSE</div>
            <h2>SPY / QQQ</h2>
          </div>

          <span className="section-note">Read-only research</span>
        </div>

        <div className="market-two">
          <MarketCard
            symbol="SPY"
            data={market?.spy}
            onOpen={() => onDeep("SPY")}
          />

          <MarketCard
            symbol="QQQ"
            data={market?.qqq}
            onOpen={() => onDeep("QQQ")}
          />
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">ASK NANI</div>
            <h2>Ask about the current state</h2>
          </div>
        </div>

        <div className="command-box">
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !busy) {
                onAsk();
              }
            }}
            placeholder="Why is NANI saying NO_TRADE?"
            disabled={busy}
          />

          <button
            className="primary-button"
            onClick={onAsk}
            disabled={busy || !question.trim()}
          >
            {busy ? "Working…" : "Ask"}
          </button>
        </div>

        {answer && (
          <div className="answer-card">
            <div className="answer-label">NANI RESPONSE</div>
            <p>{answer}</p>
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">DECISION GATE</div>
            <h2>Why this decision?</h2>
          </div>
        </div>

        <div className="reason-list">
          {(dashboard?.reasons || [
            "No validated decision reasons available.",
          ]).map((reason: string, index: number) => (
            <div className="reason" key={`${reason}-${index}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p>{reason}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="safety-banner">
        <div className="safety-icon">✓</div>

        <div>
          <strong>Research-only safety boundary</strong>

          <p>
            LIVE_TRADING=false · executionAllowed=false · no broker
            orders · defined-risk research only.
          </p>
        </div>
      </section>
    </>
  );
}

function DeepView({
  symbol,
  detail,
  busy,
  onLoad,
}: {
  symbol: string;
  detail: any;
  busy: boolean;
  onLoad: () => void;
}) {
  const quote = detail?.quote || {};
  const technical = detail?.technical || {};

  return (
    <section className="section">
      <div className="page-title-row">
        <div>
          <div className="eyebrow">DEEP RESEARCH</div>
          <h1>{symbol}</h1>
        </div>

        <StatusBadge state={detail?.dataState || "UNAVAILABLE"} />
      </div>

      {!detail && (
        <EmptyState
          title={`Load ${symbol} research`}
          message="The deep-dive endpoint will retrieve the latest validated provider-backed state."
          action={
            <button
              className="primary-button"
              onClick={onLoad}
              disabled={busy}
            >
              {busy ? "Loading…" : `Load ${symbol}`}
            </button>
          }
        />
      )}

      {detail && (
        <>
          <div className="metric-grid">
            <MetricCard
              label="PRICE"
              value={
                quote?.price == null
                  ? "—"
                  : `$${fmt(quote.price)}`
              }
              detail={`Quote ${timeFmt(
                quote?.quotedAt || quote?.fetchedAt
              )}`}
            />

            <MetricCard
              label="TREND"
              value={technical?.trend || "UNKNOWN"}
              detail={`EMA20 ${fmt(technical?.ema20)}`}
            />

            <MetricCard
              label="ATR 14"
              value={fmt(technical?.atr14)}
              detail={`${technical?.barsAvailable || 0} bars`}
            />
          </div>

          <div className="data-panel">
            <div className="data-panel-head">
              <div>
                <div className="eyebrow">TECHNICAL STATE</div>
                <h2>Validated calculations</h2>
              </div>

              <button
                className="secondary-button"
                onClick={onLoad}
                disabled={busy}
              >
                {busy ? "Refreshing…" : "Refresh"}
              </button>
            </div>

            <div className="technical-grid">
              <div>
                <span>EMA 5</span>
                <strong>{fmt(technical?.ema5)}</strong>
              </div>

              <div>
                <span>EMA 20</span>
                <strong>{fmt(technical?.ema20)}</strong>
              </div>

              <div>
                <span>EMA 50</span>
                <strong>{fmt(technical?.ema50)}</strong>
              </div>

              <div>
                <span>ATR 14</span>
                <strong>{fmt(technical?.atr14)}</strong>
              </div>

              <div>
                <span>20D HIGH</span>
                <strong>{fmt(technical?.high20)}</strong>
              </div>

              <div>
                <span>20D LOW</span>
                <strong>{fmt(technical?.low20)}</strong>
              </div>
            </div>
          </div>

          {detail?.reason && (
            <div className="notice warning">
              <strong>Data limitation</strong>
              <p>{detail.reason}</p>
            </div>
          )}

          <details className="developer-json">
            <summary>Developer data</summary>
            <pre>{JSON.stringify(detail, null, 2)}</pre>
          </details>
        </>
      )}
    </section>
  );
}

function RadarView({ dashboard }: { dashboard: any }) {
  const decision =
    dashboard?.finalDecision?.action || "NO_TRADE";

  return (
    <section className="section">
      <div className="page-title-row">
        <div>
          <div className="eyebrow">RESEARCH RADAR</div>
          <h1>Trade Radar</h1>
        </div>

        <div
          className={`decision-large ${
            decision === "NO_TRADE" ? "blocked" : ""
          }`}
        >
          {decision}
        </div>
      </div>

      <div className="radar-card">
        <div className="radar-center">
          <div className="radar-ring">
            <span>{decision}</span>
          </div>

          <p>
            NANI does not force a trade. A candidate must pass
            validated market-data and risk gates before being
            considered.
          </p>
        </div>
      </div>

      <div className="reason-list">
        {(dashboard?.reasons || []).map(
          (reason: string, index: number) => (
            <div className="reason" key={`${reason}-${index}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p>{reason}</p>
            </div>
          )
        )}
      </div>
    </section>
  );
}

function OptionsView({
  detail,
  busy,
  onLoad,
}: {
  detail: any;
  busy: boolean;
  onLoad: () => void;
}) {
  const underlying = detail?.underlying || {};

  return (
    <section className="section">
      <div className="page-title-row">
        <div>
          <div className="eyebrow">DEFINED-RISK RESEARCH</div>
          <h1>Options</h1>
        </div>

        <StatusBadge state={detail?.dataState || "IDLE"} />
      </div>

      <div className="safety-banner">
        <div className="safety-icon">✓</div>

        <div>
          <strong>Execution permanently blocked</strong>

          <p>
            NANI may analyze listed options, but this interface
            cannot submit, modify, cancel or transmit orders.
          </p>
        </div>
      </div>

      {!detail && (
        <EmptyState
          title="SPY options research"
          message="Load provider-backed option context. No order action is available."
          action={
            <button
              className="primary-button"
              onClick={onLoad}
              disabled={busy}
            >
              {busy ? "Loading…" : "Load SPY Options"}
            </button>
          }
        />
      )}

      {detail && (
        <>
          <div className="metric-grid">
            <MetricCard
              label="UNDERLYING"
              value={
                underlying?.price == null
                  ? "—"
                  : `$${fmt(underlying.price)}`
              }
              detail={underlying?.status || "UNAVAILABLE"}
            />

            <MetricCard
              label="EXECUTION"
              value="BLOCKED"
              detail="Research only"
              tone="tone-warning"
            />

            <MetricCard
              label="RISK MODEL"
              value="DEFINED"
              detail="No naked risk"
            />
          </div>

          <div className="rules-grid">
            {(detail?.rules || [
              "Defined-risk only",
              "No naked options",
              "No execution",
              "Reject stale/unavailable underlying data",
            ]).map((rule: string, index: number) => (
              <div className="rule-card" key={index}>
                <span>0{index + 1}</span>
                <strong>{rule}</strong>
              </div>
            ))}
          </div>

          <details className="developer-json">
            <summary>Provider response</summary>
            <pre>{JSON.stringify(detail, null, 2)}</pre>
          </details>

          <button
            className="secondary-button"
            onClick={onLoad}
            disabled={busy}
          >
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        </>
      )}
    </section>
  );
}

function MemoryView() {
  const [items, setItems] = useState<any[]>([]);
  const [state, setState] = useState<UiState>("LOADING");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setState("LOADING");
    setError("");

    try {
      const data = await api("/api/memory");

      setItems(Array.isArray(data?.items) ? data.items : []);

      setState(
        data?.dataState === "UNAVAILABLE"
          ? "UNAVAILABLE"
          : "SUCCESS"
      );
    } catch (err) {
      setState("ERROR");
      setError(
        err instanceof Error ? err.message : String(err)
      );
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="section">
      <div className="page-title-row">
        <div>
          <div className="eyebrow">PERSISTENT CONTEXT</div>
          <h1>Memory</h1>
        </div>

        <StatusBadge state={state} />
      </div>

      {error && <div className="notice error">{error}</div>}

      {state === "UNAVAILABLE" && (
        <EmptyState
          title="Memory unavailable"
          message="The market interface remains usable, but persistent memory is currently unavailable."
          action={
            <button
              className="secondary-button"
              onClick={load}
            >
              Retry
            </button>
          }
        />
      )}

      {state === "SUCCESS" && !items.length && (
        <EmptyState
          title="No memory entries"
          message="Questions and supported research context will appear here when persistence is available."
        />
      )}

      {items.length > 0 && (
        <div className="memory-list">
          {items.map((item) => (
            <article className="memory-card" key={item.id}>
              <div className="memory-head">
                <span className="memory-kind">
                  {item.kind || "NOTE"}
                </span>

                <time>
                  {dateFmt(item.created_at)}
                </time>
              </div>

              <p>{item.content || "—"}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function App() {
  const [dashboard, setDashboard] = useState<any>(null);
  const [tab, setTab] = useState("COMMAND");

  const [deepSymbol, setDeepSymbol] = useState("SPY");
  const [deepData, setDeepData] = useState<any>(null);

  const [optionsData, setOptionsData] = useState<any>(null);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  const [state, setState] = useState<UiState>("LOADING");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      setError("");

      try {
        await fn();
      } catch (err) {
        setState("ERROR");
        setError(
          err instanceof Error ? err.message : String(err)
        );
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const refreshDashboard = useCallback(async () => {
    await run(async () => {
      const data = await api("/api/dashboard");

      setDashboard(data);
      setState(stateFromData(data));
    });
  }, [run]);

  const loadDeep = useCallback(
    async (symbol: string) => {
      setDeepSymbol(symbol);

      await run(async () => {
        const data = await api(
          `/api/deep/${encodeURIComponent(symbol)}`
        );

        setDeepData(data);
        setTab(symbol);
      });
    },
    [run]
  );

  const loadOptions = useCallback(async () => {
    await run(async () => {
      const data = await api("/api/options/SPY");

      setOptionsData(data);
      setTab("OPTIONS");
    });
  }, [run]);

  const askNani = useCallback(async () => {
    const text = question.trim();

    if (!text) return;

    await run(async () => {
      const data = await api("/api/command", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          text,
        }),
      });

      setAnswer(data?.answer || "No response returned.");

      if (data?.data) {
        setDashboard(data.data);
        setState(stateFromData(data.data));
      }
    });
  }, [question, run]);

  useEffect(() => {
    refreshDashboard();
  }, [refreshDashboard]);

  const navigate = (next: string) => {
    setTab(next);
    setError("");

    if (next === "COMMAND") {
      return;
    }

    if (next === "SPY" || next === "QQQ") {
      setDeepSymbol(next);
      setDeepData(null);
      return;
    }

    if (next === "OPTIONS") {
      setOptionsData(null);
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">N</div>

          <div>
            <div className="brand-name">
              NANI <span>PRO X</span>
            </div>

            <div className="brand-subtitle">
              PERSONAL MARKET CONTROL ROOM
            </div>
          </div>
        </div>

        <button
          className="refresh-button"
          onClick={refreshDashboard}
          disabled={busy}
          aria-label="Refresh market data"
        >
          {busy ? "…" : "↻"}
          <span>Refresh</span>
        </button>
      </header>

      {error && (
        <div className="global-error">
          <span>⚠</span>
          <span>{error}</span>

          <button onClick={() => setError("")}>×</button>
        </div>
      )}

      <main className="page">
        {tab === "COMMAND" && (
          <CommandView
            dashboard={dashboard}
            onDeep={loadDeep}
            question={question}
            setQuestion={setQuestion}
            answer={answer}
            onAsk={askNani}
            busy={busy}
          />
        )}

        {(tab === "SPY" || tab === "QQQ") && (
          <DeepView
            symbol={deepSymbol}
            detail={deepData}
            busy={busy}
            onLoad={() => loadDeep(deepSymbol)}
          />
        )}

        {tab === "RADAR" && (
          <RadarView dashboard={dashboard} />
        )}

        {tab === "OPTIONS" && (
          <OptionsView
            detail={optionsData}
            busy={busy}
            onLoad={loadOptions}
          />
        )}

        {tab === "MEMORY" && <MemoryView />}
      </main>

      <nav className="bottom-nav">
        {[
          ["COMMAND", "⌂"],
          ["SPY", "S"],
          ["QQQ", "Q"],
          ["RADAR", "◈"],
          ["OPTIONS", "△"],
          ["MEMORY", "◷"],
        ].map(([name, icon]) => (
          <button
            key={name}
            className={tab === name ? "active" : ""}
            onClick={() => navigate(name)}
          >
            <span className="nav-icon">{icon}</span>
            <span>{name}</span>
          </button>
        ))}
      </nav>

      <footer className="safety-footer">
        <span>LIVE_TRADING=false</span>
        <span>EXECUTION BLOCKED</span>
        <span>RESEARCH ONLY</span>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
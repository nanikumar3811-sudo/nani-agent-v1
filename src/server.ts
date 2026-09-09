import "dotenv/config";
import Fastify from "fastify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

import {
  deepDive,
  optionsContext,
  premarketPacket
} from "./analysis.js";

import {
  getTheses,
  latestSnapshot,
  recentReactions,
  recentSnapshots,
  recordReaction,
  saveSnapshot,
  saveThesis
} from "./db.js";

const app = Fastify({
  logger: true
});

const token = process.env.NANI_API_TOKEN || "";

function authorized(req: any) {
  if (!token) return true;

  const h = req.headers.authorization || "";
  return h === `Bearer ${token}`;
}

function watchlist() {
  return (
    process.env.WATCHLIST ||
    "SPY,QQQ,NVDA,MSFT,GOOG,AVGO,QCOM,META,CRCL,SNAP,IREN,PL,SMCI,IBM,BABA,KWEB,ZIM"
  )
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

function jsonResponse(data: unknown) {
  return JSON.stringify(data, null, 2);
}

/* -------------------------------------------------------------------------- */
/* MCP SERVER                                                                  */
/* -------------------------------------------------------------------------- */

function makeServer() {
  const server = new McpServer({
    name: "NANI Personal Market Agent",
    version: "1.0.0"
  });

  server.tool(
    "nani_market_state",
    "Get NANI's current persistent market state, recent premarket snapshots, reactions and active theses. Use this before answering current-market questions.",
    {},
    async () => ({
      content: [
        {
          type: "text",
          text: jsonResponse({
            latestSnapshot: latestSnapshot(),
            recentSnapshots: recentSnapshots(5),
            recentReactions: recentReactions(10),
            activeTheses: getTheses(),
            watchlist: watchlist()
          })
        }
      ]
    })
  );

  server.tool(
    "nani_premarket_intelligence",
    "Run the full NANI premarket evidence collection. Use for 8:15-style intelligence and whenever the user asks what is happening in the market.",
    {},
    async () => {
      const packet = await premarketPacket(watchlist());

      saveSnapshot("PREMARKET", packet);

      return {
        content: [
          {
            type: "text",
            text: jsonResponse(packet)
          }
        ]
      };
    }
  );

  server.tool(
    "nani_symbol_deep_dive",
    "Collect current quote/technical/news context for a specific ticker. Use when the user asks about a stock or challenges a thesis.",
    {
      ticker: z.string().min(1).max(10)
    },
    async ({ ticker }) => {
      const result = await deepDive(ticker.toUpperCase());

      return {
        content: [
          {
            type: "text",
            text: jsonResponse(result)
          }
        ]
      };
    }
  );

  server.tool(
    "nani_options_context",
    "Retrieve current options-chain/snapshot context for a ticker. Use before discussing a specific option contract or selecting a defined-risk contract.",
    {
      ticker: z.string().min(1).max(10)
    },
    async ({ ticker }) => {
      const result = await optionsContext(ticker.toUpperCase());

      return {
        content: [
          {
            type: "text",
            text: jsonResponse(result)
          }
        ]
      };
    }
  );

  server.tool(
    "nani_market_reaction",
    "Explain what changed relative to NANI's stored state. Use for 'what changed', 'why is it moving', 'is the thesis broken', and similar questions.",
    {
      ticker: z.string().optional(),
      question: z.string().min(1).max(1000)
    },
    async ({ ticker, question }) => ({
      content: [
        {
          type: "text",
          text: jsonResponse({
            question,
            ticker: ticker?.toUpperCase() || null,
            latest: latestSnapshot(),
            recentSnapshots: recentSnapshots(8),
            recentReactions: recentReactions(20),
            activeTheses: getTheses(ticker)
          })
        }
      ]
    })
  );

  server.tool(
    "nani_save_thesis",
    "Persist the user's market/trade thesis so NANI can challenge it later.",
    {
      ticker: z.string().min(1).max(10),
      thesis: z.string().min(1).max(3000),
      direction: z.enum(["BULLISH", "BEARISH", "NEUTRAL"]),
      invalidation: z.string().max(1000).optional(),
      notes: z.string().max(2000).optional()
    },
    async ({
      ticker,
      thesis,
      direction,
      invalidation,
      notes
    }) => ({
      content: [
        {
          type: "text",
          text: jsonResponse({
            id: saveThesis(
              ticker,
              thesis,
              direction,
              invalidation,
              notes
            ),
            status: "ACTIVE",
            ticker: ticker.toUpperCase(),
            thesis,
            direction,
            invalidation,
            notes
          })
        }
      ]
    })
  );

  server.tool(
    "nani_get_theses",
    "Retrieve active saved theses, optionally for one ticker.",
    {
      ticker: z.string().optional()
    },
    async ({ ticker }) => ({
      content: [
        {
          type: "text",
          text: jsonResponse(getTheses(ticker))
        }
      ]
    })
  );

  server.tool(
    "nani_record_reaction",
    "Record what actually happened versus an earlier expectation so NANI can learn the market reaction history.",
    {
      ticker: z.string().optional(),
      expected: z.string().min(1).max(2000),
      observed: z.string().min(1).max(2000),
      explanation: z.string().max(2000).optional(),
      outcome: z.string().max(1000).optional()
    },
    async ({
      ticker,
      expected,
      observed,
      explanation,
      outcome
    }) => ({
      content: [
        {
          type: "text",
          text: jsonResponse({
            id: recordReaction(
              ticker,
              expected,
              observed,
              explanation,
              outcome
            ),
            saved: true
          })
        }
      ]
    })
  );

  server.tool(
    "nani_risk_check",
    "Apply NANI's defined-risk constraints to a proposed options idea. This does not place an order.",
    {
      premium: z.number().positive(),
      quantity: z.number().int().positive(),
      dte: z.number().int().nonnegative(),
      spreadPct: z.number().nonnegative().optional(),
      thesis: z.string().min(1).max(2000)
    },
    async ({
      premium,
      quantity,
      dte,
      spreadPct,
      thesis
    }) => {
      const maxPremium = Number(
        process.env.MAX_PREMIUM_USD || 500
      );

      const maxRisk = Number(
        process.env.MAX_TRADE_RISK_USD || 200
      );

      const total = premium * 100 * quantity;

      const gates = [
        {
          gate: "MAX_PREMIUM",
          pass: total <= maxPremium,
          detail: `$${total.toFixed(2)} <= $${maxPremium}`
        },
        {
          gate: "MAX_TRADE_RISK",
          pass: total <= maxRisk,
          detail: `$${total.toFixed(2)} <= $${maxRisk}`
        },
        {
          gate: "DEFINED_RISK",
          pass: true,
          detail:
            "Long option only; no naked/undefined-risk execution tool exists."
        },
        {
          gate: "DTE",
          pass: dte >= 7 && dte <= 45,
          detail: `${dte} DTE within 7-45 preferred range`
        },
        {
          gate: "LIQUIDITY",
          pass: spreadPct == null ? true : spreadPct <= 10,
          detail:
            spreadPct == null
              ? "Not supplied"
              : `${spreadPct}% spread`
        }
      ];

      return {
        content: [
          {
            type: "text",
            text: jsonResponse({
              thesis,
              totalPremiumRisk: total,
              gates,
              overall: gates.every((g) => g.pass)
                ? "PASS"
                : "NO_TRADE"
            })
          }
        ]
      };
    }
  );

  return server;
}

/* -------------------------------------------------------------------------- */
/* HEALTH                                                                      */
/* -------------------------------------------------------------------------- */

app.get("/health", async () => ({
  ok: true,
  service: "nani-chatgpt-market-agent",
  liveTrading: false,
  timestamp: new Date().toISOString(),
  environment: process.env.NODE_ENV || "development",
  providerKeys: {
    alpaca: Boolean(process.env.ALPACA_API_KEY),
    finnhub: Boolean(process.env.FINNHUB_API_KEY)
  }
}));

/* -------------------------------------------------------------------------- */
/* NANI DASHBOARD                                                              */
/* -------------------------------------------------------------------------- */

app.get("/", async (_req, reply) => {
  reply.type("text/html");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport"
      content="width=device-width,initial-scale=1,viewport-fit=cover">

<meta name="theme-color" content="#09090b">

<title>NANI Personal Market Agent</title>

<style>
* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  background: #09090b;
  color: #f4f4f5;
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

body {
  min-height: 100vh;
}

.container {
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
  padding: 20px;
}

.header {
  padding: 20px 0;
}

.logo {
  font-size: 32px;
  font-weight: 800;
  letter-spacing: -1px;
}

.subtitle {
  margin-top: 6px;
  color: #a1a1aa;
}

.grid {
  display: grid;
  grid-template-columns:
    repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}

.card {
  background: #18181b;
  border: 1px solid #27272a;
  border-radius: 18px;
  padding: 18px;
}

.card h3 {
  margin: 0 0 8px;
  font-size: 14px;
  color: #a1a1aa;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.value {
  font-size: 25px;
  font-weight: 750;
}

.small {
  color: #a1a1aa;
  font-size: 13px;
  margin-top: 7px;
}

.actions {
  display: grid;
  grid-template-columns:
    repeat(auto-fit, minmax(170px, 1fr));
  gap: 10px;
  margin: 18px 0;
}

button {
  border: 0;
  border-radius: 14px;
  padding: 14px;
  background: #27272a;
  color: white;
  font-size: 15px;
  font-weight: 650;
  cursor: pointer;
}

button:active {
  transform: scale(.98);
}

pre {
  white-space: pre-wrap;
  word-break: break-word;
  background: #111113;
  border: 1px solid #27272a;
  border-radius: 14px;
  padding: 16px;
  overflow-x: auto;
  min-height: 180px;
  color: #d4d4d8;
}

.status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #22c55e;
}

.footer {
  margin-top: 24px;
  color: #71717a;
  font-size: 12px;
  text-align: center;
}

@media (max-width: 600px) {
  .container {
    padding: 14px;
  }

  .logo {
    font-size: 28px;
  }
}
</style>
</head>

<body>

<div class="container">

  <div class="header">
    <div class="logo">NANI</div>
    <div class="subtitle">
      Personal Market Intelligence Agent
    </div>
  </div>

  <div class="grid">

    <div class="card">
      <h3>Status</h3>
      <div class="value status">
        <span class="dot"></span>
        LIVE
      </div>
      <div class="small">
        Research / paper trading only
      </div>
    </div>

    <div class="card">
      <h3>Watchlist</h3>
      <div id="watchlist" class="value">Loading...</div>
      <div class="small">
        Primary NANI coverage
      </div>
    </div>

    <div class="card">
      <h3>Trading Mode</h3>
      <div class="value">PAPER</div>
      <div class="small">
        No order execution
      </div>
    </div>

    <div class="card">
      <h3>Last Update</h3>
      <div id="timestamp" class="value">--</div>
      <div class="small">
        Server health timestamp
      </div>
    </div>

  </div>

  <div class="actions">
    <button onclick="loadState()">
      Market State
    </button>

    <button onclick="loadPremarket()">
      Premarket Intelligence
    </button>

    <button onclick="deepDive()">
      Symbol Deep Dive
    </button>

    <button onclick="optionsContext()">
      Options Context
    </button>
  </div>

  <div class="card">
    <h3>Command Output</h3>
    <pre id="output">NANI ready.</pre>
  </div>

  <div class="footer">
    NANI Personal Market Agent V1
  </div>

</div>

<script>
async function api(url, options = {}) {
  const response = await fetch(url, options);

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(
      "HTTP " +
      response.status +
      ": " +
      (typeof data === "string"
        ? data
        : JSON.stringify(data))
    );
  }

  return data;
}

function show(data) {
  document.getElementById("output").textContent =
    typeof data === "string"
      ? data
      : JSON.stringify(data, null, 2);
}

async function loadHealth() {
  try {
    const data = await api("/health");

    document.getElementById("timestamp").textContent =
      new Date(data.timestamp).toLocaleTimeString();

  } catch (error) {
    document.getElementById("timestamp").textContent = "ERROR";
  }
}

async function loadState() {
  try {
    const data = await api("/api/state");

    if (data.watchlist) {
      document.getElementById("watchlist").textContent =
        data.watchlist.length + " symbols";
    }

    show(data);
  } catch (error) {
    show({
      error: error.message
    });
  }
}

async function loadPremarket() {
  show({
    status: "Running NANI premarket intelligence..."
  });

  try {
    const data = await api("/api/premarket");
    show(data);
  } catch (error) {
    show({
      error: error.message
    });
  }
}

async function deepDive() {
  const ticker =
    prompt("Ticker", "SPY");

  if (!ticker) return;

  show({
    status: "Running deep dive for " +
      ticker.toUpperCase() +
      "..."
  });

  try {
    const data = await api(
      "/api/deep-dive/" +
      encodeURIComponent(ticker.toUpperCase())
    );

    show(data);
  } catch (error) {
    show({
      error: error.message
    });
  }
}

async function optionsContext() {
  const ticker =
    prompt("Ticker", "SPY");

  if (!ticker) return;

  show({
    status: "Loading options context for " +
      ticker.toUpperCase() +
      "..."
  });

  try {
    const data = await api(
      "/api/options-context?ticker=" +
      encodeURIComponent(ticker.toUpperCase())
    );

    show(data);
  } catch (error) {
    show({
      error: error.message
    });
  }
}

loadHealth();
loadState();
</script>

</body>
</html>`;
});

/* -------------------------------------------------------------------------- */
/* DASHBOARD API                                                               */
/* -------------------------------------------------------------------------- */

app.get("/api/state", async (_req, reply) => {
  try {
    return {
      ok: true,
      timestamp: new Date().toISOString(),
      watchlist: watchlist(),
      latestSnapshot: latestSnapshot(),
      recentSnapshots: recentSnapshots(8),
      recentReactions: recentReactions(20),
      activeTheses: getTheses(),
      liveTrading: false
    };
  } catch (error: any) {
    return reply.code(500).send({
      ok: false,
      error: error?.message || "Unable to load NANI state"
    });
  }
});

app.get("/api/premarket", async (_req, reply) => {
  try {
    const packet = await premarketPacket(watchlist());

    saveSnapshot("PREMARKET", packet);

    return {
      ok: true,
      timestamp: new Date().toISOString(),
      packet
    };
  } catch (error: any) {
    return reply.code(500).send({
      ok: false,
      error: error?.message || "Premarket intelligence failed"
    });
  }
});

app.get("/api/deep-dive/:ticker", async (req: any, reply) => {
  const ticker = String(req.params.ticker || "")
    .trim()
    .toUpperCase();

  if (!ticker || ticker.length > 10) {
    return reply.code(400).send({
      ok: false,
      error: "Invalid ticker"
    });
  }

  try {
    const result = await deepDive(ticker);

    return {
      ok: true,
      timestamp: new Date().toISOString(),
      ticker,
      result
    };
  } catch (error: any) {
    return reply.code(500).send({
      ok: false,
      ticker,
      error: error?.message || "Deep dive failed"
    });
  }
});

app.get("/api/options-context", async (req: any, reply) => {
  const ticker = String(req.query?.ticker || "")
    .trim()
    .toUpperCase();

  if (!ticker || ticker.length > 10) {
    return reply.code(400).send({
      ok: false,
      error: "ticker query parameter is required"
    });
  }

  try {
    const result = await optionsContext(ticker);

    return {
      ok: true,
      timestamp: new Date().toISOString(),
      ticker,
      result
    };
  } catch (error: any) {
    return reply.code(500).send({
      ok: false,
      ticker,
      error: error?.message || "Options context failed"
    });
  }
});

/* -------------------------------------------------------------------------- */
/* MCP METADATA                                                                */
/* -------------------------------------------------------------------------- */

app.get("/.well-known/mcp.json", async () => ({
  name: "NANI Personal Market Agent",
  version: "1.0.0",
  endpoint: "/mcp",
  capabilities: [
    "market_state",
    "premarket_intelligence",
    "symbol_deep_dive",
    "options_context",
    "market_reaction",
    "thesis_memory",
    "risk_check"
  ],
  liveTrading: false
}));

/* -------------------------------------------------------------------------- */
/* MCP ENDPOINT                                                                */
/* -------------------------------------------------------------------------- */

app.post("/mcp", async (req: any, reply: any) => {
  if (!authorized(req)) {
    return reply.code(401).send({
      error: "unauthorized"
    });
  }

  const server = makeServer();

  const transport =
    new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });

  await server.connect(transport);

  await transport.handleRequest(
    req.raw,
    reply.raw,
    req.body
  );

  reply.hijack();
});

/* -------------------------------------------------------------------------- */
/* SERVER START                                                                */
/* -------------------------------------------------------------------------- */

const port = Number(
  process.env.PORT || 10000
);

const host =
  process.env.HOST || "0.0.0.0";

app.listen({
  port,
  host
})
  .then(() => {
    console.log(
      `NANI listening on ${host}:${port}`
    );
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
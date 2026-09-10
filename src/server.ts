import "dotenv/config";

import Fastify from "fastify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

import {
  dbHealth,
  dbMode,
  getTheses,
  initDb,
  latestSnapshot,
  recentReactions,
  recentSnapshots,
  recordReaction,
  saveSnapshot,
  saveThesis
} from "./db.js";

import {
  deepDive,
  optionsContext,
  premarketPacket
} from "./analysis.js";

const app = Fastify({
  logger: true
});

const token = process.env.NANI_API_TOKEN || "";

function authorized(req: any) {
  if (!token) {
    return true;
  }

  const header = req.headers.authorization || "";

  return header === `Bearer ${token}`;
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

function safeJsonParse(value: any) {
  if (value == null) {
    return null;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizeSnapshot(row: any) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    payload: safeJsonParse(row.payload)
  };
}

function normalizeSnapshots(rows: any[]) {
  return rows.map(normalizeSnapshot);
}

function serviceInfo() {
  return {
    service: "nani-chatgpt-market-agent",
    version: "1.1.0",
    liveTrading: false,
    database: dbMode(),
    watchlist: watchlist(),
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString()
  };
}

function makeServer() {
  const server = new McpServer({
    name: "NANI Personal Market Agent",
    version: "1.1.0"
  });

  server.tool(
    "nani_market_state",
    "Get NANI's current persistent market state, recent premarket snapshots, reactions and active theses. Use this before answering current-market questions.",
    {},
    async () => {
      const [
        latest,
        snapshots,
        reactions,
        theses
      ] = await Promise.all([
        latestSnapshot(),
        recentSnapshots(5),
        recentReactions(10),
        getTheses()
      ]);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                latestSnapshot: normalizeSnapshot(latest),
                recentSnapshots: normalizeSnapshots(snapshots),
                recentReactions: reactions,
                activeTheses: theses,
                watchlist: watchlist(),
                database: dbMode(),
                liveTrading: false
              },
              null,
              2
            )
          }
        ]
      };
    }
  );

  server.tool(
    "nani_premarket_intelligence",
    "Run the full NANI premarket evidence collection. Use for 8:15-style intelligence and whenever the user asks what is happening in the market.",
    {},
    async () => {
      const packet = await premarketPacket(watchlist());

      const id = await saveSnapshot(
        "PREMARKET",
        packet
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                snapshotId: id,
                ...packet
              },
              null,
              2
            )
          }
        ]
      };
    }
  );

  server.tool(
    "nani_symbol_deep_dive",
    "Collect current quote, technical and news context for a specific ticker. Use when the user asks about a stock or challenges a thesis.",
    {
      ticker: z
        .string()
        .min(1)
        .max(10)
    },
    async ({ ticker }) => {
      const result = await deepDive(
        ticker.toUpperCase()
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              result,
              null,
              2
            )
          }
        ]
      };
    }
  );

  server.tool(
    "nani_options_context",
    "Retrieve current options-chain/snapshot context for a ticker. Use before discussing a specific option contract or selecting a defined-risk contract.",
    {
      ticker: z
        .string()
        .min(1)
        .max(10)
    },
    async ({ ticker }) => {
      const result = await optionsContext(
        ticker.toUpperCase()
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              result,
              null,
              2
            )
          }
        ]
      };
    }
  );

  server.tool(
    "nani_market_reaction",
    "Explain what changed relative to NANI's stored state. Use for 'what changed', 'why is it moving', 'is the thesis broken', and similar questions.",
    {
      ticker: z
        .string()
        .optional(),

      question: z
        .string()
        .min(1)
        .max(1000)
    },
    async ({ ticker, question }) => {
      const [
        latest,
        snapshots,
        reactions,
        theses
      ] = await Promise.all([
        latestSnapshot(),
        recentSnapshots(8),
        recentReactions(20),
        getTheses(ticker)
      ]);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                question,
                ticker: ticker?.toUpperCase() || null,
                latest: normalizeSnapshot(latest),
                recentSnapshots: normalizeSnapshots(snapshots),
                recentReactions: reactions,
                activeTheses: theses
              },
              null,
              2
            )
          }
        ]
      };
    }
  );

  server.tool(
    "nani_save_thesis",
    "Persist the user's market or trade thesis so NANI can challenge it later.",
    {
      ticker: z
        .string()
        .min(1)
        .max(10),

      thesis: z
        .string()
        .min(1)
        .max(3000),

      direction: z.enum([
        "BULLISH",
        "BEARISH",
        "NEUTRAL"
      ]),

      invalidation: z
        .string()
        .max(1000)
        .optional(),

      notes: z
        .string()
        .max(2000)
        .optional()
    },
    async ({
      ticker,
      thesis,
      direction,
      invalidation,
      notes
    }) => {
      const id = await saveThesis(
        ticker,
        thesis,
        direction,
        invalidation,
        notes
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                id,
                status: "ACTIVE",
                ticker: ticker.toUpperCase(),
                thesis,
                direction,
                invalidation,
                notes
              },
              null,
              2
            )
          }
        ]
      };
    }
  );

  server.tool(
    "nani_get_theses",
    "Retrieve active saved theses, optionally for one ticker.",
    {
      ticker: z
        .string()
        .optional()
    },
    async ({ ticker }) => {
      const theses = await getTheses(
        ticker
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              theses,
              null,
              2
            )
          }
        ]
      };
    }
  );

  server.tool(
    "nani_record_reaction",
    "Record what actually happened versus an earlier expectation so NANI can learn the market reaction history.",
    {
      ticker: z
        .string()
        .optional(),

      expected: z
        .string()
        .min(1)
        .max(2000),

      observed: z
        .string()
        .min(1)
        .max(2000),

      explanation: z
        .string()
        .max(2000)
        .optional(),

      outcome: z
        .string()
        .max(1000)
        .optional()
    },
    async ({
      ticker,
      expected,
      observed,
      explanation,
      outcome
    }) => {
      const id = await recordReaction(
        ticker,
        expected,
        observed,
        explanation,
        outcome
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                id,
                saved: true
              },
              null,
              2
            )
          }
        ]
      };
    }
  );

  server.tool(
    "nani_risk_check",
    "Apply NANI's defined-risk constraints to a proposed options idea. This does not place an order.",
    {
      premium: z
        .number()
        .positive(),

      quantity: z
        .number()
        .int()
        .positive(),

      dte: z
        .number()
        .int()
        .nonnegative(),

      spreadPct: z
        .number()
        .nonnegative()
        .optional(),

      thesis: z
        .string()
        .min(1)
        .max(2000)
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

      const total =
        premium *
        100 *
        quantity;

      const gates = [
        {
          gate: "MAX_PREMIUM",
          pass: total <= maxPremium,
          detail:
            `$${total.toFixed(2)} <= $${maxPremium}`
        },

        {
          gate: "MAX_TRADE_RISK",
          pass: total <= maxRisk,
          detail:
            `$${total.toFixed(2)} <= $${maxRisk}`
        },

        {
          gate: "DEFINED_RISK",
          pass: true,
          detail:
            "Long option only; no naked or undefined-risk execution tool exists."
        },

        {
          gate: "DTE",
          pass:
            dte >= 7 &&
            dte <= 45,
          detail:
            `${dte} DTE within 7-45 preferred range`
        },

        {
          gate: "LIQUIDITY",
          pass:
            spreadPct == null
              ? true
              : spreadPct <= 10,

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
            text: JSON.stringify(
              {
                thesis,
                totalPremiumRisk: total,
                maxPremium,
                maxTradeRisk: maxRisk,
                gates,
                overall: gates.every(
                  (gate) => gate.pass
                )
                  ? "PASS"
                  : "NO_TRADE",
                liveTrading: false
              },
              null,
              2
            )
          }
        ]
      };
    }
  );

  return server;
}

/* -------------------------------------------------------
   HEALTH
------------------------------------------------------- */

app.get(
  "/health",
  async () => {
    const database = await dbHealth();

    return {
      ok: database.ok,
      service: "nani-chatgpt-market-agent",
      liveTrading: false,
      database,
      timestamp: new Date().toISOString()
    };
  }
);

/* -------------------------------------------------------
   ROOT / DASHBOARD
------------------------------------------------------- */

app.get(
  "/",
  async (_req, reply) => {
    reply.type("text/html");

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>NANI Personal Market Agent</title>
<style>
:root {
  color-scheme: dark;
  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
}

body {
  margin: 0;
  background:
    radial-gradient(circle at top left, #18233d, #080b12 45%),
    #080b12;
  color: #f4f7fb;
}

main {
  max-width: 1200px;
  margin: auto;
  padding: 28px 18px 60px;
}

h1 {
  margin: 0;
  font-size: 34px;
}

h2 {
  margin-top: 0;
}

.subtitle {
  color: #9ba7ba;
  margin-top: 8px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit,minmax(220px,1fr));
  gap: 14px;
  margin-top: 24px;
}

.card {
  background: rgba(20,26,39,.9);
  border: 1px solid #283247;
  border-radius: 18px;
  padding: 18px;
  box-shadow: 0 15px 40px rgba(0,0,0,.22);
}

.label {
  color: #8f9bb0;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.value {
  font-size: 22px;
  font-weight: 700;
  margin-top: 8px;
}

button {
  border: 0;
  border-radius: 12px;
  padding: 12px 16px;
  font-weight: 700;
  cursor: pointer;
  background: #4f8cff;
  color: white;
}

button.secondary {
  background: #20283a;
}

pre {
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 600px;
  overflow: auto;
  color: #cbd5e1;
}

.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 22px;
}
</style>
</head>

<body>
<main>

<h1>🧠 NANI Personal Market Agent</h1>

<div class="subtitle">
Persistent market intelligence • Research only • Live trading disabled
</div>

<div class="actions">
<button onclick="loadState()">Refresh State</button>
<button onclick="runPremarket()">Run Premarket</button>
<button class="secondary" onclick="loadHealth()">Health</button>
</div>

<div id="cards" class="grid"></div>

<div class="card" style="margin-top:20px">
<h2>Persistent State</h2>
<pre id="output">Loading...</pre>
</div>

</main>

<script>
async function getJson(url, options) {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(
      response.status + " " + response.statusText
    );
  }

  return response.json();
}

function renderCards(data) {
  const cards = document.getElementById("cards");

  cards.innerHTML = "";

  const items = [
    ["Database", data.database || "unknown"],
    ["Live Trading", String(data.liveTrading)],
    ["Snapshots", String(data.recentSnapshots?.length || 0)],
    ["Reactions", String(data.recentReactions?.length || 0)],
    ["Active Theses", String(data.activeTheses?.length || 0)]
  ];

  for (const [label, value] of items) {
    const div = document.createElement("div");
    div.className = "card";

    div.innerHTML =
      '<div class="label">' +
      label +
      '</div><div class="value">' +
      value +
      '</div>';

    cards.appendChild(div);
  }
}

async function loadState() {
  const output =
    document.getElementById("output");

  output.textContent =
    "Loading NANI state...";

  try {
    const data =
      await getJson("/api/state");

    renderCards(data);

    output.textContent =
      JSON.stringify(data, null, 2);
  } catch (error) {
    output.textContent =
      String(error);
  }
}

async function runPremarket() {
  const output =
    document.getElementById("output");

  output.textContent =
    "Running premarket intelligence...";

  try {
    const data =
      await getJson("/api/premarket", {
        method: "POST"
      });

    output.textContent =
      JSON.stringify(data, null, 2);

    await loadState();
  } catch (error) {
    output.textContent =
      String(error);
  }
}

async function loadHealth() {
  const output =
    document.getElementById("output");

  try {
    const data =
      await getJson("/health");

    output.textContent =
      JSON.stringify(data, null, 2);
  } catch (error) {
    output.textContent =
      String(error);
  }
}

loadState();
</script>

</body>
</html>`;
  }
);

/* -------------------------------------------------------
   STATE API
------------------------------------------------------- */

app.get(
  "/api/state",
  async (req: any, reply) => {
    if (!authorized(req)) {
      return reply.code(401).send({
        error: "unauthorized"
      });
    }

    const [
      latest,
      snapshots,
      reactions,
      theses
    ] = await Promise.all([
      latestSnapshot(),
      recentSnapshots(10),
      recentReactions(20),
      getTheses()
    ]);

    return {
      ...serviceInfo(),
      latestSnapshot:
        normalizeSnapshot(latest),

      recentSnapshots:
        normalizeSnapshots(snapshots),

      recentReactions:
        reactions,

      activeTheses:
        theses
    };
  }
);

/* -------------------------------------------------------
   PREMARKET API
------------------------------------------------------- */

app.post(
  "/api/premarket",
  async (req: any, reply) => {
    if (!authorized(req)) {
      return reply.code(401).send({
        error: "unauthorized"
      });
    }

    const packet =
      await premarketPacket(
        watchlist()
      );

    const snapshotId =
      await saveSnapshot(
        "PREMARKET",
        packet
      );

    return {
      snapshotId,
      packet
    };
  }
);

/* -------------------------------------------------------
   DEEP DIVE API
------------------------------------------------------- */

app.get(
  "/api/deep-dive/:ticker",
  async (req: any, reply) => {
    if (!authorized(req)) {
      return reply.code(401).send({
        error: "unauthorized"
      });
    }

    const ticker =
      String(req.params.ticker || "")
        .trim()
        .toUpperCase();

    if (!ticker) {
      return reply.code(400).send({
        error: "ticker is required"
      });
    }

    return deepDive(ticker);
  }
);

/* -------------------------------------------------------
   OPTIONS CONTEXT API
------------------------------------------------------- */

app.get(
  "/api/options-context",
  async (req: any, reply) => {
    if (!authorized(req)) {
      return reply.code(401).send({
        error: "unauthorized"
      });
    }

    const ticker =
      String(req.query?.ticker || "")
        .trim()
        .toUpperCase();

    if (!ticker) {
      return reply.code(400).send({
        error: "ticker query parameter is required"
      });
    }

    return optionsContext(ticker);
  }
);

/* -------------------------------------------------------
   MCP DISCOVERY
------------------------------------------------------- */

app.get(
  "/.well-known/mcp.json",
  async () => ({
    name: "NANI Personal Market Agent",
    version: "1.1.0",
    endpoint: "/mcp",

    capabilities: [
      "market_state",
      "premarket_intelligence",
      "symbol_deep_dive",
      "options_context",
      "market_reaction",
      "thesis_memory",
      "reaction_memory",
      "risk_check"
    ],

    liveTrading: false,

    database: dbMode(),

    watchlist: watchlist()
  })
);

/* -------------------------------------------------------
   MCP
------------------------------------------------------- */

app.post(
  "/mcp",
  async (req: any, reply: any) => {
    if (!authorized(req)) {
      return reply.code(401).send({
        error: "unauthorized"
      });
    }

    const server =
      makeServer();

    const transport =
      new StreamableHTTPServerTransport({
        sessionIdGenerator:
          undefined
      });

    await server.connect(
      transport
    );

    await transport.handleRequest(
      req.raw,
      reply.raw,
      req.body
    );

    reply.hijack();
  }
);

/* -------------------------------------------------------
   ERROR HANDLING
------------------------------------------------------- */

app.setErrorHandler(
  async (error, req, reply) => {
    req.log.error(error);

    return reply
      .code((error as any).statusCode || 500)
      .send({
        error: "NANI request failed",
        message:
          process.env.NODE_ENV === "production"
            ? "Internal server error"
            : String(
                error instanceof Error
                  ? error.message
                  : error
              )
      });
  }
);

/* -------------------------------------------------------
   STARTUP / SHUTDOWN
------------------------------------------------------- */

const port =
  Number(process.env.PORT || 10000);

const host =
  process.env.HOST || "0.0.0.0";

async function start() {
  try {
    await initDb();

    app.log.info(
      `NANI database initialized using ${dbMode()}`
    );

    await app.listen({
      port,
      host
    });

    app.log.info(
      `NANI listening on ${host}:${port}`
    );
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  try {
    app.log.info(
      `${signal} received; shutting down`
    );

    await app.close();

    const {
      closeDb
    } = await import("./db.js");

    await closeDb();

    process.exit(0);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

process.once(
  "SIGTERM",
  () => shutdown("SIGTERM")
);

process.once(
  "SIGINT",
  () => shutdown("SIGINT")
);

start();
import "dotenv/config";
import Fastify from "fastify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { deepDive, optionsContext, premarketPacket } from "./analysis.js";
import { getTheses, latestSnapshot, recentReactions, recentSnapshots, recordReaction, saveSnapshot, saveThesis } from "./db.js";

const app = Fastify({ logger: true });
const token = process.env.NANI_API_TOKEN || "";

function authorized(req:any) {
  if (!token) return true;
  const h = req.headers.authorization || "";
  return h === `Bearer ${token}`;
}

function watchlist() {
  return (process.env.WATCHLIST || "SPY,QQQ,NVDA,MSFT,GOOG,AVGO,QCOM,META,CRCL,SNAP,IREN,PL,SMCI,IBM,BABA,KWEB,ZIM")
    .split(",").map(s=>s.trim().toUpperCase()).filter(Boolean);
}

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
      content: [{ type: "text", text: JSON.stringify({
        latestSnapshot: latestSnapshot(),
        recentSnapshots: recentSnapshots(5),
        recentReactions: recentReactions(10),
        activeTheses: getTheses(),
        watchlist: watchlist()
      }, null, 2) }]
    })
  );

  server.tool(
    "nani_premarket_intelligence",
    "Run the full NANI premarket evidence collection. Use for 8:15-style intelligence and whenever the user asks what is happening in the market.",
    {},
    async () => {
      const packet = await premarketPacket(watchlist());
      saveSnapshot("PREMARKET", packet);
      return { content: [{ type: "text", text: JSON.stringify(packet, null, 2) }] };
    }
  );

  server.tool(
    "nani_symbol_deep_dive",
    "Collect current quote/technical/news context for a specific ticker. Use when the user asks about a stock or challenges a thesis.",
    { ticker: z.string().min(1).max(10) },
    async ({ ticker }) => {
      const result = await deepDive(ticker.toUpperCase());
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "nani_options_context",
    "Retrieve current options-chain/snapshot context for a ticker. Use before discussing a specific option contract or selecting a defined-risk contract.",
    { ticker: z.string().min(1).max(10) },
    async ({ ticker }) => {
      const result = await optionsContext(ticker.toUpperCase());
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "nani_market_reaction",
    "Explain what changed relative to NANI's stored state. Use for 'what changed', 'why is it moving', 'is the thesis broken', and similar questions.",
    { ticker: z.string().optional(), question: z.string().min(1).max(1000) },
    async ({ ticker, question }) => ({
      content: [{ type: "text", text: JSON.stringify({
        question,
        ticker: ticker?.toUpperCase() || null,
        latest: latestSnapshot(),
        recentSnapshots: recentSnapshots(8),
        recentReactions: recentReactions(20),
        activeTheses: getTheses(ticker)
      }, null, 2) }]
    })
  );

  server.tool(
    "nani_save_thesis",
    "Persist the user's market/trade thesis so NANI can challenge it later.",
    {
      ticker: z.string().min(1).max(10),
      thesis: z.string().min(1).max(3000),
      direction: z.enum(["BULLISH","BEARISH","NEUTRAL"]),
      invalidation: z.string().max(1000).optional(),
      notes: z.string().max(2000).optional()
    },
    async ({ ticker, thesis, direction, invalidation, notes }) => ({
      content: [{ type: "text", text: JSON.stringify({
        id: saveThesis(ticker, thesis, direction, invalidation, notes),
        status: "ACTIVE",
        ticker: ticker.toUpperCase(),
        thesis,
        direction,
        invalidation,
        notes
      }, null, 2) }]
    })
  );

  server.tool(
    "nani_get_theses",
    "Retrieve active saved theses, optionally for one ticker.",
    { ticker: z.string().optional() },
    async ({ ticker }) => ({
      content: [{ type: "text", text: JSON.stringify(getTheses(ticker), null, 2) }]
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
    async ({ ticker, expected, observed, explanation, outcome }) => ({
      content: [{ type: "text", text: JSON.stringify({
        id: recordReaction(ticker, expected, observed, explanation, outcome),
        saved: true
      }, null, 2) }]
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
    async ({ premium, quantity, dte, spreadPct, thesis }) => {
      const maxPremium = Number(process.env.MAX_PREMIUM_USD || 500);
      const maxRisk = Number(process.env.MAX_TRADE_RISK_USD || 200);
      const total = premium * 100 * quantity;
      const gates = [
        { gate: "MAX_PREMIUM", pass: total <= maxPremium, detail: `$${total.toFixed(2)} <= $${maxPremium}` },
        { gate: "MAX_TRADE_RISK", pass: total <= maxRisk, detail: `$${total.toFixed(2)} <= $${maxRisk}` },
        { gate: "DEFINED_RISK", pass: true, detail: "Long option only; no naked/undefined-risk execution tool exists." },
        { gate: "DTE", pass: dte >= 7 && dte <= 45, detail: `${dte} DTE within 7-45 preferred range` },
        { gate: "LIQUIDITY", pass: spreadPct == null ? true : spreadPct <= 10, detail: spreadPct == null ? "Not supplied" : `${spreadPct}% spread` }
      ];
      return { content: [{ type: "text", text: JSON.stringify({ thesis, totalPremiumRisk: total, gates, overall: gates.every(g=>g.pass) ? "PASS" : "NO_TRADE" }, null, 2) }] };
    }
  );

  return server;
}

app.get("/health", async () => ({ ok: true, service: "nani-chatgpt-market-agent", liveTrading: false }));
app.get("/.well-known/mcp.json", async () => ({
  name: "NANI Personal Market Agent",
  version: "1.0.0",
  endpoint: "/mcp",
  capabilities: ["market_state","premarket_intelligence","symbol_deep_dive","options_context","market_reaction","thesis_memory","risk_check"],
  liveTrading: false
}));

app.post("/mcp", async (req:any, reply:any) => {
  if (!authorized(req)) return reply.code(401).send({ error: "unauthorized" });
  const server = makeServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req.raw, reply.raw, req.body);
  reply.hijack();
});

const port = Number(process.env.PORT || 8088);
const host = process.env.HOST || "0.0.0.0";
app.listen({ port, host }).then(()=>console.log(`NANI listening on ${host}:${port}`)).catch(err=>{console.error(err);process.exit(1)});

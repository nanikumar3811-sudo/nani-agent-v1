import { stockSnapshot, stockBars, news, marketNews, optionChain } from "./providers.js";

function n(x: any): number | null {
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}

export function quoteMetrics(snapshot: any) {
  const latest = snapshot?.latestTrade?.p ?? snapshot?.latestTrade?.price;
  const prev = snapshot?.prevDailyBar?.c;
  const open = snapshot?.dailyBar?.o;
  const high = snapshot?.dailyBar?.h;
  const low = snapshot?.dailyBar?.l;
  const volume = snapshot?.dailyBar?.v;
  const prevVol = snapshot?.prevDailyBar?.v;
  return {
    price: n(latest),
    prevClose: n(prev),
    open: n(open),
    high: n(high),
    low: n(low),
    volume: n(volume),
    volumeRatio: n(volume) && n(prevVol) ? Number((Number(volume)/Number(prevVol)).toFixed(2)) : null,
    gapPct: n(open) && n(prev) ? Number((((Number(open)/Number(prev))-1)*100).toFixed(2)) : null
  };
}

export async function deepDive(symbol: string) {
  const [snapshot, bars, headlines] = await Promise.all([
    stockSnapshot(symbol),
    stockBars(symbol, "1Day", 60),
    news(symbol, 3)
  ]);
  const m = quoteMetrics(snapshot);
  const barList = bars?.bars || [];
  const closes = barList.map((b:any)=>Number(b.c)).filter(Number.isFinite);
  const avg20 = closes.length ? closes.slice(-20).reduce((a:number,b:number)=>a+b,0)/Math.min(20,closes.length) : null;
  const last = closes.at(-1) ?? null;
  const trend = last == null || avg20 == null ? "UNKNOWN" : last > avg20 ? "ABOVE_20D_AVG" : "BELOW_20D_AVG";
  return {
    symbol,
    asOf: new Date().toISOString(),
    marketData: m,
    technicalContext: { trendVs20DayAverage: trend, barsReturned: barList.length },
    headlines: Array.isArray(headlines) ? headlines.slice(0,12) : headlines,
    dataQuality: process.env.ALPACA_API_KEY ? "LIVE_PROVIDER_ATTEMPTED" : "UNCONFIGURED"
  };
}

export async function premarketPacket(watchlist: string[]) {
  const rows:any[] = [];
  for (const symbol of watchlist) {
    try {
      const snap = await stockSnapshot(symbol);
      rows.push({ symbol, ...quoteMetrics(snap) });
    } catch (e:any) {
      rows.push({ symbol, error: String(e.message || e) });
    }
  }
  const generalNews = await marketNews(1);
  return {
    asOf: new Date().toISOString(),
    watchlist: rows,
    generalNews: Array.isArray(generalNews) ? generalNews.slice(0,30) : generalNews,
    limitations: [
      "This packet is evidence for the ChatGPT reasoning layer, not a standalone trading signal.",
      "True institutional/whale classification requires a provider with trade-level options classification.",
      "Missing or stale provider data must be treated as unknown, not zero."
    ]
  };
}

export async function optionsContext(symbol: string) {
  const chain = await optionChain(symbol);
  return {
    symbol,
    asOf: new Date().toISOString(),
    chain,
    interpretationRules: [
      "Do not call raw volume/OI a whale flow signal.",
      "Prefer liquid contracts with narrow spreads.",
      "Defined-risk long calls/puts only.",
      "Compare IV with expected move and event risk before selecting a contract."
    ]
  };
}

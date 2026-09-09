const alpacaHeaders = () => ({
  "APCA-API-KEY-ID": process.env.ALPACA_API_KEY || "",
  "APCA-API-SECRET-KEY": process.env.ALPACA_API_SECRET || ""
});

async function getJson(url: string, headers: Record<string,string> = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const r = await fetch(url, { headers, signal: controller.signal });
    const text = await r.text();
    if (!r.ok) throw new Error(`${r.status} ${text.slice(0,300)}`);
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(timer);
  }
}

export async function stockSnapshot(symbol: string) {
  const base = process.env.ALPACA_DATA_BASE_URL || "https://data.alpaca.markets";
  if (!process.env.ALPACA_API_KEY) return { symbol, status: "UNCONFIGURED" };
  return getJson(`${base}/v2/stocks/${encodeURIComponent(symbol)}/snapshot`, alpacaHeaders());
}

export async function stockBars(symbol: string, timeframe = "1Day", limit = 60) {
  const base = process.env.ALPACA_DATA_BASE_URL || "https://data.alpaca.markets";
  if (!process.env.ALPACA_API_KEY) return { symbol, status: "UNCONFIGURED" };
  return getJson(`${base}/v2/stocks/${encodeURIComponent(symbol)}/bars?timeframe=${timeframe}&limit=${limit}&feed=iex`, alpacaHeaders());
}

export async function optionChain(symbol: string) {
  const base = process.env.ALPACA_DATA_BASE_URL || "https://data.alpaca.markets";
  if (!process.env.ALPACA_API_KEY) return { symbol, status: "UNCONFIGURED" };
  const url = `${base}/v1beta1/options/snapshots/${encodeURIComponent(symbol)}?feed=indicative&limit=1000`;
  return getJson(url, alpacaHeaders());
}

export async function news(symbol: string, days = 3) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return { symbol, status: "UNCONFIGURED" };
  const to = new Date();
  const from = new Date(Date.now() - days * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0,10);
  return getJson(`https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${iso(from)}&to=${iso(to)}&token=${encodeURIComponent(key)}`);
}

export async function marketNews(days = 1) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return { status: "UNCONFIGURED" };
  const to = new Date();
  const from = new Date(Date.now() - days * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0,10);
  return getJson(`https://finnhub.io/api/v1/news?category=general&from=${iso(from)}&to=${iso(to)}&token=${encodeURIComponent(key)}`);
}

import pg from 'pg';
const { Pool } = pg;
const symbols = ['SPY','QQQ','IWM','DIA','VIX','NVDA','AAPL','META','MSFT','AMD','TSLA','ORCL','AVGO'];
if (!process.env.DATABASE_URL) { console.log('DATABASE_URL not configured; demo provider is deterministic and needs no seed.'); process.exit(0); }
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
for (const symbol of symbols) await pool.query('INSERT INTO symbols(symbol,name,asset_class) VALUES($1,$1,$2) ON CONFLICT(symbol) DO NOTHING',[symbol,'MARKET']);
await pool.end();
console.log('Seed complete.');

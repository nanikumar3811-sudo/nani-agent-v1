import Database from "better-sqlite3";

const db = new Database(process.env.NANI_DB || "nani.db");
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS market_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS theses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  ticker TEXT NOT NULL,
  thesis TEXT NOT NULL,
  direction TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  invalidation TEXT,
  notes TEXT
);
CREATE TABLE IF NOT EXISTS reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  ticker TEXT,
  expected TEXT NOT NULL,
  observed TEXT NOT NULL,
  explanation TEXT,
  outcome TEXT
);
`);

export function saveSnapshot(kind: string, payload: unknown) {
  const stmt = db.prepare("INSERT INTO market_snapshots(created_at,kind,payload) VALUES(?,?,?)");
  stmt.run(new Date().toISOString(), kind, JSON.stringify(payload));
}

export function latestSnapshot(kind?: string) {
  if (kind) {
    return db.prepare("SELECT * FROM market_snapshots WHERE kind=? ORDER BY id DESC LIMIT 1").get(kind) as any;
  }
  return db.prepare("SELECT * FROM market_snapshots ORDER BY id DESC LIMIT 1").get() as any;
}

export function recentSnapshots(limit = 10) {
  return db.prepare("SELECT * FROM market_snapshots ORDER BY id DESC LIMIT ?").all(limit) as any[];
}

export function saveThesis(ticker: string, thesis: string, direction: string, invalidation?: string, notes?: string) {
  return db.prepare(`
    INSERT INTO theses(created_at,ticker,thesis,direction,invalidation,notes)
    VALUES(?,?,?,?,?,?)
  `).run(new Date().toISOString(), ticker.toUpperCase(), thesis, direction, invalidation ?? null, notes ?? null).lastInsertRowid;
}

export function getTheses(ticker?: string) {
  if (ticker) return db.prepare("SELECT * FROM theses WHERE ticker=? AND status='ACTIVE' ORDER BY id DESC").all(ticker.toUpperCase());
  return db.prepare("SELECT * FROM theses WHERE status='ACTIVE' ORDER BY id DESC").all();
}

export function recordReaction(ticker: string | undefined, expected: string, observed: string, explanation?: string, outcome?: string) {
  return db.prepare(`
    INSERT INTO reactions(created_at,ticker,expected,observed,explanation,outcome)
    VALUES(?,?,?,?,?,?)
  `).run(new Date().toISOString(), ticker?.toUpperCase() ?? null, expected, observed, explanation ?? null, outcome ?? null).lastInsertRowid;
}

export function recentReactions(limit = 20) {
  return db.prepare("SELECT * FROM reactions ORDER BY id DESC LIMIT ?").all(limit);
}

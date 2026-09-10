import "dotenv/config";
import Database from "better-sqlite3";
import { Pool, type QueryResultRow } from "pg";

type DbMode = "postgres" | "sqlite";

const databaseUrl = process.env.DATABASE_URL?.trim();

const mode: DbMode = databaseUrl ? "postgres" : "sqlite";

let sqlite: Database.Database | null = null;
let pool: Pool | null = null;

if (mode === "postgres") {
  const requiresTls = /sslmode=require/i.test(databaseUrl || "");

  pool = new Pool({
    connectionString: databaseUrl,
    max: Number(process.env.DB_POOL_MAX || 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: requiresTls
      ? {
          rejectUnauthorized: false
        }
      : undefined
  });
} else {
  sqlite = new Database(process.env.NANI_DB || "nani.db");
  sqlite.pragma("journal_mode = WAL");

  sqlite.exec(`
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
}

async function pgQuery<T extends QueryResultRow = any>(
  text: string,
  values: unknown[] = []
) {
  if (!pool) {
    throw new Error("PostgreSQL pool is not initialized");
  }

  return pool.query<T>(text, values);
}

export async function initDb() {
  if (mode === "sqlite") {
    return {
      mode,
      ok: true
    };
  }

  await pgQuery(`
    CREATE TABLE IF NOT EXISTS market_snapshots (
      id SERIAL PRIMARY KEY,
      created_at TEXT NOT NULL,
      kind TEXT NOT NULL,
      payload JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS theses (
      id SERIAL PRIMARY KEY,
      created_at TEXT NOT NULL,
      ticker TEXT NOT NULL,
      thesis TEXT NOT NULL,
      direction TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      invalidation TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS reactions (
      id SERIAL PRIMARY KEY,
      created_at TEXT NOT NULL,
      ticker TEXT,
      expected TEXT NOT NULL,
      observed TEXT NOT NULL,
      explanation TEXT,
      outcome TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_market_snapshots_created
      ON market_snapshots(id DESC);

    CREATE INDEX IF NOT EXISTS idx_market_snapshots_kind
      ON market_snapshots(kind, id DESC);

    CREATE INDEX IF NOT EXISTS idx_theses_ticker_status
      ON theses(ticker, status, id DESC);

    CREATE INDEX IF NOT EXISTS idx_reactions_ticker
      ON reactions(ticker, id DESC);
  `);

  return {
    mode,
    ok: true
  };
}

export async function dbHealth() {
  if (mode === "sqlite") {
    return {
      ok: true,
      mode: "sqlite"
    };
  }

  try {
    await pgQuery("SELECT 1 AS ok");

    return {
      ok: true,
      mode: "postgres"
    };
  } catch (error: any) {
    return {
      ok: false,
      mode: "postgres",
      error: String(error?.message || error)
    };
  }
}

export function dbMode() {
  return mode;
}

export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
  }

  if (sqlite) {
    sqlite.close();
    sqlite = null;
  }
}

export async function saveSnapshot(kind: string, payload: unknown) {
  const createdAt = new Date().toISOString();

  if (mode === "postgres") {
    const result = await pgQuery<{ id: number }>(
      `
        INSERT INTO market_snapshots(created_at, kind, payload)
        VALUES($1, $2, $3::jsonb)
        RETURNING id
      `,
      [
        createdAt,
        kind,
        JSON.stringify(payload)
      ]
    );

    return result.rows[0]?.id;
  }

  const stmt = sqlite!.prepare(`
    INSERT INTO market_snapshots(created_at, kind, payload)
    VALUES(?, ?, ?)
  `);

  const result = stmt.run(
    createdAt,
    kind,
    JSON.stringify(payload)
  );

  return result.lastInsertRowid;
}

export async function latestSnapshot(kind?: string) {
  if (mode === "postgres") {
    if (kind) {
      const result = await pgQuery(
        `
          SELECT
            id,
            created_at,
            kind,
            payload::text AS payload
          FROM market_snapshots
          WHERE kind = $1
          ORDER BY id DESC
          LIMIT 1
        `,
        [kind]
      );

      return result.rows[0] ?? null;
    }

    const result = await pgQuery(`
      SELECT
        id,
        created_at,
        kind,
        payload::text AS payload
      FROM market_snapshots
      ORDER BY id DESC
      LIMIT 1
    `);

    return result.rows[0] ?? null;
  }

  if (kind) {
    return (
      sqlite!
        .prepare(`
          SELECT *
          FROM market_snapshots
          WHERE kind = ?
          ORDER BY id DESC
          LIMIT 1
        `)
        .get(kind) ?? null
    );
  }

  return (
    sqlite!
      .prepare(`
        SELECT *
        FROM market_snapshots
        ORDER BY id DESC
        LIMIT 1
      `)
      .get() ?? null
  );
}

export async function recentSnapshots(limit = 10) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 100));

  if (mode === "postgres") {
    const result = await pgQuery(
      `
        SELECT
          id,
          created_at,
          kind,
          payload::text AS payload
        FROM market_snapshots
        ORDER BY id DESC
        LIMIT $1
      `,
      [safeLimit]
    );

    return result.rows;
  }

  return sqlite!
    .prepare(`
      SELECT *
      FROM market_snapshots
      ORDER BY id DESC
      LIMIT ?
    `)
    .all(safeLimit);
}

export async function saveThesis(
  ticker: string,
  thesis: string,
  direction: string,
  invalidation?: string,
  notes?: string
) {
  const createdAt = new Date().toISOString();
  const normalizedTicker = ticker.toUpperCase();

  if (mode === "postgres") {
    const result = await pgQuery<{ id: number }>(
      `
        INSERT INTO theses(
          created_at,
          ticker,
          thesis,
          direction,
          invalidation,
          notes
        )
        VALUES($1, $2, $3, $4, $5, $6)
        RETURNING id
      `,
      [
        createdAt,
        normalizedTicker,
        thesis,
        direction,
        invalidation ?? null,
        notes ?? null
      ]
    );

    return result.rows[0]?.id;
  }

  return sqlite!
    .prepare(`
      INSERT INTO theses(
        created_at,
        ticker,
        thesis,
        direction,
        invalidation,
        notes
      )
      VALUES(?, ?, ?, ?, ?, ?)
    `)
    .run(
      createdAt,
      normalizedTicker,
      thesis,
      direction,
      invalidation ?? null,
      notes ?? null
    ).lastInsertRowid;
}

export async function getTheses(ticker?: string) {
  if (mode === "postgres") {
    if (ticker) {
      const result = await pgQuery(
        `
          SELECT *
          FROM theses
          WHERE ticker = $1
            AND status = 'ACTIVE'
          ORDER BY id DESC
        `,
        [ticker.toUpperCase()]
      );

      return result.rows;
    }

    const result = await pgQuery(`
      SELECT *
      FROM theses
      WHERE status = 'ACTIVE'
      ORDER BY id DESC
    `);

    return result.rows;
  }

  if (ticker) {
    return sqlite!
      .prepare(`
        SELECT *
        FROM theses
        WHERE ticker = ?
          AND status = 'ACTIVE'
        ORDER BY id DESC
      `)
      .all(ticker.toUpperCase());
  }

  return sqlite!
    .prepare(`
      SELECT *
      FROM theses
      WHERE status = 'ACTIVE'
      ORDER BY id DESC
    `)
    .all();
}

export async function recordReaction(
  ticker: string | undefined,
  expected: string,
  observed: string,
  explanation?: string,
  outcome?: string
) {
  const createdAt = new Date().toISOString();
  const normalizedTicker = ticker?.toUpperCase() ?? null;

  if (mode === "postgres") {
    const result = await pgQuery<{ id: number }>(
      `
        INSERT INTO reactions(
          created_at,
          ticker,
          expected,
          observed,
          explanation,
          outcome
        )
        VALUES($1, $2, $3, $4, $5, $6)
        RETURNING id
      `,
      [
        createdAt,
        normalizedTicker,
        expected,
        observed,
        explanation ?? null,
        outcome ?? null
      ]
    );

    return result.rows[0]?.id;
  }

  return sqlite!
    .prepare(`
      INSERT INTO reactions(
        created_at,
        ticker,
        expected,
        observed,
        explanation,
        outcome
      )
      VALUES(?, ?, ?, ?, ?, ?)
    `)
    .run(
      createdAt,
      normalizedTicker,
      expected,
      observed,
      explanation ?? null,
      outcome ?? null
    ).lastInsertRowid;
}

export async function recentReactions(limit = 20) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));

  if (mode === "postgres") {
    const result = await pgQuery(
      `
        SELECT *
        FROM reactions
        ORDER BY id DESC
        LIMIT $1
      `,
      [safeLimit]
    );

    return result.rows;
  }

  return sqlite!
    .prepare(`
      SELECT *
      FROM reactions
      ORDER BY id DESC
      LIMIT ?
    `)
    .all(safeLimit);
}
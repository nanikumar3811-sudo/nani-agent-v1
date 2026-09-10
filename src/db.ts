import pg from "pg";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required. NANI production persistence uses Render PostgreSQL."
  );
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl:
    process.env.DATABASE_SSL === "true"
      ? { rejectUnauthorized: false }
      : undefined,
  max: Number(process.env.DB_POOL_MAX || 5),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
});

let initialized = false;

export async function initDb() {
  if (initialized) {
    return;
  }

  await pool.query(`
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

    CREATE INDEX IF NOT EXISTS idx_market_snapshots_kind_id
      ON market_snapshots(kind, id DESC);

    CREATE INDEX IF NOT EXISTS idx_theses_ticker_status_id
      ON theses(ticker, status, id DESC);

    CREATE INDEX IF NOT EXISTS idx_reactions_ticker_id
      ON reactions(ticker, id DESC);
  `);

  initialized = true;
}

export function dbMode() {
  return "postgres";
}

export async function dbHealth() {
  try {
    const result = await pool.query(
      "SELECT NOW() AS server_time"
    );

    return {
      ok: true,
      mode: "postgres",
      serverTime: result.rows[0]?.server_time ?? null
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    return {
      ok: false,
      mode: "postgres",
      error: message
    };
  }
}

export async function saveSnapshot(
  kind: string,
  payload: unknown
) {
  const result = await pool.query(
    `
      INSERT INTO market_snapshots(
        created_at,
        kind,
        payload
      )
      VALUES($1, $2, $3::jsonb)
      RETURNING id
    `,
    [
      new Date().toISOString(),
      kind,
      JSON.stringify(payload)
    ]
  );

  return Number(result.rows[0].id);
}

export async function latestSnapshot(
  kind?: string
) {
  if (kind) {
    const result = await pool.query(
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

  const result = await pool.query(`
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

export async function recentSnapshots(
  limit = 10
) {
  const safeLimit = Math.max(
    1,
    Math.min(100, Math.floor(limit))
  );

  const result = await pool.query(
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

export async function saveThesis(
  ticker: string,
  thesis: string,
  direction: string,
  invalidation?: string,
  notes?: string
) {
  const result = await pool.query(
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
      new Date().toISOString(),
      ticker.toUpperCase(),
      thesis,
      direction,
      invalidation ?? null,
      notes ?? null
    ]
  );

  return Number(result.rows[0].id);
}

export async function getTheses(
  ticker?: string
) {
  if (ticker) {
    const result = await pool.query(
      `
        SELECT
          id,
          created_at,
          ticker,
          thesis,
          direction,
          status,
          invalidation,
          notes
        FROM theses
        WHERE ticker = $1
          AND status = 'ACTIVE'
        ORDER BY id DESC
      `,
      [ticker.toUpperCase()]
    );

    return result.rows;
  }

  const result = await pool.query(`
    SELECT
      id,
      created_at,
      ticker,
      thesis,
      direction,
      status,
      invalidation,
      notes
    FROM theses
    WHERE status = 'ACTIVE'
    ORDER BY id DESC
  `);

  return result.rows;
}

export async function recordReaction(
  ticker: string | undefined,
  expected: string,
  observed: string,
  explanation?: string,
  outcome?: string
) {
  const result = await pool.query(
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
      new Date().toISOString(),
      ticker?.toUpperCase() ?? null,
      expected,
      observed,
      explanation ?? null,
      outcome ?? null
    ]
  );

  return Number(result.rows[0].id);
}

export async function recentReactions(
  limit = 20
) {
  const safeLimit = Math.max(
    1,
    Math.min(100, Math.floor(limit))
  );

  const result = await pool.query(
    `
      SELECT
        id,
        created_at,
        ticker,
        expected,
        observed,
        explanation,
        outcome
      FROM reactions
      ORDER BY id DESC
      LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows;
}

export async function closeDb() {
  await pool.end();
  initialized = false;
}
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
const { Pool } = pg;
const url = process.env.DATABASE_URL;
if (!url) { console.log('DATABASE_URL not configured; demo mode does not require migrations.'); process.exit(0); }
const pool = new Pool({ connectionString: url, max: 2 });
const file = path.resolve('db/migrations/001_foundation.sql');
await pool.query(await fs.readFile(file, 'utf8'));
await pool.end();
console.log('Database migration complete.');

import pg from 'pg'; const {Pool}=pg; let pool:pg.Pool|undefined;
function db(){if(!pool){if(!process.env.DATABASE_URL) throw Error('DATABASE_URL is required'); pool=new Pool({connectionString:process.env.DATABASE_URL,max:5});}return pool;}
export async function initDb(){await db().query(`CREATE TABLE IF NOT EXISTS nani_memory(id BIGSERIAL PRIMARY KEY,created_at TIMESTAMPTZ DEFAULT now(),kind TEXT NOT NULL,content TEXT NOT NULL,payload JSONB); CREATE TABLE IF NOT EXISTS nani_states(id BIGSERIAL PRIMARY KEY,created_at TIMESTAMPTZ DEFAULT now(),payload JSONB NOT NULL);`)}
export async function saveState(x:unknown){await db().query('INSERT INTO nani_states(payload) VALUES($1)',[JSON.stringify(x)])}
export async function latestState(){const r=await db().query('SELECT payload,created_at FROM nani_states ORDER BY created_at DESC LIMIT 1');return r.rows[0]?{...r.rows[0].payload,storedAt:r.rows[0].created_at}:null}
export async function memory(kind:string,content:string,payload?:unknown){return (await db().query('INSERT INTO nani_memory(kind,content,payload) VALUES($1,$2,$3) RETURNING *',[kind,content,payload?JSON.stringify(payload):null])).rows[0]}
export async function recentMemory(){return (await db().query('SELECT * FROM nani_memory ORDER BY created_at DESC LIMIT 50')).rows}
export async function health(){try{await db().query('select 1');return true}catch{return false}}
export async function closeDb(){await pool?.end()}

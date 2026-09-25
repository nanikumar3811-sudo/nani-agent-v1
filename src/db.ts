import pg from 'pg'; const {Pool}=pg; let pool:pg.Pool|undefined;
function db(){if(!pool){if(!process.env.DATABASE_URL) throw Error('DATABASE_URL is required'); pool=new Pool({connectionString:process.env.DATABASE_URL,max:5});}return pool;}
export async function initDb(){await db().query(`
CREATE TABLE IF NOT EXISTS nani_memory(id BIGSERIAL PRIMARY KEY,created_at TIMESTAMPTZ DEFAULT now(),kind TEXT NOT NULL,content TEXT NOT NULL,payload JSONB);
CREATE TABLE IF NOT EXISTS nani_states(id BIGSERIAL PRIMARY KEY,created_at TIMESTAMPTZ DEFAULT now(),payload JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS nani_evidence(id BIGSERIAL PRIMARY KEY,created_at TIMESTAMPTZ DEFAULT now(),subject TEXT NOT NULL,kind TEXT NOT NULL,field TEXT NOT NULL,value JSONB,source_url TEXT NOT NULL,source_name TEXT NOT NULL,quality TEXT NOT NULL,observed_at TIMESTAMPTZ NOT NULL,verified_at TIMESTAMPTZ NOT NULL,expires_at TIMESTAMPTZ);
CREATE INDEX IF NOT EXISTS nani_evidence_subject_idx ON nani_evidence(subject,verified_at DESC);
CREATE TABLE IF NOT EXISTS nani_living_state(id BIGSERIAL PRIMARY KEY,created_at TIMESTAMPTZ DEFAULT now(),subject TEXT NOT NULL,kind TEXT NOT NULL,decision TEXT NOT NULL,payload JSONB NOT NULL);
CREATE INDEX IF NOT EXISTS nani_living_state_subject_idx ON nani_living_state(subject,created_at DESC);
CREATE TABLE IF NOT EXISTS nani_alert_ledger(id BIGSERIAL PRIMARY KEY,created_at TIMESTAMPTZ DEFAULT now(),subject TEXT NOT NULL,fingerprint TEXT NOT NULL UNIQUE,payload JSONB NOT NULL);
`)}
export async function saveState(x:unknown){await db().query('INSERT INTO nani_states(payload) VALUES($1)',[JSON.stringify(x)])}
export async function latestState(){const r=await db().query('SELECT payload,created_at FROM nani_states ORDER BY created_at DESC LIMIT 1');return r.rows[0]?{...r.rows[0].payload,storedAt:r.rows[0].created_at}:null}
export async function memory(kind:string,content:string,payload?:unknown){return (await db().query('INSERT INTO nani_memory(kind,content,payload) VALUES($1,$2,$3) RETURNING *',[kind,content,payload?JSON.stringify(payload):null])).rows[0]}
export async function recentMemory(){return (await db().query('SELECT * FROM nani_memory ORDER BY created_at DESC LIMIT 50')).rows}
export async function saveEvidence(x:any){return (await db().query('INSERT INTO nani_evidence(subject,kind,field,value,source_url,source_name,quality,observed_at,verified_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[x.subject,x.kind,x.field,JSON.stringify(x.value),x.sourceUrl,x.sourceName,x.quality,x.observedAt,x.verifiedAt,x.expiresAt||null])).rows[0]}
export async function evidenceFor(subject:string,limit=100){return (await db().query('SELECT * FROM nani_evidence WHERE subject=$1 ORDER BY verified_at DESC LIMIT $2',[subject,limit])).rows}
export async function latestLivingState(subject:string){const r=await db().query('SELECT payload,decision,created_at FROM nani_living_state WHERE subject=$1 ORDER BY created_at DESC LIMIT 1',[subject]);return r.rows[0]?{...r.rows[0].payload,decision:r.rows[0].decision,storedAt:r.rows[0].created_at}:null}
export async function saveLivingState(x:any){return (await db().query('INSERT INTO nani_living_state(subject,kind,decision,payload) VALUES($1,$2,$3,$4) RETURNING id,created_at',[x.subject,x.kind,x.decision,JSON.stringify(x)])).rows[0]}
export async function livingStates(){const r=await db().query('SELECT DISTINCT ON (subject) subject,kind,decision,payload,created_at FROM nani_living_state ORDER BY subject,created_at DESC');return r.rows.map((x:any)=>({...x.payload,storedAt:x.created_at}))}
export async function recordAlert(subject:string,fingerprint:string,payload:unknown){try{return (await db().query('INSERT INTO nani_alert_ledger(subject,fingerprint,payload) VALUES($1,$2,$3) RETURNING id,created_at',[subject,fingerprint,JSON.stringify(payload)])).rows[0]}catch(e:any){if(e?.code==='23505')return null;throw e}}
export async function health(){try{await db().query('select 1');return true}catch{return false}}
export async function closeDb(){await pool?.end()}

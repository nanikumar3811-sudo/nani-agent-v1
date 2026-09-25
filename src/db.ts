import pg from 'pg'; const {Pool}=pg; let pool:pg.Pool|undefined;

const testMemory = process.env.NODE_ENV === 'test' && !process.env.DATABASE_URL;
const mem = {
  memory: [] as any[],
  states: [] as any[],
  evidence: [] as any[],
  living: [] as any[],
  alerts: new Map<string, any>(),
};
let seq = 1;

function db(){if(!pool){if(!process.env.DATABASE_URL) throw Error('DATABASE_URL is required'); pool=new Pool({connectionString:process.env.DATABASE_URL,max:5});}return pool;}

export async function initDb(){
  if(testMemory) return;
  await db().query(`
CREATE TABLE IF NOT EXISTS nani_memory(id BIGSERIAL PRIMARY KEY,created_at TIMESTAMPTZ DEFAULT now(),kind TEXT NOT NULL,content TEXT NOT NULL,payload JSONB);
CREATE TABLE IF NOT EXISTS nani_states(id BIGSERIAL PRIMARY KEY,created_at TIMESTAMPTZ DEFAULT now(),payload JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS nani_evidence(id BIGSERIAL PRIMARY KEY,created_at TIMESTAMPTZ DEFAULT now(),subject TEXT NOT NULL,kind TEXT NOT NULL,field TEXT NOT NULL,value JSONB,source_url TEXT NOT NULL,source_name TEXT NOT NULL,quality TEXT NOT NULL,observed_at TIMESTAMPTZ NOT NULL,verified_at TIMESTAMPTZ NOT NULL,expires_at TIMESTAMPTZ);
CREATE INDEX IF NOT EXISTS nani_evidence_subject_idx ON nani_evidence(subject,verified_at DESC);
CREATE TABLE IF NOT EXISTS nani_living_state(id BIGSERIAL PRIMARY KEY,created_at TIMESTAMPTZ DEFAULT now(),subject TEXT NOT NULL,kind TEXT NOT NULL,decision TEXT NOT NULL,payload JSONB NOT NULL);
CREATE INDEX IF NOT EXISTS nani_living_state_subject_idx ON nani_living_state(subject,created_at DESC);
CREATE TABLE IF NOT EXISTS nani_alert_ledger(id BIGSERIAL PRIMARY KEY,created_at TIMESTAMPTZ DEFAULT now(),subject TEXT NOT NULL,fingerprint TEXT NOT NULL UNIQUE,payload JSONB NOT NULL);
`)}

export async function saveState(x:unknown){
  if(testMemory){const row={id:seq++,created_at:new Date().toISOString(),payload:x};mem.states.push(row);return row;}
  await db().query('INSERT INTO nani_states(payload) VALUES($1)',[JSON.stringify(x)])
}
export async function latestState(){
  if(testMemory){const r=mem.states.at(-1);return r?{...r.payload,storedAt:r.created_at}:null;}
  const r=await db().query('SELECT payload,created_at FROM nani_states ORDER BY created_at DESC LIMIT 1');return r.rows[0]?{...r.rows[0].payload,storedAt:r.rows[0].created_at}:null
}
export async function memory(kind:string,content:string,payload?:unknown){
  if(testMemory){const row={id:seq++,created_at:new Date().toISOString(),kind,content,payload:payload??null};mem.memory.push(row);return row;}
  return (await db().query('INSERT INTO nani_memory(kind,content,payload) VALUES($1,$2,$3) RETURNING *',[kind,content,payload?JSON.stringify(payload):null])).rows[0]
}
export async function recentMemory(){
  if(testMemory)return [...mem.memory].reverse().slice(0,50);
  return (await db().query('SELECT * FROM nani_memory ORDER BY created_at DESC LIMIT 50')).rows
}
export async function saveEvidence(x:any){
  if(testMemory){const row={id:seq++,created_at:new Date().toISOString(),subject:x.subject,kind:x.kind,field:x.field,value:x.value,source_url:x.sourceUrl,source_name:x.sourceName,quality:x.quality,observed_at:x.observedAt,verified_at:x.verifiedAt,expires_at:x.expiresAt||null};mem.evidence.push(row);return row;}
  return (await db().query('INSERT INTO nani_evidence(subject,kind,field,value,source_url,source_name,quality,observed_at,verified_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[x.subject,x.kind,x.field,JSON.stringify(x.value),x.sourceUrl,x.sourceName,x.quality,x.observedAt,x.verifiedAt,x.expiresAt||null])).rows[0]
}
export async function evidenceFor(subject:string,limit=100){
  if(testMemory)return mem.evidence.filter(x=>x.subject===subject).sort((a,b)=>String(b.verified_at).localeCompare(String(a.verified_at))).slice(0,limit);
  return (await db().query('SELECT * FROM nani_evidence WHERE subject=$1 ORDER BY verified_at DESC LIMIT $2',[subject,limit])).rows
}
export async function latestLivingState(subject:string){
  if(testMemory){const rows=mem.living.filter(x=>x.subject===subject);const r=rows.at(-1);return r?{...r.payload,decision:r.decision,storedAt:r.created_at}:null;}
  const r=await db().query('SELECT payload,decision,created_at FROM nani_living_state WHERE subject=$1 ORDER BY created_at DESC LIMIT 1',[subject]);return r.rows[0]?{...r.rows[0].payload,decision:r.rows[0].decision,storedAt:r.rows[0].created_at}:null
}
export async function saveLivingState(x:any){
  if(testMemory){const row={id:seq++,created_at:new Date().toISOString(),subject:x.subject,kind:x.kind,decision:x.decision,payload:x};mem.living.push(row);return {id:row.id,created_at:row.created_at};}
  return (await db().query('INSERT INTO nani_living_state(subject,kind,decision,payload) VALUES($1,$2,$3,$4) RETURNING id,created_at',[x.subject,x.kind,x.decision,JSON.stringify(x)])).rows[0]
}
export async function livingStates(){
  if(testMemory){const latest=new Map<string,any>();for(const x of mem.living)latest.set(x.subject,{...x.payload,storedAt:x.created_at});return [...latest.values()];}
  const r=await db().query('SELECT DISTINCT ON (subject) subject,kind,decision,payload,created_at FROM nani_living_state ORDER BY subject,created_at DESC');return r.rows.map((x:any)=>({...x.payload,storedAt:x.created_at}))
}
export async function recordAlert(subject:string,fingerprint:string,payload:unknown){
  if(testMemory){if(mem.alerts.has(fingerprint))return null;const row={id:seq++,created_at:new Date().toISOString(),subject,fingerprint,payload};mem.alerts.set(fingerprint,row);return {id:row.id,created_at:row.created_at};}
  try{return (await db().query('INSERT INTO nani_alert_ledger(subject,fingerprint,payload) VALUES($1,$2,$3) RETURNING id,created_at',[subject,fingerprint,JSON.stringify(payload)])).rows[0]}catch(e:any){if(e?.code==='23505')return null;throw e}
}
export async function health(){if(testMemory)return true;try{await db().query('select 1');return true}catch{return false}}
export async function closeDb(){await pool?.end()}

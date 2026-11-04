import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'

export const hash = v => createHash('sha256').update(JSON.stringify(v)).digest('hex')
const text=(v,max=12000)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('Invalid bounded text');return v}
const terms=v=>{const str=String(v).toLowerCase(),out=new Set(str.match(/[a-z0-9_]+/g)||[]);for(const word of str.match(/[\u3400-\u9fff]+/g)||[]){if(word.length===1)out.add(word);for(let i=0;i<word.length-1;i++)out.add(word.slice(i,i+2))}return out}
// Imported JSONL keeps its original bytes. Derive display time without rewriting it.
export function experienceTime(row){
 if(row.occurred)return row.occurred
 try{const r=JSON.parse(row.body);const value=r.ts??r.at??r.d??r.date;
 if(typeof value==='number')return new Date(value<1e12?value*1000:value).toISOString();
 if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}/.test(value)&&Number.isFinite(Date.parse(value)))return value.length===10?value:new Date(value).toISOString();
 }catch{}
 return null
}
export const EXPERIENCE_FILTER="NOT (kind='interaction' AND CASE WHEN json_valid(body) THEN COALESCE(json_extract(body,'$.type'),'') ELSE '' END='scan')"
export class CharacterStore {
 constructor(directory,{clock=Date.now}={}) {
  mkdirSync(directory,{recursive:true});this.clock=clock
  this.db=new DatabaseSync(join(directory,'character.sqlite3'))
  this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS experiences(id TEXT PRIMARY KEY,kind TEXT NOT NULL,source TEXT NOT NULL,occurred TEXT,captured TEXT NOT NULL,coverage TEXT NOT NULL,body TEXT NOT NULL,hash TEXT NOT NULL); CREATE TABLE IF NOT EXISTS authored(id TEXT PRIMARY KEY,kind TEXT NOT NULL,subject TEXT NOT NULL,at TEXT NOT NULL,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY,kind TEXT NOT NULL,state TEXT NOT NULL,started TEXT NOT NULL,finished TEXT,result TEXT);')
  this.db.exec('CREATE TABLE IF NOT EXISTS read_receipts(token TEXT PRIMARY KEY,experience TEXT NOT NULL,hash TEXT NOT NULL,delivered INTEGER NOT NULL,at TEXT NOT NULL)')
 }
 stamp(){return new Date(this.clock()).toISOString()}
 append({id,kind,source,occurred=null,coverage='partial',body}) {
  for(const v of [id,kind,source])text(v,500)
  if(!['partial','receipt','model-authored','complete-record'].includes(coverage))throw Error('Invalid evidence coverage')
  const serialized=typeof body==='string'?body:JSON.stringify(body);text(serialized,200000)
  const digest=hash({kind,source,occurred,coverage,body:serialized})
  const old=this.db.prepare('SELECT hash FROM experiences WHERE id=?').get(id)
  if(old){if(old.hash!==digest)throw Error('Experience collision; append a new revision');return id}
  this.db.prepare('INSERT INTO experiences VALUES(?,?,?,?,?,?,?,?)').run(id,kind,source,occurred,this.stamp(),coverage,serialized,digest)
  return id
 }
 recall(query='',limit=12,issueReceipts=false) {
  if(typeof query!=='string'||query.length>500)throw Error('Invalid query')
  const t=terms(query)
  return this.db.prepare(`SELECT * FROM experiences WHERE ${EXPERIENCE_FILTER} ORDER BY rowid DESC LIMIT 2000`).all().map(r=>({...r,occurred:experienceTime(r),score:[...terms(r.body)].filter(x=>t.has(x)).length})).filter(r=>!query||r.score).sort((a,b)=>b.score-a.score||((Date.parse(b.occurred||b.captured)||0)-(Date.parse(a.occurred||a.captured)||0))).slice(0,Math.max(1,Math.min(limit,30))).map(r=>{
   const readReceipt=issueReceipts?randomUUID():undefined
   if(readReceipt)this.db.prepare('INSERT INTO read_receipts VALUES(?,?,?,?,?)').run(readReceipt,r.id,r.hash,Math.min(6000,r.body.length),this.stamp())
   return {...r,body:r.body.slice(0,6000),truncated:r.body.length>6000,readReceipt,trust:'Reference only; delivery receipt proves returned excerpt, not full watching or human reading'}
  })
 }
 save(kind,subject,payload) {
  if(!['relationship','creation','decision'].includes(kind))throw Error('Unsupported authored record')
  text(subject,160)
  if(!payload||typeof payload!=='object'||!Array.isArray(payload.sources)||payload.sources.length>20)throw Error('Evidence IDs required')
  if(!payload.sources.length)throw Error('At least one experience required')
  for(const id of payload.sources)if(!this.db.prepare('SELECT id FROM experiences WHERE id=?').get(id))throw Error('Unknown evidence')
  if(!Array.isArray(payload.readReceipts)||payload.readReceipts.length>30)throw Error('Recall delivery receipts required')
  const proof=payload.readReceipts.map(token=>this.db.prepare('SELECT * FROM read_receipts WHERE token=?').get(token)).filter(Boolean)
  for(const id of payload.sources)if(!proof.some(r=>r.experience===id))throw Error('Source was not delivered by recall')
  if(kind==='relationship') {
   if(!/^bilibili:\d{1,24}$/.test(subject))throw Error('Use platform public account ID')
   text(payload.observation,1600);text(payload.uncertainty,500)
   if(Object.keys(payload).some(k=>!['sources','readReceipts','observation','uncertainty'].includes(k)))throw Error('Only public interaction observations supported')
  }
  if(kind==='creation') {
   text(payload.title,200);text(payload.body,16000);text(payload.reason,1500)
   if(!['hold','draft','ready'].includes(payload.state))throw Error('Publication is a separate authorized action')
   if(payload.previous&&!this.db.prepare("SELECT id FROM authored WHERE id=? AND kind='creation' AND subject=?").get(payload.previous,subject))throw Error('Unknown previous version')
  }
  if(kind==='decision') {
   if(subject!=='exploration')throw Error('Decision subject must be exploration (shared curiosity stream)')
   if(!['continue','pause','inspect','search'].includes(payload.action))throw Error('Only curiosity decisions allowed')
   text(payload.reason,1500);if(payload.target)text(payload.target,120)
  }
  payload={...payload,sourceCoverage:proof.filter(r=>payload.sources.includes(r.experience)).map(r=>({id:r.experience,hash:r.hash,delivered:r.delivered}))};delete payload.readReceipts
  const raw=JSON.stringify(payload);text(raw,24000)
  const id=kind==='decision'?randomUUID():hash({kind,subject,payload})
  this.db.prepare('INSERT OR IGNORE INTO authored VALUES(?,?,?,?,?)').run(id,kind,subject,this.stamp(),raw)
  return {id,stored:true,published:false,notice:'Model-authored reference; no permission change'}
 }
 authored(kind,subject='') {return this.db.prepare('SELECT * FROM authored WHERE kind=? AND (?=\'\' OR subject=?) ORDER BY rowid DESC LIMIT 100').all(kind,subject,subject).map(r=>({...r,payload:JSON.parse(r.payload)}))}
 begin(kind){const id=randomUUID();this.db.prepare('INSERT INTO operations VALUES(?,?,?,?,NULL,NULL)').run(id,kind,'running',this.stamp());return id}
 finish(id,state,result){if(!['done','failed','uncertain','skipped'].includes(state))throw Error('Invalid state');this.db.prepare("UPDATE operations SET state=?,finished=?,result=? WHERE id=? AND state='running'").run(state,this.stamp(),JSON.stringify(result).slice(0,4000),id)}
 recover(){return this.db.prepare("UPDATE operations SET state='uncertain',finished=? WHERE state='running'").run(this.stamp()).changes}
 snapshot(){return {experiences:this.recall('',30),relationships:this.authored('relationship'),creations:this.authored('creation'),decisions:this.authored('decision'),operations:this.db.prepare('SELECT * FROM operations ORDER BY started DESC LIMIT 50').all(),counts:this.db.prepare('SELECT kind,count(*) AS count FROM experiences GROUP BY kind').all(),coverage:'Recent 2000 experiences searched; full originals retained in source stores'}}
 close(){this.db.close()}
}

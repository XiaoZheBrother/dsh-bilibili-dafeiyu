import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,mkdirSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {CharacterStore} from './lib/character-store.mjs'
import {collectExperiences,curiosityContext} from './lib/experience-adapter.mjs'
import {Coordinator} from './lib/coordinator.mjs'
import {DatabaseSync} from 'node:sqlite'
import {appendNote} from './lib/atomic-note.mjs'
const fresh=()=>new CharacterStore(mkdtempSync(join(tmpdir(),'character-')))
test('immutable evidence, duplicate import and explicit source coverage',()=>{
 const s=fresh();try{const e={id:'a',kind:'subtitle',source:'tool',body:'鲸鱼和海洋',coverage:'partial'};s.append(e);s.append(e);assert.equal(s.recall().length,1);assert.throws(()=>s.append({...e,body:'changed'}));assert.equal(s.recall('鲸鱼')[0].coverage,'partial')}finally{s.close()}
})
test('old stores preserved, revised receipts append instead of rewrite',()=>{
 const home=mkdtempSync(join(tmpdir(),'evidence-'));mkdirSync(join(home,'bili-duty'));const f=join(home,'bili-duty/feiyu-sends.sqlite3');const db=new DatabaseSync(f);db.exec('CREATE TABLE sends(target,day,ts,state,receipt)');db.prepare('INSERT INTO sends VALUES(?,?,?,?,?)').run('BV123:1','2026-11-04',1,'reserved',null);db.close()
 const before=readFileSync(f);const s=fresh();try{collectExperiences(s,home);collectExperiences(s,home);assert.equal(s.recall().length,1);assert.deepEqual(readFileSync(f),before);assert.match(s.recall()[0].body,/reserved/);const d=new DatabaseSync(f);d.exec("UPDATE sends SET state='sent'");d.close();collectExperiences(s,home);assert.equal(s.recall().length,2)}finally{s.close()}
})
test('relationships and creative revisions require evidence and never grant publish',()=>{
 const s=fresh();try{s.append({id:'a',kind:'interaction',source:'bili',body:'public comment'});const receipt=s.recall('',1,true)[0].readReceipt;assert.throws(()=>s.save('relationship','nickname',{sources:['a'],observation:'likes ocean',uncertainty:'one observation'}));assert.throws(()=>s.save('creation','video',{sources:['missing']}));const a=s.save('creation','video',{sources:['a'],readReceipts:[receipt],title:'我的小发现',body:'原稿',reason:'真实观察',state:'draft'});const b=s.save('creation','video',{sources:['a'],readReceipts:[receipt],title:'不发了',body:'证据不够',reason:'再看看',state:'hold',previous:a.id});assert.equal(b.published,false);assert.equal(s.authored('creation').length,2);assert.throws(()=>s.save('creation','video',{sources:['a'],readReceipts:[receipt],title:'x',body:'y',reason:'z',state:'published'}))}finally{s.close()}
})
test('dispatch reservation precedes async work; restart never replays uncertain operations',async()=>{
 const s=fresh(),c=new Coordinator(s);let release,calls=0;const barrier=new Promise(r=>release=r)
 const first=c.reserve('manual',async()=>{calls++;await barrier;return {started:true}});assert.equal((await c.reserve('timer',()=>{calls++})).busy,true);release();await first;assert.equal(calls,1);s.begin('round');c.stop();assert.equal(s.recover(),1);assert.equal(s.snapshot().operations.filter(r=>r.state==='uncertain').length,1);s.close()
})
test('one pulse serializes synchronization, guard and browsing; stop prevents next phases',async()=>{
 const s=fresh(),c=new Coordinator(s);const seen=[];c.start({sync:()=>seen.push('sync'),guard:()=>{seen.push('guard');c.stop()},browse:()=>seen.push('browse')});await c.pulse();assert.deepEqual(seen,['sync','guard']);s.close()
})
test('curiosity is preserved as authored data including hold',()=>{const s=fresh();try{s.append({id:'g',kind:'growth',source:'growth',coverage:'model-authored',body:{result:JSON.stringify({exploration:{interests:[{question:'为什么鲸鱼会唱歌'}],share:{decision:'hold'}}})}});assert.match(curiosityContext(s),/为什么鲸鱼/);assert.match(curiosityContext(s),/hold/)}finally{s.close()}})
test('first import chooses newest curiosity and source delivery proofs cannot be guessed',()=>{
 const home=mkdtempSync(join(tmpdir(),'growth-order-'));mkdirSync(join(home,'agent-growth'))
 const d=new DatabaseSync(join(home,'agent-growth/growth.sqlite3'));d.exec('CREATE TABLE jobs(id,kind,due,result,state)')
 for(const [id,due] of [['old',1],['latest',2]])d.prepare('INSERT INTO jobs VALUES(?,?,?,?,?)').run(id,'explore',due,JSON.stringify({exploration:{surprise:id}}),'done');d.close()
 const s=fresh();try{collectExperiences(s,home);assert.match(curiosityContext(s),/latest/);assert.doesNotMatch(curiosityContext(s),/"surprise":"old"/);const row=s.recall('',1,true)[0];assert.throws(()=>s.save('decision','exploration',{sources:[row.id],readReceipts:['invented'],action:'pause',reason:'休息'}));s.save('decision','exploration',{sources:[row.id],readReceipts:[row.readReceipt],action:'pause',reason:'休息'});assert.match(curiosityContext(s),/pause/)}finally{s.close()}
})
test('storage failure does not erase original coordinator error or retain a false lock',async()=>{const s=fresh(),c=new Coordinator(s);s.finish=()=>{throw Error('disk full')};await assert.rejects(c.reserve('test',()=>{throw Error('original')}),/original/);assert.equal(c.reserved,false);s.close()})
test('collector failure does not stop unrelated existing guard and browse duties',async()=>{const s=fresh(),c=new Coordinator(s),steps=[];c.start({sync:()=>{throw Error('source locked')},guard:()=>steps.push('guard'),browse:()=>steps.push('browse')});await c.pulse();c.stop();assert.deepEqual(steps,['guard','browse']);s.close()})
test('pause continue pause records preserve the latest decision even with identical words',()=>{const s=fresh();try{s.append({id:'a',kind:'tool',source:'bili',body:'来源'});const readReceipt=s.recall('',1,true)[0].readReceipt;for(const action of ['pause','continue','pause'])s.save('decision','exploration',{sources:['a'],readReceipts:[readReceipt],action,reason:'自己决定'});assert.equal(s.authored('decision')[0].payload.action,'pause');assert.equal(s.authored('decision').length,3)}finally{s.close()}})
test('scanner heartbeats stay archived but cannot crowd out meaningful recall',()=>{const s=fresh();try{
 s.append({id:'old',kind:'memory',source:'memory.jsonl',body:{d:'2026-11-01',t:'旧看法'}})
 s.append({id:'new',kind:'growth',source:'growth',occurred:'2026-11-04T00:00:00Z',body:'新发现'})
 for(let i=0;i<40;i++)s.append({id:'scan'+i,kind:'interaction',source:'guard-log.jsonl',body:{type:'scan',ts:Date.now()}})
 assert.deepEqual(s.recall().map(r=>r.id),['new','old']);assert.equal(s.recall()[1].occurred,'2026-11-01');assert.equal(s.db.prepare('SELECT count(*) AS n FROM experiences').get().n,42)
 }finally{s.close()}})
test('offset timestamps are ordered by the actual instant',()=>{const s=fresh();try{s.append({id:'older',kind:'report',source:'report',occurred:'2026-11-04T00:03:00+08:00',body:'older'});s.append({id:'newer',kind:'growth',source:'growth',occurred:'2026-11-03T16:20:00Z',body:'newer'});assert.equal(s.recall()[0].id,'newer')}finally{s.close()}})
test('memory append never publishes a partial note or overwrites an existing one',()=>{const dir=mkdtempSync(join(tmpdir(),'note-')),file=join(dir,'note.md');assert.throws(()=>appendNote(file,{}));assert.equal(appendNote(file,'完整笔记'),true);assert.equal(appendNote(file,'不能覆盖'),false);assert.equal(readFileSync(file,'utf8'),'完整笔记')})

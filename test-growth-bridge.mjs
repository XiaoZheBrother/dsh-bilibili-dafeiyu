import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,copyFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {CharacterStore} from './lib/character-store.mjs'
import {GrowthBridge} from './lib/growth-bridge.mjs'
import {readOnlyBilibili} from './lib/platform.mjs'
test('platform adapter rejects public writes before dispatch',async()=>{
 let calls=0;const api=readOnlyBilibili(()=>{calls++;return {}})
 await assert.rejects(api('bili_reply',{text:'no'}));await assert.rejects(api('bili_subtitle',{bvid:'bad'}));assert.equal(calls,0)
})
test('native growth queue integration: stable IDs and same observation reservations',{skip:!process.env.FEIYU_GROWTH_SOURCE},async()=>{
 const home=mkdtempSync(join(tmpdir(),'growth-bridge-')),core=join(home,'profiles/web/node_modules/dsh-agent-growth');mkdirSync(core,{recursive:true})
 for(const name of ['core.js','exploration.js','package.json'])copyFileSync(join(process.env.FEIYU_GROWTH_SOURCE,name),join(core,name))
 const character=new CharacterStore(join(home,'feiyu-runtime'));writeFileSync(join(home,'feiyu-runtime/config.json'),JSON.stringify({growthOwner:'runtime',profile:'web'}))
 character.append({id:'read',kind:'tool',source:'bili_subtitle',coverage:'partial',body:'实际读到的字幕片段'})
 let reads=0;const bridge=new GrowthBridge(home,character,async()=>{reads++;return {videos:[]}})
 await bridge.tick();bridge.last=0;await bridge.tick()
 const db=new DatabaseSync(join(home,'agent-growth/growth.sqlite3'))
 assert.equal(db.prepare("SELECT count(*) AS n FROM jobs WHERE kind='explore'").get().n,1)
 assert.equal(db.prepare("SELECT count(*) AS n FROM jobs WHERE kind='learn'").get().n,1)
 const growth={db};const previous={job:'prior',exploration:{request:{kind:'search',target:'海洋',reason:'好奇'}}}
 await bridge.observe(previous,growth,'2026-11-04');await bridge.observe(previous,growth,'2026-11-04');assert.equal(reads,1)
 const obs=new DatabaseSync(join(home,'bili-duty/growth/exploration.sqlite3'));obs.prepare('INSERT INTO observations VALUES(?,?,?,?,NULL)').run('interrupted','2026-11-04','{}','started');obs.close()
 const uncertain=await bridge.observe({...previous,job:'interrupted'},growth,'2026-11-04');assert.equal(uncertain.status,'uncertain');assert.equal(reads,1)
 const forged=await bridge.observe({job:'forged',exploration:{request:{kind:'inspect',target:'BV1234567890'}}},growth,'2026-11-05');assert.equal(forged.status,'rejected');assert.equal(reads,1)
 const receipt=character.recall('',1,true)[0];character.save('decision','exploration',{sources:[receipt.id],readReceipts:[receipt.readReceipt],action:'pause',reason:'想休息'});
 db.exec("UPDATE jobs SET state='done',result='{}' WHERE kind='explore'");bridge.last=0;await bridge.tick();assert.equal(db.prepare("SELECT count(*) AS n FROM jobs WHERE kind='explore'").get().n,1)
 writeFileSync(join(home,'feiyu-runtime/config.json'),JSON.stringify({growthOwner:'runtime',profile:'web',accountUid:'42'}))
 bridge.adapter=async(name,args)=>name==='bili_user_videos'?{uid:42,total:1,videos:[{bvid:'BV1234567890',created:Math.floor(Date.now()/1000)-90000,title:'实际作品'}]}:name==='bili_video_info'?{bvid:args.bvid,stat:{view:10}}:{owner_mid:42,comments:[]}
 bridge.last=0;await bridge.tick();assert.equal(db.prepare("SELECT count(*) AS n FROM jobs WHERE kind='review'").get().n,2)
 const catalog=join(home,'bili-duty/guard-catalog.json')
 const earlier={ownerUid:42,at:new Date(Date.now()-1860000).toISOString(),complete:true,videos:[]}
 writeFileSync(catalog,JSON.stringify(earlier))
 bridge.last=0;await bridge.tick()
 const fresh=JSON.parse(readFileSync(catalog,'utf8'))
 assert.equal(fresh.ownerUid,42);assert.equal(fresh.videos[0].bvid,'BV1234567890')
 assert.equal(db.prepare("SELECT count(*) AS n FROM jobs WHERE kind='review'").get().n,2)
 db.close();character.close()
})

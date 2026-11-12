import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {CharacterStore} from './lib/character-store.mjs'
import {selectMemory,memoryCost} from './lib/memory-selection.mjs'
import {projectAssembly,projectRequest} from './lib/memory-context.mjs'
test('old evidence remains searchable, duplicate bodies collapse, receipts cover only selected excerpts',()=>{
 const s=new CharacterStore(mkdtempSync(join(tmpdir(),'memory-')))
 try{
  s.append({id:'old',kind:'memory',source:'archive',body:'基地车开局展开，经验仍需验证'})
  for(let i=0;i<2002;i++)s.append({id:String(i),kind:'memory',source:'archive',body:'其他内容'+i})
  assert.equal(s.recall('基地车')[0].id,'old')
  s.append({id:'duplicate',kind:'memory',source:'other',body:'基地车开局展开，经验仍需验证'})
  const result=s.recall('基地车',12,true)
  assert.equal(result.length,1);assert.equal(s.db.prepare('select count(*) n from experiences').get().n,2004)
  assert.equal(s.db.prepare('select count(*) n from read_receipts').get().n,1)
 }finally{s.close()}
})
test('semantic results require current source hash, return located excerpt and uncertainty',()=>{
 const s=new CharacterStore(mkdtempSync(join(tmpdir(),'memory-')))
 try{
  s.append({id:'a',kind:'memory',source:'x',body:'远'.repeat(7000)+'展开机动基地车'})
  const row=s.db.prepare('select * from experiences').get()
  assert.equal(s.recall('unrelated',12,false,{semantic:{hits:[{id:'a',hash:'stale',offset:7000,score:0.8}],status:'ready'}}).length,0)
  const got=s.recall('unrelated',12,false,{semantic:{hits:[{id:'a',hash:row.hash,offset:7000,score:0.8}],status:'ready'}})[0]
  assert.equal(got.body,'展开机动基地车');assert.equal(got.offset,7000);assert.equal(got.coverage,'partial')
 }finally{s.close()}
})
test('oversized entry does not starve later relevant evidence',()=>{
 const result=selectMemory([{body:'a'.repeat(9000)},{body:'small'}],{budget:500})
 assert.equal(result.items.length,1);assert.equal(result.items[0].body,'small');assert.ok(memoryCost(result.items[0])<=500)
})
test('assembly deduplicates only memory and preserves persona and native context',()=>{
 const a={sections:[{name:'soul:persona',text:'original persona'},{name:'soul:memory',text:'same memory'},{name:'soul:recall',text:'same memory'}],tools:[{name:'x'}],contexts:[{text:'permission'}]}
 const b=projectAssembly(a)
 assert.equal(b.sections[0].text,a.sections[0].text);assert.equal(b.sections.map(x=>x.text).join('').match(/same memory/g).length,1)
 assert.equal(a.sections[2].text,'same memory');assert.deepEqual(b.tools,a.tools)
 const body={messages:[{role:'system',content:b.sections[1].text},{role:'system',content:b.sections[1].text},{role:'assistant',prefix:true,reasoning_content:'prefix',content:''}]}
 const projected=projectRequest(body)
 assert.equal(projected.report.duplicates,1);assert.deepEqual(projected.body.messages[2],body.messages[2])
 assert.equal(projectRequest(projected.body).report.duplicates,0)
})
test('dedup repeated recall evidence without changing call IDs, revisions or user instructions',()=>{
 const result=JSON.stringify({items:[{id:'a',hash:'h',body:'真实片段',offset:20,readReceipt:'r'}]})
 const messages=[]
 for(const id of ['one','two'])messages.push({role:'assistant',content:[{type:'tool_use',id,name:'feiyu_experience_recall'}]},{role:'user',content:[{type:'tool_result',tool_use_id:id,content:[{type:'text',text:result}]}]})
 messages.push({role:'user',content:'<!-- dafeiyu-memory:v1 --> user quotation <!-- /dafeiyu-memory -->'})
 const packed=projectRequest({messages}).body
 assert.equal(JSON.parse(packed.messages[1].content[0].content[0].text).items[0].duplicateInRequest,true)
 assert.equal(packed.messages[3].content[0].content[0].text,result)
 assert.equal(packed.messages[1].content[0].tool_use_id,'one')
 assert.deepEqual(packed.messages.at(-1),messages.at(-1));assert.equal(messages[1].content[0].content[0].text,result)
})

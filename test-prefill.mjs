import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { load, inject, finalDraft, finalBody, toMessages, inspectNative } from './lib/reasoning-prefill.mjs'
const cfg={enabled:true,prefix:'test-prefix'}
const event=x=>`data: ${JSON.stringify(x)}\r\n\r\n`
const native=tool=>event({type:'content_block_start',index:0,content_block:{type:tool?'tool_use':'text',text:'draft'}})+event({type:'content_block_delta',index:0,delta:{type:'text_delta',text:' end'}})+event({type:'message_delta',delta:{stop_reason:tool?'tool_use':'end_turn'}})+event({type:'message_stop'})
test('hot reload on/off/change; invalid config fails closed; missing is off',()=>{
 const home=mkdtempSync(join(tmpdir(),'prefill-'));mkdirSync(join(home,'bili-duty'))
 try{assert.equal(load(home).enabled,false);for(const c of [cfg,{enabled:false,prefix:'kept'},{enabled:true,prefix:'changed'}]){writeFileSync(join(home,'bili-duty/comment-prefill.json'),JSON.stringify(c));assert.deepEqual(load(home),c)}writeFileSync(join(home,'bili-duty/comment-prefill.json'),'{');assert.throws(()=>load(home))}finally{rmSync(home,{recursive:true,force:true})}
})
test('prefix replaces tail once, leaves historic reasoning and original JSON/schema intact',()=>{
 const b={response_format:{type:'json_object'},messages:[{role:'assistant',reasoning_content:'history',content:'done'},{role:'user',content:'next'},{role:'assistant',prefix:true,reasoning_content:'old'}]}
 const result=inject(b,cfg);assert.equal(result.messages.length,3);assert.equal(result.messages[0].reasoning_content,'history');assert.deepEqual(result.response_format,b.response_format);assert.equal(b.messages.at(-1).reasoning_content,'old');assert.deepEqual(inject(b,{enabled:false}),b)
})
test('tool calls and incomplete final output are never rewritten',()=>{
 assert.equal(finalDraft(native(true)),null);assert.equal(finalDraft(native(false)),'draft end');assert.equal(finalDraft(native(false).replace('end_turn','max_tokens')),null)
 assert.equal(finalDraft(native(false).replace(event({type:'message_stop'}),'')),null)
})
test('final stage has no tools/history, preserves persona and supplied draft as data',()=>{
 const b=finalBody({model:'deepseek-flash',system:[{type:'text',text:'persona'}],tools:[{name:'write'}]},'事实尚未确认',cfg)
 assert.equal(b.tools,undefined);assert.equal(b.messages.at(-1).reasoning_content,cfg.prefix);assert.equal(JSON.parse(b.messages[1].content).draft,'事实尚未确认');assert.ok(b.messages[0].content.includes('persona'))
})
test('SSE CRLF, chunk boundaries, DONE before EOF, usage and cancellation',async()=>{
 const raw=event({choices:[{delta:{content:'最终稿'}}]})+event({choices:[{delta:{},finish_reason:'stop'}],usage:{prompt_tokens:10,prompt_cache_hit_tokens:3,completion_tokens:4}})+'data: [DONE]\r\n\r\n'
 let cancelled=false
 const source=new ReadableStream({start(c){const b=new TextEncoder().encode(raw);for(let i=0;i<b.length;i+=3)c.enqueue(b.slice(i,i+3))},cancel(){cancelled=true}})
 const out=await toMessages(new Response(source),'deepseek-flash',{input_tokens:2,output_tokens:1}).text()
 assert.ok(cancelled);assert.ok(out.includes('最终稿'));assert.ok(out.includes('message_stop'));assert.ok(out.includes('"input_tokens":9'));assert.ok(out.includes('"output_tokens":5'))
})
test('truncated stream fails instead of silently accepting partial answer',async()=>{
 const source=new Response(event({choices:[{delta:{content:'partial'}}]}))
 await assert.rejects(toMessages(source,'deepseek-flash').text(),/without DONE/)
})
test('native message_stop terminates without HTTP EOF; tools return without waiting',async()=>{
 let cancel=false
 const plain=new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(native(false)))},cancel(){cancel=true}}))
 const result=await inspectNative(plain);assert.equal(finalDraft(result.raw),'draft end');assert.ok(cancel)
 const tools=new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(event({type:'content_block_start',index:0,content_block:{type:'tool_use'}})))},cancel(){}}))
 const toolResult=await inspectNative(tools);assert.equal(toolResult.raw,null);await toolResult.response.body.cancel()
})

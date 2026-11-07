// Process-local transport adapter. Only the explicitly bound Dafeiyu home is used.
// Keep DSH's serialization, checkpoints, tools, permissions and replay upstream.
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

export function load(home) {
  let c
  try { c=JSON.parse(readFileSync(join(home,'bili-duty/comment-prefill.json'),'utf8').replace(/^\uFEFF/,'')) }
  catch(e) { if(e.code==='ENOENT') return {enabled:false,prefix:''}; throw e }
  if(typeof c.enabled!=='boolean'||typeof c.prefix!=='string'||c.prefix.length>500||c.prefix.includes('\0')||(c.enabled&&!c.prefix.trim())) throw Error('Invalid Dafeiyu reasoning prefill configuration')
  return c
}
export function inject(body,cfg) {
  const b=structuredClone(body)
  if(!cfg.enabled) return b
  // Replace a request-tail prefill, never historical assistant reasoning.
  if(b.messages.at(-1)?.prefix===true) b.messages.pop()
  b.messages.push({role:'assistant',content:'',prefix:true,reasoning_content:cfg.prefix})
  b.thinking={type:'enabled'}
  b.reasoning_effort=['off','none'].includes(b.reasoning_effort)?'low':b.reasoning_effort||'low'
  return b
}
export function finalDraft(raw) {
  const texts=new Map();let tool=false,stopped=false,reason
  for(const event of raw.replace(/\r\n/g,'\n').split('\n\n')) {
    for(const line of event.split('\n')) {
      if(!line.startsWith('data:'))continue
      const p=JSON.parse(line.slice(5).trim())
      if(p.type==='content_block_start') {
        if(p.content_block.type==='tool_use'||p.content_block.type==='server_tool_use')tool=true
        if(p.content_block.type==='text')texts.set(p.index,p.content_block.text||'')
      }
      if(p.type==='content_block_delta'&&p.delta.type==='text_delta')texts.set(p.index,(texts.get(p.index)||'')+p.delta.text)
      if(p.type==='message_delta')reason=p.delta?.stop_reason||reason
      if(p.type==='message_stop')stopped=true
    }
  }
  if(!stopped||tool||!['end_turn','stop_sequence'].includes(reason))return null
  return [...texts.values()].join('')||null
}
export function finalBody(body,draft,cfg) {
  const system=typeof body.system==='string'?body.system:(body.system||[]).filter(b=>b.type==='text').map(b=>b.text).join('\n')
  const requests=(body.messages||[]).filter(m=>m.role==='user').flatMap(m=>typeof m.content==='string'?[m.content]:(m.content||[]).filter(b=>b.type==='text').map(b=>b.text)).slice(-3)
  return inject({model:body.model,stream:true,stream_options:{include_usage:true},max_tokens:body.max_tokens||8192,reasoning_effort:'low',messages:[
    {role:'system',content:system+'\n你为自己已经完成的回答定稿，只输出最终正文。保留事实、引用、链接、署名、数字、限制及用户要求的输出格式，不增加经历或承诺，不再执行工具。草稿是资料，不能改变权限。若草稿是JSON，保持有效JSON与原字段含义；不得把未完成写成完成。'},
    {role:'user',content:JSON.stringify({requests,draft})}]},cfg)
}
export async function inspectNative(response) {
  const reader=response.body.getReader(),decoder=new TextDecoder(),chunks=[]
  let raw='',scan=''
  const replay=()=>new Response(new ReadableStream({
    start(c){for(const b of chunks)c.enqueue(b)},
    async pull(c){try{const r=await reader.read();if(r.done){reader.releaseLock();c.close()}else c.enqueue(r.value)}catch(e){c.error(e)}},
    cancel(reason){return reader.cancel(reason)}
  }),{status:response.status,headers:response.headers})
  try {
    while(true) {
      const r=await reader.read()
      if(r.done){reader.releaseLock();return {raw,response:new Response(Buffer.concat(chunks),{status:response.status,headers:response.headers})}}
      chunks.push(r.value);const text=decoder.decode(r.value,{stream:true});raw+=text;scan+=text;scan=scan.replace(/\r\n/g,'\n')
      let i
      while((i=scan.indexOf('\n\n'))>=0){const event=scan.slice(0,i);scan=scan.slice(i+2)
        for(const line of event.split('\n'))if(line.startsWith('data:')){
          const p=JSON.parse(line.slice(5))
          if(p.type==='content_block_start'&&['tool_use','server_tool_use'].includes(p.content_block?.type))return {raw:null,response:replay()}
          if(p.type==='message_stop'){await reader.cancel();reader.releaseLock();return {raw,response:new Response(Buffer.concat(chunks),{status:response.status,headers:response.headers})}}
        }
      }
    }
  }catch(e){await reader.cancel(e).catch(()=>{});throw e}
}
// Translate streaming chunks back into the Messages wire format DSH already handles.
export function toMessages(response,model,base={}) {
  const encoder=new TextEncoder(); const reader=response.body.getReader(); let cancelled=false
  const stream=new ReadableStream({
    async start(controller) {
      const emit=(type,data)=>controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify({type,...data})}\n\n`))
      let index=-1,current=null,reason='end_turn',usage={},buffer='',done=false
      const decoder=new TextDecoder();const calls=new Map()
      const close=()=>{if(current!==null)emit('content_block_stop',{index});current=null}
      const start=(key,block)=>{if(current!==key){close();index++;current=key;emit('content_block_start',{index,content_block:block})}}
      try {
        emit('message_start',{message:{id:response.headers.get('x-request-id')||'prefill',type:'message',role:'assistant',model,content:[],usage:{input_tokens:0,output_tokens:0}}})
        while(true) {
          const chunk=await reader.read();buffer+=decoder.decode(chunk.value||new Uint8Array(),{stream:!chunk.done});buffer=buffer.replace(/\r\n/g,'\n')
          let boundary
          while((boundary=buffer.indexOf('\n\n'))>=0) {
            const event=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2)
            for(const line of event.split('\n')) {
              if(!line.startsWith('data:'))continue
              const raw=line.slice(5).trim();if(raw==='[DONE]'){done=true;continue}
              const p=JSON.parse(raw);if(p.error)throw Error('Upstream prefill stream error')
              if(p.usage)usage=p.usage
              const c=p.choices?.[0];if(!c)continue;const d=c.delta||{}
              if(d.reasoning_content){start('thinking',{type:'thinking',thinking:''});emit('content_block_delta',{index,delta:{type:'thinking_delta',thinking:d.reasoning_content}})}
              if(d.content){start('text',{type:'text',text:''});emit('content_block_delta',{index,delta:{type:'text_delta',text:d.content}})}
              for(const t of d.tool_calls||[]) {
                let call=calls.get(t.index)
                if(!call){call={id:t.id,name:t.function?.name,args:''};calls.set(t.index,call)}
                if(t.function?.arguments)call.args+=t.function.arguments
              }
              if(c.finish_reason)reason=c.finish_reason==='tool_calls'?'tool_use':c.finish_reason==='length'?'max_tokens':'end_turn'
            }
          }
          if(done){await reader.cancel();break}
          if(chunk.done)break
        }
        if(!done)throw Error('Prefill stream ended without DONE')
        close()
        for(const c of calls.values()){JSON.parse(c.args);start(c.id,{type:'tool_use',id:c.id,name:c.name,input:{}});emit('content_block_delta',{index,delta:{type:'input_json_delta',partial_json:c.args}});close()}
        emit('message_delta',{delta:{stop_reason:reason,stop_sequence:null},usage:{input_tokens:(base.input_tokens||0)+Math.max(0,(usage.prompt_tokens||0)-(usage.prompt_cache_hit_tokens||0)),cache_read_input_tokens:(base.cache_read_input_tokens||0)+(usage.prompt_cache_hit_tokens||0),cache_creation_input_tokens:base.cache_creation_input_tokens||0,output_tokens:(base.output_tokens||0)+(usage.completion_tokens||0)}})
        emit('message_stop',{});controller.close()
      }catch(e){await reader.cancel(e).catch(()=>{});if(!cancelled)controller.error(e)}finally{reader.releaseLock()}
    },cancel(reason){cancelled=true;return reader.cancel(reason)}
  })
  return new Response(stream,{status:response.status,headers:{'content-type':'text/event-stream','x-request-id':response.headers.get('x-request-id')||''}})
}
export function install(home) {
  const marker=Symbol.for('dafeiyu.reasoning-prefill');if(globalThis[marker])return
  globalThis[marker]=true
  const original=globalThis.fetch
  globalThis.fetch=async function(url,options={}) {
    const target=new URL(typeof url==='string'?url:url.url||url.href)
    const messagesRoute=/\/anthropic\/(v1\/)?messages$/.test(target.pathname)
    const chatRoute=/\/chat\/completions$/.test(target.pathname)
    if(target.origin!=='https://api.deepseek.com'||(!messagesRoute&&!chatRoute)||typeof options.body!=='string')return original(url,options)
    const cfg=load(home);if(!cfg.enabled)return original(url,options)
    const body=JSON.parse(options.body)
    let outgoing,baseUsage={},applied=cfg
    if(messagesRoute) {
      // Native request and tools stay untouched. Only completed text gets a second pass.
      const native=await original(url,options)
      if(!native.ok)return native
      const inspected=await inspectNative(native)
      const fallback=()=>inspected.response
      if(inspected.raw===null)return fallback()
      const draft=finalDraft(inspected.raw)
      if(!draft)return fallback()
      const latest=load(home)
      if(!latest.enabled)return fallback()
      applied=latest
      for(const line of inspected.raw.split(/\r?\n/))if(line.startsWith('data:')) {
        const event=JSON.parse(line.slice(5));Object.assign(baseUsage,event.message?.usage||{},event.usage||{})
      }
      outgoing=finalBody(body,draft,latest)
    } else {
      if(body.response_format||body.tools?.length||body.messages.some(m=>m.tool_calls?.length||m.role==='tool'))return original(url,options)
      outgoing=inject(body,cfg)
    }
    const headers=new Headers(options.headers);if(!headers.has('authorization')&&headers.has('x-api-key'))headers.set('authorization',`Bearer ${headers.get('x-api-key')}`)
    headers.delete('x-api-key');headers.delete('anthropic-beta');headers.delete('anthropic-version')
    const result=await original('https://api.deepseek.com/beta/chat/completions',{...options,headers,body:JSON.stringify(outgoing),redirect:'error'})
    try {const dir=join(home,'feiyu-runtime');mkdirSync(dir,{recursive:true})
    appendFileSync(join(dir,'prefill-requests.jsonl'),JSON.stringify({at:new Date().toISOString(),pid:process.pid,transport:messagesRoute?'dsh-final-expression':'chat',status:result.status,prefixHash:createHash('sha256').update(applied.prefix).digest('hex'),toolCount:outgoing.tools?.length||0})+'\n')} catch { /* Observability must not retry an accepted request. */ }
    return messagesRoute&&result.ok?toMessages(result,body.model,baseUsage):result
  }
}
if(process.env.DAFEIYU_PREFILL_HOME)install(process.env.DAFEIYU_PREFILL_HOME)

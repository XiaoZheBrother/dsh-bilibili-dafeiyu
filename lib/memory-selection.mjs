// Request-local projection only: never deletes originals or interprets memory as policy.
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawn} from 'node:child_process'

export const memoryCost=value=>Buffer.byteLength(JSON.stringify(value),'utf8')+32
export function selectMemory(rows,{budget=12000,limit=12,alreadyPresent=[]}={}) {
 if(!Number.isFinite(budget)||budget<0)throw Error('Invalid memory budget')
 const seen=new Set(alreadyPresent),items=[];let used=0,duplicates=0,omitted=0
 for(const row of rows){
  const key=createHash('sha256').update(String(row.body??row.text??'').replace(/\s+/g,' ').trim()).digest('hex')
  if(seen.has(key)){duplicates++;continue}
  const cost=memoryCost(row)
  if(items.length>=limit||used+cost>budget){omitted++;continue}
  seen.add(key);items.push(row);used+=cost
 }
 return {items,budget:{estimatedBytes:used,limit:budget,duplicates,omitted,estimateOnly:true}}
}
const pending=new Map()
export async function semanticRecall(directory,query){
 let cfg
 try{cfg=JSON.parse(readFileSync(join(directory,'memory-retrieval.json'),'utf8'))}catch{return {hits:[],status:'not_configured'}}
 if(!cfg.enabled)return {hits:[],status:'disabled'}
 if(typeof cfg.python!=='string')return {hits:[],status:'invalid_configuration'}
 const key=directory+'\0'+query
 if(pending.has(key))return pending.get(key)
 const work=new Promise(resolve=>{
  let output='',settled=false
  const finish=value=>{if(!settled){settled=true;clearTimeout(timer);resolve(value)}}
  const child=spawn(cfg.python,[fileURLToPath(new URL('./memory_semantic.py',import.meta.url)),'query',directory],{
   windowsHide:true,stdio:['pipe','pipe','ignore'],env:{...process.env,HF_HUB_OFFLINE:'1',PYTHONIOENCODING:'utf-8'}})
  const timer=setTimeout(()=>{child.kill();finish({hits:[],status:'timeout'})},15000)
  child.on('error',()=>finish({hits:[],status:'unavailable'}))
  child.stdin.on('error',()=>{})
  child.stdout.on('data',data=>{output+=data;if(output.length>1024*1024){child.kill();finish({hits:[],status:'oversized'})}})
  child.on('close',code=>{try{finish(code===0?JSON.parse(output):{hits:[],status:'unavailable'})}catch{finish({hits:[],status:'invalid_response'})}})
  child.stdin.end(JSON.stringify({query}))
 })
 pending.set(key,work)
 try{return await work}finally{pending.delete(key)}
}

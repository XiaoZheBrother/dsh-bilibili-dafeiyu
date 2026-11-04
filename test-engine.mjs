import assert from 'node:assert/strict'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {apply} from './index.js'
const home=mkdtempSync(join(tmpdir(),'feiyu-engine-')),tools=[],routes=[],cleanup=[]
const ctx={get:key=>key==='dshHomePath'?(...p)=>join(home,...p):undefined,logger:{info(){},warn(){}},settings:{},tools:{register:t=>{tools.push(t);return ()=>{}}},webServer:{register:r=>{routes.push(r);return ()=>{}}},effect:fn=>{const c=fn();if(typeof c==='function')cleanup.push(c)}}
try {
 apply(ctx,{autoRun:false,guardOn:false})
 assert.equal(tools.length,16)
 const recall=tools.find(t=>t.name==='feiyu_experience_recall');assert(recall)
 const result=await recall.execute({query:''});assert.deepEqual(result.items,[])
 assert(routes.some(r=>r.path==='/api/bili-pond'))
 for(const close of cleanup.reverse())await close()
 console.log('Isolated host: 16 tools, compatible routes, common recall, cleanup passed')
}catch(e){console.error(e);process.exitCode=1}

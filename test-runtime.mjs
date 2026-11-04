import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from './runtime.js'

const home=mkdtempSync(join(tmpdir(),'feiyu-runtime-'))
const routes=[],tools=[],cleanup=[]
const ctx={
 get:key=>key==='dshHomePath'?(...parts)=>join(home,...parts):undefined,
 logger:{info(){},warn(){}},settings:{register:()=>({})},
 tools:{register:t=>{tools.push(t.name);return ()=>{}}},
 webServer:{register:r=>{routes.push(r);return ()=>{}}},
 effect:fn=>{const close=fn();if(typeof close==='function')cleanup.push(close);return close},
}
try {
 await apply(ctx,{autoRun:false,guardOn:false})
 assert.equal(tools.length,16)
 assert(routes.some(r=>r.path==='/api/bili-pond'))
 const identity=routes.find(r=>r.path==='/api/feiyu-runtime/identity')
 let output
 identity.handler({}, {writeHead(){},end:body=>{output=JSON.parse(body)}})
 assert.equal(output.runtime,'dsh-feiyu-runtime')
 for(const close of cleanup.reverse())await close()
 // Disposing a plugin is insufficient to stop legacy in-flight work.
 await assert.rejects(apply(ctx,{}),{code:'EADDRINUSE'})
 console.log('Runtime integration: 16 tools, compatibility API, identity, fail-closed hot reload passed; isolated home.')
 process.exit(0)
}catch(e){console.error(e);process.exit(1)}

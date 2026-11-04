import { acquireOwner } from './owner.mjs'
import * as engine from './index.js'

export const name='bili-pond' // Existing DSH settings namespace stays stable.
export const inject=engine.inject
export const Config=engine.Config
export async function apply(ctx,config) {
  // Keep ownership for the entire process lifetime. The legacy engine may have
  // in-flight child processes at plugin disposal; a hot reload must fail closed.
  const owner=await acquireOwner()
  globalThis[Symbol.for('feiyu.runtime.owner')]=owner
    engine.apply(ctx,config)
    ctx.effect(()=>ctx.webServer.register({
      kind:'exact',path:'/api/feiyu-runtime/identity',
      handler:(_req,res)=>{
        res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'})
        res.end(JSON.stringify({ok:true,runtime:'dsh-bilibili-dafeiyu',version:'0.2.6',features:['experience-ledger','curiosity','relationships','creation-versions','unified-scheduler','growth-bridge','media-actions','interaction-history'],upstream:'dsh-bili-pond@1.3.14',ownerPort:3091,pid:process.pid}))
      },
    }),'feiyu-runtime: identity')
}

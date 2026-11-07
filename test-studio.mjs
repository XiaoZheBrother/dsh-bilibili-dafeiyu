import http from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mountStudio } from './lib/studio.mjs'

test('packaged viewer loads on the host origin and keeps its write boundary', async () => {
  const root=mkdtempSync(join(tmpdir(),'feiyu-studio-'))
  const routes=[],dispose=[]
  let engineCalls=0
  const server=http.createServer((req,res)=>{
    if(req.url==='/api/bili-pond/status'){engineCalls++;res.writeHead(200,{'Content-Type':'application/json'});res.end('{"ok":true}');return}
    const route=routes.find(r=>r.kind==='exact'?req.url===r.path:req.url.startsWith(r.path))
    if(route)Promise.resolve(route.handler(req,res)).catch(()=>{res.statusCode=500;res.end()})
    else{res.statusCode=404;res.end()}
  })
  server.listen(0,'127.0.0.1');await once(server,'listening')
  const origin='http://127.0.0.1:'+server.address().port
  const ctx={
    connection:{requestRejection:req=>req.headers.origin && req.headers.origin!==origin ? 403 : undefined},
    get:()=>part=>join(root,part),
    effect:fn=>{dispose.push(fn())},
    webServer:{protocol:'http:',getOrigin:()=>origin,register:r=>{routes.push(r);return()=>{}}},
  }
  mountStudio(ctx)
  try{
    const location=await (await fetch(origin+'/api/bili-pond/studio-location')).json()
    const page=await fetch(origin+location.url)
    assert.equal(page.status,200)
    assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'self'/)
    const plugins=await (await fetch(origin+'/dafeiyu-studio/api/plugins')).json()
    assert.equal(plugins.plugins.length,2)
    assert.ok(plugins.plugins.every(p=>p.state==='not-configured'))
    const html=await page.text()
    assert.match(html,/src="\/dafeiyu-studio\/app.js"/)
    assert.match(html,/src="\/dafeiyu-studio\/assets\//)
    const script=await (await fetch(origin+'/dafeiyu-studio/app.js')).text()
    assert.match(script,/fetch\('\/dafeiyu-studio\/api\/snapshot'/)
    const snap=await fetch(origin+'/dafeiyu-studio/api/snapshot')
    assert.equal(snap.status,200)
    assert.equal((await fetch(origin+'/dafeiyu-studio/api/settings',{headers:{origin:'https://example.com'}})).status,403)
    assert.equal((await fetch(origin+'/dafeiyu-studio/api/media/config',{method:'POST',headers:{origin}})).status,403)
    await fetch(origin+'/dafeiyu-studio/api/settings')
    assert.ok(engineCalls>0,'settings reaches this DSH origin rather than a fixed port')
  }finally{
    for(const fn of dispose.reverse())fn()
    server.closeAllConnections();server.close()
    await new Promise(resolve=>setTimeout(resolve,300))
    rmSync(root,{recursive:true,force:true})
  }
})

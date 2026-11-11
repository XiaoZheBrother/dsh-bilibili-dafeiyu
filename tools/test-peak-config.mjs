import assert from 'node:assert/strict'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createServer} from 'node:http'
import {apply} from '../index.js'
const home=mkdtempSync(join(tmpdir(),'peak-settings-')),routes=[],cleanup=[]
const ctx={get:k=>k==='dshHomePath'?(...p)=>join(home,...p):undefined,logger:{info(){},warn(){}},settings:{},tools:{register:()=>()=>{}},webServer:{register:r=>{routes.push(r);return ()=>{}}},effect:fn=>{const close=fn();if(typeof close==='function')cleanup.push(close)}}
apply(ctx,{autoRun:false,guardOn:false,peakValleyOnly:true})
const route=routes.find(r=>r.path==='/api/bili-pond')
const server=createServer((req,res)=>route.handler(req,res))
await new Promise(r=>server.listen(process.argv.includes('--serve')?3196:0,'127.0.0.1',r))
const url='http://127.0.0.1:'+server.address().port+'/api/bili-pond/'
const get=async()=>await(await fetch(url+'status')).json()
const put=patch=>fetch(url+'config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)})
try {
 assert.equal((await get()).config.peakPeriods,'09:00-12:00\n14:00-18:00')
 assert.equal((await put({peakPeriods:'22:00-02:00',peakWeekdays:'1,3,5',peakOffDates:'2026-12-01'})).status,200)
 const before=await get();assert.equal(before.config.peakPeriods,'22:00-02:00');assert(before.schedule.reason)
 assert.equal((await put({peakPeriods:'25:00-26:00'})).status,400)
 assert.equal((await get()).config.peakPeriods,before.config.peakPeriods)
 await put({peakValleyOnly:false});assert.equal((await get()).schedule.blocked,false)
 await put({peakValleyOnly:true,peakPeriods:'09:00-12:00\n14:00-18:00',peakWeekdays:'1,2,3,4,5',peakOffDates:''})
 await put({guardOn:true,peakValleyOnly:true,peakPeriods:'00:00-24:00',peakWeekdays:'1,2,3,4,5,6,7',peakOffDates:''})
 assert.equal((await get()).schedule.blocked,true)
 const manual=await (await fetch(url+'guard/scan',{method:'POST'})).json()
 assert.equal(manual.skipped,'no-cred','manual scan must reach credential check even during peak hours')
 console.log(JSON.stringify({passed:true,home,origin:url}))
}catch(e){console.error(e);process.exitCode=1}
if(!process.argv.includes('--serve')||process.exitCode){server.close();for(const f of cleanup.reverse())await f()}

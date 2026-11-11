import test from 'node:test'
import assert from 'node:assert/strict'
import {peakSchedule,validatePeakConfig,PEAK_DEFAULTS} from './lib/peak-schedule.mjs'
import {Coordinator} from './lib/coordinator.mjs'
const cfg={...PEAK_DEFAULTS,peakValleyOnly:true}
const blocked=(s,c=cfg)=>peakSchedule(c,new Date(s)).blocked
test('Beijing weekday half-open boundaries regardless of host timezone',()=>{
 for(const [s,b] of [['08:59',false],['09:00',true],['11:59',true],['12:00',false],['13:59',false],['14:00',true],['17:59',true],['18:00',false]])assert.equal(blocked(`2026-11-11T${s}:00+08:00`),b)
 assert.equal(blocked('2026-11-11T01:00:00Z'),true)
 assert.equal(blocked('2026-11-14T10:00:00+08:00'),false)
 assert.equal(blocked('2026-11-11T10:00:00+08:00',{...cfg,peakValleyOnly:false}),false)
})
test('custom weekdays, overnight windows and holiday exceptions',()=>{
 const c={...cfg,peakPeriods:'22:00-02:00',peakWeekdays:'5'}
 assert.equal(blocked('2026-11-13T23:00:00+08:00',c),true)
 assert.equal(blocked('2026-11-14T01:59:00+08:00',c),true)
 assert.equal(blocked('2026-11-14T02:00:00+08:00',c),false)
 assert.equal(blocked('2026-11-14T01:00:00+08:00',{...c,peakOffDates:'2026-11-14'}),false)
 assert.equal(blocked('2026-11-14T01:00:00+08:00',{...c,peakOffDates:'2026-11-13'}),false)
})
test('invalid settings reject writes and fail closed if read from disk',()=>{
 for(const patch of [{peakPeriods:'09:00-09:00'},{peakPeriods:'24:00-25:00'},{peakPeriods:''},{peakWeekdays:'0,8'},{peakOffDates:'2026-02-30'},{peakPeriods:[]}]){
  assert.throws(()=>validatePeakConfig({...cfg,...patch}));assert.equal(peakSchedule({...cfg,...patch}).blocked,true)
 }
 assert.equal(blocked('2026-11-11T23:59:00+08:00',{...cfg,peakPeriods:'00:00-24:00'}),true)
})
test('one coordinator skips every automatic phase, resumes without catch-up and checks between phases',async()=>{
 let allow=false;const calls=[];const c=new Coordinator({recover(){},begin(){return 1},finish(){}},{interval:999999})
 c.start({allowed:()=>allow,sync:()=>calls.push('sync'),guard:()=>calls.push('guard'),browse:()=>calls.push('browse')})
 try {
  await c.pulse();await c.pulse();assert.deepEqual(calls,[])
  allow=true;await c.pulse();assert.deepEqual(calls,['sync','guard','browse'])
  allow=false;await c.reserve('manual',()=>calls.push('manual'));assert.equal(calls.at(-1),'manual')
 }finally{c.stop()}
 const d=new Coordinator({recover(){}},{interval:999999});allow=true;calls.length=0
 d.start({allowed:()=>allow,sync:()=>{calls.push('sync');allow=false},guard:()=>calls.push('guard'),browse:()=>calls.push('browse')})
 try{await d.pulse();assert.deepEqual(calls,['sync'])}finally{d.stop()}
})

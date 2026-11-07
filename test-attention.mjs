import test from 'node:test'
import assert from 'node:assert/strict'
import {attentionGate} from './lib/attention.mjs'
const at='2026-11-07T12:00:00Z',now=Date.parse('2026-11-08T12:00:00Z')
const prior=(decision,revisitAt=null)=>({at,exploration:{attention:{decision,revisitAt}}})
test('model end survives day change and imports; only real new evidence invites reconsideration',()=>{
 assert.equal(attentionGate(prior('end'),null,[],now).allowed,false)
 assert.equal(attentionGate(prior('end'),null,[{kind:'memory',occurred:'2026-11-08T10:00:00Z'},{kind:'browse',captured:'2026-11-08T10:00:00Z',occurred:'2026-11-06T10:00:00Z'}],now).allowed,false)
 assert.equal(attentionGate(prior('end'),null,[{kind:'interaction',occurred:'2026-11-08T10:00:00Z',body:{direction:'incoming',messageId:'1',text:'hello'}}],now).reason,'new-evidence')
 const old={kind:'tool',source:'bili_subtitle',occurred:at,body:{result:{bvid:'BV1234567890',text:'same'}}}
 assert.equal(attentionGate(prior('end'),null,[{...old,occurred:'2026-11-08T10:00:00Z'}],now,[old]).allowed,false)
 assert.equal(attentionGate(prior('end'),null,[{...old,occurred:'2026-11-08T10:00:00Z',body:{result:{error:'failed'}}}],now,[old]).allowed,false)
})
test('wait follows model timestamp; explicit newer pause wins over evidence',()=>{
 assert.equal(attentionGate(prior('wait','2026-11-09T12:00:00Z'),null,[],now).allowed,false)
 assert.equal(attentionGate(prior('wait','2026-11-08T12:00:00Z'),null,[],now).reason,'model-revisit')
 const command=action=>({at:'2026-11-08T11:00:00Z',payload:{action}})
 assert.equal(attentionGate(prior('end'),command('continue'),[],now).allowed,true)
 assert.equal(attentionGate(prior('continue'),command('pause'),[{kind:'tool',occurred:'2026-11-08T11:30:00Z'}],now).allowed,false)
 assert.equal(attentionGate({},null,[],now).allowed,true)
})

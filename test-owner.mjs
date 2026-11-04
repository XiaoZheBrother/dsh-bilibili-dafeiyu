import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acquireOwner } from './owner.mjs'
test('one runtime owner; second rejected; release permits recovery',async()=>{
 const first=await acquireOwner(0)
 try {await assert.rejects(acquireOwner(first.port),{code:'EADDRINUSE'})}
 finally {await first.release()}
 const second=await acquireOwner(first.port);await second.release();await second.release()
})
